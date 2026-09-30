import { getSettings, DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { guessLang, langName, matchPunctuation, normalize } from "../shared/lang";
import { formatDefinition } from "../shared/dictionary";
import { send, type Definition } from "../shared/messages";
import { contextFor } from "./context";
import { detectLocal, translateLocal } from "./local";
import { Tooltip, type TipHandlers } from "./tooltip";
import { isEditable, wordAtPoint } from "./hover";

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
let current: { text: string; range?: Range; translation?: string; definition?: Definition } | null = null;

function isActive(): boolean {
  return !tinyFrame && settings.enabled && !settings.disabledHosts.includes(location.hostname);
}

function selectionInfo(): { text: string; rect: DOMRect; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = normalize(sel.toString());
  if (!text) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect, range: sel.getRangeAt(0).cloneRange() };
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
    const { text, translation, range } = current;
    let definition = current.definition;
    if (!definition && isSingleWord(text)) {
      // Best effort: keep the dictionary entry with the word (short wait so saving stays instant).
      const res = await Promise.race([send({ type: "define", word: text }), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (res && res.ok && "definition" in res) definition = res.definition;
    }
    await send({
      type: "save",
      word: {
        text,
        translation,
        url: location.href,
        savedAt: Date.now(),
        context: range ? contextFor(range, text) : undefined,
        definition,
      },
    });
    tooltip.setSaved();
  },
  async onDefine() {
    if (!current) return;
    const my = token;
    tooltip.setExplanation("Buscando…");
    const res = await send({ type: "define", word: current.text });
    if (my !== token) return;
    if (res.ok && "definition" in res) {
      current.definition = res.definition;
      tooltip.setExplanation(formatDefinition(res.definition));
    } else tooltip.setExplanation(res.ok ? "Sin definición" : res.error, true);
  },
  async onExplain() {
    if (!current?.translation) return;
    const my = token;
    tooltip.setExplanation("Pensando…");
    const res = await send({ type: "explain", text: current.text, translation: current.translation });
    if (my !== token) return;
    if (res.ok && "explanation" in res) tooltip.setExplanation(res.explanation);
    else tooltip.setExplanation(res.ok ? "Sin respuesta" : res.error, true);
  },
};

const isSingleWord = (t: string) => /^[A-Za-z][A-Za-z'’-]*$/.test(t);

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
  target: string,
): Promise<{ translation: string; provider: string; detected?: string }> {
  if (source && (settings.provider === "auto" || settings.provider === "chrome")) {
    const local = await translateLocal(text, source, target);
    if (local) return { translation: local, provider: "Chrome (local)", detected: source };
  }
  const res = await send({ type: "translate", text, source: source ?? undefined, target });
  if (res.ok && "translation" in res) return res;
  throw new Error(res.ok ? "Sin respuesta" : res.error);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function onSelection(): Promise<void> {
  if (!isActive()) return;
  hoverWord = null;
  const info = selectionInfo();
  if (info) await run(info.text, info.rect, info.range);
}

async function run(text: string, rect: DOMRect, range?: Range): Promise<void> {
  const my = ++token;
  current = { text, range };

  if (text.length > settings.maxChars) {
    tooltip.show(rect, { original: text, state: "error", error: `Selección demasiado larga (máx. ${settings.maxChars} caracteres)` }, handlers);
    return;
  }

  // Everything you select gets translated. Language is detected automatically;
  // text that is already Spanish is translated to English instead.
  const source = await detect(text);
  if (my !== token) return;
  const target = source === "es" ? "en" : "es";

  tooltip.show(rect, { original: text, state: "loading" }, handlers);
  try {
    const out = await translate(text, source, target);
    if (my !== token) return;
    out.translation = matchPunctuation(text, out.translation, target);
    current = { text, range, translation: out.translation };
    const from = out.detected ? langName(out.detected) : null;
    const label = from ? `${cap(from)} → ${cap(langName(target))} · ` : "";
    tooltip.update(
      {
        original: text,
        state: "done",
        translation: out.translation,
        provider: `${label}${out.provider}`,
        canDefine: isSingleWord(text) && (source === "en" || source === null),
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

// ---- Hover: rest the mouse on a word (no selection needed) ----
let hoverTimer: number | undefined;
let hideTimer: number | undefined;
let hoverWord: { text: string; rect: DOMRect } | null = null; // word currently shown via hover
let lastMove = { x: 0, y: 0 };

function overTooltip(e: Event): boolean {
  return e.composedPath().some((n) => tooltip.contains(n));
}

function inRect(x: number, y: number, r: DOMRect, pad = 4): boolean {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function hoverLookup(): void {
  if (!isActive() || !settings.hover) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return; // the user is selecting: selection wins
  const { x, y } = lastMove;
  const el = document.elementFromPoint(x, y);
  if (!el || isEditable(el)) return;
  const w = wordAtPoint(x, y);
  if (!w) return;
  if (hoverWord && hoverWord.text === w.text && tooltip.visible) return; // already showing
  hoverWord = w;
  run(w.text, w.rect, w.range);
}

document.addEventListener(
  "mousemove",
  (e) => {
    lastMove = { x: e.clientX, y: e.clientY };
    if (overTooltip(e)) {
      clearTimeout(hideTimer);
      return;
    }
    clearTimeout(hoverTimer);
    if (hoverWord && tooltip.visible && !inRect(e.clientX, e.clientY, hoverWord.rect)) {
      // Left the word: close after a short grace period so you can reach the buttons.
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        token++;
        tooltip.hide();
        hoverWord = null;
      }, 400);
    } else if (hoverWord && inRect(e.clientX, e.clientY, hoverWord.rect)) {
      clearTimeout(hideTimer);
    }
    if (settings.hover && e.buttons === 0) {
      if (!settings.hoverRequireAlt) hoverTimer = window.setTimeout(hoverLookup, settings.hoverDelay);
      else if (e.altKey) hoverTimer = window.setTimeout(hoverLookup, 60); // hold Alt: instant
    }
  },
  { passive: true },
);

// With "hold Alt" mode, pressing Alt while the mouse already rests on a word translates it.
document.addEventListener("keydown", (e) => {
  if (e.key === "Alt" && settings.hover && settings.hoverRequireAlt) {
    clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(hoverLookup, 60);
  }
});
