import { getSettings } from "../shared/settings";
import { explainWithClaude, translateRemote } from "../shared/providers";
import type { Request, Response, SavedWord } from "../shared/messages";

const cache = new Map<string, { translation: string; provider: string }>();
const CACHE_MAX = 200;

async function handle(req: Request): Promise<Response> {
  const s = await getSettings();
  try {
    if (req.type === "translate") {
      const hit = cache.get(req.text);
      if (hit) return { ok: true, ...hit };
      const out = await translateRemote(req.text, s);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(req.text, out);
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
