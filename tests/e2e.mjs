// Manual e2e: loads dist/ in Chromium and checks the tooltip. Run: node tests/e2e.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve("dist");
const server = http.createServer((_, res) => {
  res.setHeader("content-type", "text/html");
  res.end(`<body style="font:20px sans-serif;padding:220px 120px"><p id="p">The quick brown fox jumps over the lazy dog.</p><p id="w">serendipity</p><p id="es">El perro de mi vecino es muy grande.</p></body>`);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pw-")), {
  headless: false, executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
});
// Stub network in the service worker.
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
await sw.evaluate(() => {
  globalThis.fetch = async () => new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "El rápido zorro marrón salta sobre el perro perezoso." } }));
});

const page = await ctx.newPage();
await page.goto(url);

const tipText = () => page.evaluate(() => document.querySelector("english-tooltip")?.shadowRoot?.querySelector(".tip")?.innerText ?? null);

// Emulate the end of a drag-selection
await page.evaluate(() => {
  const r = document.createRange(); r.selectNodeContents(document.getElementById("p"));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
await page.waitForFunction(() => document.querySelector("english-tooltip")?.shadowRoot?.querySelector(".tr:not(.spin), .err"), null, { timeout: 15000 });
console.log("TOOLTIP (english):\n" + (await tipText()));
await page.screenshot({ path: "e2e.png" });

await page.keyboard.press("Escape");
console.log("hidden after Esc:", (await tipText()) === null);

await page.evaluate(() => {
  const r = document.createRange(); r.selectNodeContents(document.getElementById("es"));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
await page.waitForTimeout(600);
console.log("no tooltip for Spanish text:", (await tipText()) === null);

await page.keyboard.press("Escape");
await page.evaluate(() => {
  const r = document.createRange(); r.selectNodeContents(document.getElementById("w"));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
await page.waitForFunction(() => document.querySelector("english-tooltip")?.shadowRoot?.querySelector(".tr:not(.spin)"), null, { timeout: 15000 });
console.log("single word tooltip:", (await tipText()).split("\n")[0]);

// Icon toggle: storage flag off -> badge OFF and no tooltip.
await sw.evaluate(() => chrome.storage.sync.set({ enabled: false }));
await page.waitForTimeout(500);
console.log("badge:", await sw.evaluate(() => chrome.action.getBadgeText({})));
await page.evaluate(() => {
  const r = document.createRange(); r.selectNodeContents(document.getElementById("p"));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
});
await page.waitForTimeout(700);
console.log("no tooltip when disabled:", (await tipText()) === null);
await sw.evaluate(() => chrome.storage.sync.set({ enabled: true }));
await page.waitForTimeout(300);
console.log("badge when on:", JSON.stringify(await sw.evaluate(() => chrome.action.getBadgeText({}))));

// Hover: rest the mouse on a word, no selection.
await page.evaluate(() => getSelection().removeAllRanges());
await page.keyboard.press("Escape");
const wb = await page.locator("#w").boundingBox();
await page.mouse.move(wb.x + 40, wb.y + wb.height / 2 - 2);
await page.mouse.move(wb.x + 40 + 1, wb.y + wb.height / 2 - 2);
await page.waitForFunction(() => document.querySelector("english-tooltip")?.shadowRoot?.querySelector(".tr:not(.spin)"), null, { timeout: 15000 });
console.log("hover tooltip orig:", (await tipText()).split("\n")[1]);
await page.mouse.move(wb.x + 600, wb.y + 300);
await page.waitForTimeout(900);
console.log("hover tooltip closes when leaving:", (await tipText()) === null);

// Flashcards page.
const extId = new URL(sw.url()).host;
await sw.evaluate(() => chrome.storage.local.set({ words: [{ text: "serendipity", translation: "serendipia", url: "https://x.com/a", savedAt: 1 }] }));
const rp = await ctx.newPage();
await rp.goto(`chrome-extension://${extId}/vocab.html`);
console.log("front:", await rp.textContent("#front"), "| back hidden:", await rp.locator("#back").isHidden());
await rp.click("#show");
console.log("back:", await rp.textContent("#back"));
await rp.click("#good");
console.log("done msg:", (await rp.textContent("#done")).slice(0, 20));
const saved = await sw.evaluate(async () => (await chrome.storage.local.get("words")).words[0]);
console.log("box after good:", saved.box, "due in future:", saved.due > Date.now());

await ctx.close(); server.close();
