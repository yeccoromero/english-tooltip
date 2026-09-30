import { getSettings, DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { guessLang, langName, normalize } from "../shared/lang";
import { send } from "../shared/messages";
import { detectLocal, translateLocal } from "./local";
import { Tooltip, type TipContent, type TipHandlers } from "./tooltip";

// Don't run inside tiny/ad iframes.
const tinyFrame = window.top !== window && (window.innerWidth < 200 || window.innerHeight < 100);

let settings: Settings = DEFAULT_SETTINGS;
getSettings().then((s) => (settings = s));
chrome.storage.onChanged.addListener(() =>
  getSettings().then((s) => {
    settings = s;
    if (!isActive()) {
      token++;
      tooltip.hide();
    }
  }),
);

const tooltip = new Tooltip();
let token = 0; // invalidates stale async results
let current: { text: string; translation?: string } | null = null;

function isActive(): boolean {
  return !tinyFrame && settings.enabled && !settings.disabledHosts.includes(location.hostname);
}

function selectionInfo(): { text: string; rect: DOMRect } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = normalize(sel.toString());
  if (!text) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

const handlers: TipHandlers = {
  onSpeak() {
    if (!current) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(current.text);
    u.lang = "en-US";
    speechSynthesis.speak(u);
  },
  async onSave() {
    if (!current?.translation) return;
    await send({
      type: "save",
      word: { text: current.text, translation: current.translation, url: location.href, savedAt: Date.now() },
    });
    tooltip.setExplanation("⭐ Guardado en tu vocabulario");
    tooltip.showExplanationBox();
  },
  async onExplain() {
    if (!current?.translation) return;
    const my = token;
    tooltip.showExplanationBox();
    tooltip.setExplanation("Pensando…");
    const res = await send({ type: "explain", text: current.text, translation: current.translation });
    if (my !== token) return;
    if (res.ok && "explanation" in res) tooltip.setExplanation(res.explanation);
    else tooltip.setExplanation(res.ok ? "Sin respuesta" : res.error, true);
  },
};

/** Detect the language: Chrome's detector first, offline heuristic as fallback. null = unknown. */
async function detect(text: string): Promise<string | null> {
  const found = (await detectLocal(text)) ?? guessLang(text);
  if (found) return found;
  // A single Latin-script word can't be detected reliably; you're learning English, so assume it.
  return /^[A-Za-z'’-]+$/.test(text) ? "en" : null;
}

async function translate(
  text: string,
  source: string | null,
): Promise<{ translation: string; provider: string; detected?: string }> {
  if (source && (settings.provider === "auto" || settings.provider === "chrome")) {
    const local = await translateLocal(text, source);
    if (local) return { translation: local, provider: "Chrome (local)", detected: source };
  }
  const res = await send({ type: "translate", text, source: source ?? undefined });
  if (res.ok && "translation" in res) return res;
  throw new Error(res.ok ? "Sin respuesta" : res.error);
}

async function onSelection(): Promise<void> {
  if (!isActive()) return;
  const info = selectionInfo();
  if (!info) return;
  const { text, rect } = info;
  const my = ++token;
  current = { text };

  if (text.length > settings.maxChars) {
    tooltip.show(rect, { original: text, state: "error", error: `Selección demasiado larga (máx. ${settings.maxChars} caracteres)` }, handlers);
    return;
  }

  // Automatic language detection; text that is already Spanish is left alone.
  const source = await detect(text);
  if (my !== token) return;
  if (source === "es" && settings.skipSpanish) {
    tooltip.hide();
    return;
  }

  tooltip.show(rect, { original: text, state: "loading" }, handlers);
  try {
    const out = await translate(text, source);
    if (my !== token) return;
    const sameAsOriginal = out.translation.trim().toLowerCase() === text.toLowerCase();
    if ((out.detected === "es" || sameAsOriginal) && settings.skipSpanish) {
      tooltip.hide(); // already Spanish (or untranslatable, e.g. a name): nothing to show
      return;
    }
    current = { text, translation: out.translation };
    const from = out.detected ? langName(out.detected) : null;
    tooltip.update(
      {
        original: text,
        state: "done",
        translation: out.translation,
        provider: `${from ? `${from[0].toUpperCase()}${from.slice(1)} → Español · ` : ""}${out.provider}`,
      },
      handlers,
    );
  } catch (e) {
    if (my !== token) return;
    tooltip.update({ original: text, state: "error", error: e instanceof Error ? e.message : String(e) }, handlers);
  }
}

let timer: number | undefined;
function schedule(): void {
  clearTimeout(timer);
  timer = window.setTimeout(onSelection, 150);
}

document.addEventListener("mouseup", (e) => {
  if (tooltip.contains(e.target) || e.composedPath().some((n) => tooltip.contains(n))) return;
  schedule();
});
document.addEventListener("keyup", (e) => {
  if (e.shiftKey || e.key.startsWith("Arrow")) schedule();
});
document.addEventListener("mousedown", (e) => {
  if (e.composedPath().some((n) => tooltip.contains(n))) return;
  token++;
  tooltip.hide();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    token++;
    tooltip.hide();
  }
});
