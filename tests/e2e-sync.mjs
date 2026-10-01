// Account sync end-to-end: the real extension in Chromium talking to a fake Supabase (auth refresh + PostgREST).
// Run: node tests/e2e-sync.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve("dist");
const PORT = 54322;
const URL_ = `http://127.0.0.1:${PORT}`;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// ---- fake Supabase ----
let clock = now; // server clock for synced_at (strictly increasing)
let nextId = 1;
const remote = new Map(); // key -> row
const logs = [];
const calls = [];
let refreshCount = 0;
let validToken = "access-1";

const send = (res, code, body, extra = {}) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...extra });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, URL_);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "OPTIONS") return send(res, 204);
    if (u.pathname === "/auth/v1/token") {
      refreshCount++;
      validToken = `access-${refreshCount + 1}`;
      return send(res, 200, { access_token: validToken, refresh_token: `refresh-${refreshCount + 1}`, expires_in: 3600, user: { id: "user-1", email: "me@test.dev" } });
    }
    if (req.headers.authorization !== `Bearer ${validToken}`) return send(res, 401, { message: "bad token" });
    const table = u.pathname.replace("/rest/v1/", "");
    calls.push({ method: req.method, table, query: u.search, body: body ? JSON.parse(body) : null });
    if (table === "words" && req.method === "GET") {
      let rows = [...remote.values()].sort((a, b) => a.synced_at.localeCompare(b.synced_at));
      const f = u.searchParams.get("synced_at");
      if (f) rows = rows.filter((r) => r.synced_at >= f.replace("gte.", ""));
      const off = Number(u.searchParams.get("offset") ?? 0), lim = Number(u.searchParams.get("limit") ?? 1000);
      return send(res, 200, rows.slice(off, off + lim));
    }
    if (table === "words" && req.method === "POST") {
      const out = JSON.parse(body).map((r) => {
        const k = r.text.toLowerCase();
        const row = { ...(remote.get(k) ?? { id: `id-${nextId++}`, context: null, url: null, definition: null }), ...r, synced_at: iso((clock += 1000)) };
        remote.set(k, row);
        return row;
      });
      return send(res, 201, out);
    }
    if (table === "review_logs" && req.method === "POST") {
      logs.push(...JSON.parse(body));
      return send(res, 201, undefined);
    }
    send(res, 404, {});
  });
}).listen(PORT);

const serverRow = (text, over = {}) => ({
  id: `id-${nextId++}`, text, translation: `tr-${text}`, context: null, url: null, definition: null, box: 0,
  due: iso(now), reps: 0, lapses: 0, created_at: iso(now - 50_000), updated_at: iso(now - 10_000), deleted_at: null, synced_at: iso((clock += 1000)), ...over,
});

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) failed++; };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pw-")), {
  headless: false,
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  check("extension has the fixed ID (needed for the OAuth redirect URL)", extId === "gmkdjaeaeoiendclnaljkeomjcopgalj", extId);

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/vocab.html`);
  const msg = (m) => page.evaluate((m) => chrome.runtime.sendMessage(m), m);
  const words = () => sw.evaluate(async () => (await chrome.storage.local.get("words")).words ?? []);
  const state = () => sw.evaluate(async () => (await chrome.storage.local.get("sync")).sync ?? {});

  // Legacy local words (saved before sync existed: no sync fields) + server state
  await sw.evaluate(async ({ now }) => {
    await chrome.storage.local.set({
      devSupabase: { url: "http://127.0.0.1:54322", key: "pub" },
      words: [
        { text: "serendipity", translation: "serendipia", url: "https://x.com", savedAt: now - 90_000, box: 1, due: now + 86_400_000 },
        { text: "ubiquitous", translation: "viejo", url: "", savedAt: now - 80_000 },
      ],
    });
  }, { now });
  remote.set("ephemeral", serverRow("ephemeral"));
  remote.set("ubiquitous", serverRow("ubiquitous", { translation: "omnipresente", updated_at: iso(now) })); // newer than local

  // 1) not connected: sync is a no-op
  let r = await msg({ type: "sync" });
  check("not connected → sync does nothing and does not call the server", r.ok && calls.length === 0);

  // 2) connect (fake session, token already expired → must refresh before calling the API)
  await sw.evaluate(() => chrome.storage.local.set({ auth: { access_token: "stale", refresh_token: "refresh-1", expires_at: Math.floor(Date.now() / 1000) - 10, user_id: "user-1", email: "me@test.dev" } }));
  r = await msg({ type: "sync" });
  check("expired token is refreshed first", r.ok && refreshCount === 1, JSON.stringify(r));

  let local = await words();
  const byText = (t) => local.find((w) => w.text === t);
  check("pull: server-only word arrives", !!byText("ephemeral") && byText("ephemeral").remoteId);
  check("merge: newer server version wins (ubiquitous)", byText("ubiquitous")?.translation === "omnipresente" && byText("ubiquitous").dirty === false);
  const push = calls.find((c) => c.method === "POST" && c.table === "words" && c.query.includes("on_conflict=user_id,text_key"));
  check("push: only the local-only change is uploaded", push && push.body.length === 1 && push.body[0].text === "serendipity", JSON.stringify(push?.body?.map((b) => b.text)));
  check("push: payload carries progress and dates", push?.body[0].box === 1 && push.body[0].created_at && push.body[0].deleted_at === null);
  check("push: word is marked synced with its server id", byText("serendipity")?.dirty === false && !!byText("serendipity").remoteId);
  check("sync state records success", !!(await state()).lastSyncAt && !(await state()).error);

  // 3) review answer → local progress + auto sync (update and review log)
  calls.length = 0;
  await msg({ type: "answer", key: "serendipity", known: true });
  await page.waitForFunction(() => true);
  for (let i = 0; i < 40 && !logs.length; i++) await new Promise((r) => setTimeout(r, 250));
  local = await words();
  check("answer: box advanced locally", byText("serendipity")?.box === 2 && byText("serendipity").reps === 1);
  check("answer: change is pushed automatically", remote.get("serendipity")?.box === 2 && remote.get("serendipity")?.reps === 1, `remote box=${remote.get("serendipity")?.box}`);
  check("answer: review log reaches the server with the word id", logs.length === 1 && logs[0].known === true && logs[0].word_id === remote.get("serendipity").id);

  // 4) change made on the server (e.g. in the web app) → pulled
  remote.set("ephemeral", { ...remote.get("ephemeral"), translation: "efímero", updated_at: iso(Date.now()), synced_at: iso((clock += 1000)) });
  await msg({ type: "sync" });
  local = await words();
  check("pull: server edit is applied locally", byText("ephemeral")?.translation === "efímero");

  // 5) local delete → tombstone pushed → purged locally
  await msg({ type: "remove", key: "ephemeral" });
  for (let i = 0; i < 40 && !remote.get("ephemeral")?.deleted_at; i++) await new Promise((r) => setTimeout(r, 250));
  await msg({ type: "sync" });
  local = await words();
  check("delete: server row gets deleted_at", !!remote.get("ephemeral").deleted_at);
  check("delete: tombstone is dropped locally once synced", !byText("ephemeral"));

  // 6) server-side deletion (web app) → removed locally
  remote.set("ubiquitous", { ...remote.get("ubiquitous"), deleted_at: iso(Date.now()), updated_at: iso(Date.now()), synced_at: iso((clock += 1000)) });
  await msg({ type: "sync" });
  local = await words();
  check("pull: deletion made on the web app removes the word here", !byText("ubiquitous"));

  // 7) offline-ish: server rejects the token → error is reported, local data intact
  validToken = "something-else";
  await sw.evaluate(() => chrome.storage.local.set({ auth: { access_token: "access-wrong", refresh_token: "refresh-x", expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: "user-1", email: "me@test.dev" } }));
  r = await msg({ type: "sync" });
  check("401 from the server → clear error, local words untouched", r.ok === false && /caducó/.test(r.error) && !!byText("serendipity"), JSON.stringify(r));

  // 8) disconnect keeps words local and queues them for the next account
  await sw.evaluate((t) => chrome.storage.local.set({ auth: { access_token: t, refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: "user-1" } }), validToken);
  await msg({ type: "disconnect" });
  local = await words();
  const st = await sw.evaluate(async () => await chrome.storage.local.get(["auth", "sync"]));
  check("disconnect: session removed, words kept and flagged for upload", !st.auth && local.length >= 1 && local.every((w) => w.dirty === true && !w.remoteId));

  // 9) restore from the CSV exported by the previous version
  await page.reload();
  await page.click("#tabList");
  await page.setInputFiles("#file", { name: "vocabulario.csv", mimeType: "text/csv", buffer: Buffer.from('\ufeff"gregarious","sociable","He was a gregarious host.","https://x.com/g"\n"candid","sincero","","https://x.com/c"') });
  await page.waitForFunction(() => document.querySelectorAll("#ul li").length >= 2);
  local = await words();
  check("import CSV: words added with context and flagged for upload", byText("gregarious")?.context === "He was a gregarious host." && byText("candid")?.dirty === true);
} catch (e) {
  console.error("ERROR", e);
  failed++;
} finally {
  await ctx.close();
  server.close();
  process.exit(failed ? 1 : 0);
}
