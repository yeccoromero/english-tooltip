// Chrome's built-in on-device Translator API (Chrome 138+).
// https://developer.chrome.com/docs/ai/translator-api
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Translator: any;

const OPTS = { sourceLanguage: "en", targetLanguage: "es" };
let instance: Promise<any | null> | null = null;

async function create(): Promise<any | null> {
  if (typeof Translator === "undefined") return null;
  const availability = await Translator.availability(OPTS);
  if (availability === "available") return Translator.create(OPTS);
  if (availability === "downloadable") {
    // Start the model download in the background (needs a recent user gesture);
    // meanwhile the caller falls back to a remote provider.
    Translator.create(OPTS).then((t: any) => (instance = Promise.resolve(t))).catch(() => {});
  }
  return null;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Returns the translation, or null when the local API can't be used right now. */
export async function translateLocal(text: string): Promise<string | null> {
  try {
    instance ??= create().catch(() => null);
    const t = await timeout(instance, 3000);
    if (!t) {
      instance = null; // re-check availability next time
      return null;
    }
    return await timeout(t.translate(text) as Promise<string>, 4000);
  } catch {
    instance = null;
    return null;
  }
}
