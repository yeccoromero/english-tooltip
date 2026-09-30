// Chrome's built-in on-device AI APIs (Chrome 138+):
//  - LanguageDetector: detects the language of the selection
//  - Translator: translates <detected> → Spanish offline
// https://developer.chrome.com/docs/ai/translator-api
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Translator: any;
declare const LanguageDetector: any;

const TARGET = "es";

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

let detector: Promise<any | null> | null = null;

/** BCP-47 code (e.g. "en", "fr") or null when unknown / API missing. */
export async function detectLocal(text: string): Promise<string | null> {
  try {
    if (typeof LanguageDetector === "undefined") return null;
    detector ??= (async () => {
      const a = await LanguageDetector.availability();
      return a === "available" ? LanguageDetector.create() : null;
    })().catch(() => null);
    const d = await timeout(detector, 1500);
    if (!d) {
      detector = null;
      return null;
    }
    const results = await timeout(d.detect(text) as Promise<{ detectedLanguage: string; confidence: number }[]>, 1500);
    const top = results?.[0];
    if (!top || top.detectedLanguage === "und" || top.confidence < 0.5) return null;
    return top.detectedLanguage.split("-")[0];
  } catch {
    detector = null;
    return null;
  }
}

const translators = new Map<string, Promise<any | null>>();

async function createTranslator(source: string): Promise<any | null> {
  if (typeof Translator === "undefined") return null;
  const opts = { sourceLanguage: source, targetLanguage: TARGET };
  const availability = await Translator.availability(opts);
  if (availability === "available") return Translator.create(opts);
  if (availability === "downloadable") {
    // Start the model download in the background (needs a recent user gesture);
    // meanwhile the caller falls back to a remote provider.
    Translator.create(opts)
      .then((t: any) => translators.set(source, Promise.resolve(t)))
      .catch(() => {});
  }
  return null;
}

/** Returns the translation, or null when the local API can't be used right now. */
export async function translateLocal(text: string, source: string): Promise<string | null> {
  try {
    if (!translators.has(source)) translators.set(source, createTranslator(source).catch(() => null));
    const t = await timeout(translators.get(source)!, 3000);
    if (!t) {
      translators.delete(source); // re-check availability next time
      return null;
    }
    return await timeout(t.translate(text) as Promise<string>, 4000);
  } catch {
    translators.delete(source);
    return null;
  }
}
