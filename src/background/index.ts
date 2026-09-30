import { getSettings, saveSettings } from "../shared/settings";
import { explainWithClaude, translateRemote } from "../shared/providers";
import type { Request, Response, SavedWord } from "../shared/messages";

const cache = new Map<string, { translation: string; provider: string; detected?: string }>();
const CACHE_MAX = 200;

async function handle(req: Request): Promise<Response> {
  const s = await getSettings();
  try {
    if (req.type === "translate") {
      const key = `${req.source ?? "auto"}>${req.target ?? "es"}|${req.text}`;
      const hit = cache.get(key);
      if (hit) return { ok: true, ...hit };
      const out = await translateRemote(req.text, s, req.source, req.target);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, out);
      return { ok: true, ...out };
    }
    if (req.type === "explain") {
      return { ok: true, explanation: await explainWithClaude(req.text, req.translation, s.anthropicKey) };
    }
    if (req.type === "save") {
      const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
      const next = [req.word, ...words.filter((w) => w.text.toLowerCase() !== req.word.text.toLowerCase())];
      await chrome.storage.local.set({ words: next.slice(0, 5000) });
      return { ok: true };
    }
    return { ok: false, error: "Mensaje desconocido" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse);
  return true; // async response
});

async function updateBadge(): Promise<void> {
  const { enabled } = await getSettings();
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setTitle({
    title: enabled ? "English Tooltip: activado (clic para desactivar)" : "English Tooltip: desactivado (clic para activar)",
  });
}

// One click on the icon = on/off. Nothing else to choose.
chrome.action.onClicked.addListener(async () => {
  const { enabled } = await getSettings();
  await saveSettings({ enabled: !enabled });
});

chrome.storage.onChanged.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "vocab", title: "Mi vocabulario", contexts: ["action"] });
  chrome.contextMenus.create({ id: "options", title: "Opciones", contexts: ["action"] });
  updateBadge();
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "vocab") chrome.tabs.create({ url: chrome.runtime.getURL("vocab.html") });
  if (info.menuItemId === "options") chrome.runtime.openOptionsPage();
});
updateBadge();
