// Onboarding / sign-in welcome page. Run: node tests/e2e-onboarding.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve("dist");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pw-"));
const launch = () =>
  chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
    viewport: { width: 700, height: 820 },
  });

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) failed++; };
const welcome = (c) => c.pages().find((p) => p.url().endsWith("/onboarding.html"));
const visible = (p, id) => p.evaluate((id) => !document.getElementById(id).hidden, id);

let ctx = await launch();
try {
  // 1) fresh install opens the welcome page by itself
  for (let i = 0; i < 40 && !welcome(ctx); i++) await new Promise((r) => setTimeout(r, 250));
  let page = welcome(ctx);
  check("first install opens the welcome page automatically", !!page);
  await page.waitForLoadState();
  check("step 1 (welcome) is shown first", await visible(page, "s1") && !(await visible(page, "s2")));

  await page.click("#next1");
  check("step 2 asks to connect the account", await visible(page, "s2"));
  await page.screenshot({ path: "e2e-onboarding.png" });

  // 2) connect failure is shown and the button works again
  await page.evaluate(() => { chrome.runtime.sendMessage = async () => ({ ok: false, error: "Inicio de sesión cancelado." }); });
  await page.click("#connect");
  await page.waitForFunction(() => document.getElementById("msg").classList.contains("err"));
  check("connect error is shown, button re-enabled, still on step 2", (await page.textContent("#msg")).includes("cancelado") && !(await page.locator("#connect").isDisabled()) && await visible(page, "s2"));
  check("not marked as onboarded after a failed connect", !(await page.evaluate(async () => (await chrome.storage.local.get("onboarded")).onboarded)));

  // 3) connect success → step 3 with the account email, onboarded flag set
  await page.evaluate(async () => {
    await chrome.storage.local.set({ auth: { access_token: "a", refresh_token: "r", expires_at: 9999999999, user_id: "u", email: "diego@example.com" } });
    chrome.runtime.sendMessage = async () => ({ ok: true });
  });
  // the page reacts to a successful connect (auth is already in storage, as the background would have saved it)
  await page.click("#connect");
  await page.waitForFunction(() => !document.getElementById("s3").hidden);
  check("connect success → done step mentions the account", (await page.textContent("#doneLead")).includes("diego@example.com"));
  check("done step offers the web app link", await page.locator("#webapp").isVisible());
  check("onboarded flag saved", await page.evaluate(async () => (await chrome.storage.local.get("onboarded")).onboarded === true));
  await page.screenshot({ path: "e2e-onboarding-done.png" });

  // 4) skipping works in a clean profile state
  await page.evaluate(async () => { await chrome.storage.local.remove(["auth", "onboarded"]); });
  await page.reload();
  await page.click("#next1");
  await page.click("#skip");
  check("skip → done step without account, web app link hidden", (await page.textContent("#doneLead")).includes("sin cuenta") && !(await page.locator("#webapp").isVisible()));
  check("skip also marks onboarded", await page.evaluate(async () => (await chrome.storage.local.get("onboarded")).onboarded === true));
  await ctx.close();

  // 5) restarting Chrome with the same profile does not show it again
  ctx = await launch();
  await new Promise((r) => setTimeout(r, 2500));
  check("welcome page does not reopen on later starts", !welcome(ctx));
} catch (e) {
  console.error("ERROR", e);
  failed++;
} finally {
  await ctx.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
