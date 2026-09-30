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

await ctx.close(); server.close();
