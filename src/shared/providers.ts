import type { Settings } from "./settings";

export class ProviderError extends Error {}

const SRC = "en";
const DST = "es";
const TIMEOUT_MS = 10_000;

/** fetch with a timeout so the tooltip never hangs on "Traduciendo…". */
async function fetchT(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new ProviderError("Tiempo de espera agotado. Revisa tu conexión.");
    throw new ProviderError("No se pudo conectar con el servicio de traducción.");
  }
}

async function mymemory(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${SRC}|${DST}`;
  const res = await fetchT(url);
  if (!res.ok) throw new ProviderError(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.responseData?.translatedText;
  if (data?.responseStatus !== 200 || typeof out !== "string") {
    throw new ProviderError(data?.responseDetails || "MyMemory error");
  }
  return decodeEntities(out);
}

async function google(text: string, key: string): Promise<string> {
  if (!key) throw new ProviderError("Falta la API key de Google Cloud Translation");
  const res = await fetchT(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: SRC, target: DST, format: "text" }),
  });
  if (!res.ok) throw new ProviderError(`Google HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.data?.translations?.[0]?.translatedText;
  if (typeof out !== "string") throw new ProviderError("Respuesta inválida de Google");
  return decodeEntities(out);
}

async function deepl(text: string, key: string): Promise<string> {
  if (!key) throw new ProviderError("Falta la API key de DeepL");
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const res = await fetchT(`https://${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [text], source_lang: "EN", target_lang: "ES" }),
  });
  if (!res.ok) throw new ProviderError(`DeepL HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.translations?.[0]?.text;
  if (typeof out !== "string") throw new ProviderError("Respuesta inválida de DeepL");
  return out;
}

/** Remote (network) translation; runs in the service worker. */
export async function translateRemote(
  text: string,
  s: Settings,
): Promise<{ translation: string; provider: string }> {
  switch (s.provider) {
    case "google":
      return { translation: await google(text, s.googleKey), provider: "Google" };
    case "deepl":
      return { translation: await deepl(text, s.deeplKey), provider: "DeepL" };
    case "chrome":
      throw new ProviderError("La traducción local de Chrome no está disponible en este navegador");
    default: {
      // auto / mymemory: prefer a configured paid key, else MyMemory.
      if (s.provider === "auto" && s.deeplKey) return { translation: await deepl(text, s.deeplKey), provider: "DeepL" };
      if (s.provider === "auto" && s.googleKey) return { translation: await google(text, s.googleKey), provider: "Google" };
      return { translation: await mymemory(text), provider: "MyMemory" };
    }
  }
}

export async function explainWithClaude(text: string, translation: string, key: string): Promise<string> {
  if (!key) throw new ProviderError("Añade tu API key de Anthropic en las opciones para usar «Explicar»");
  const res = await fetchT("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "Eres un tutor de inglés para hispanohablantes. Explica en español, de forma breve (máx. 5 líneas): significado en contexto, matices, expresiones idiomáticas o gramática relevante y un ejemplo corto en inglés con su traducción.",
      messages: [{ role: "user", content: `Texto en inglés: "${text}"\nTraducción: "${translation}"` }],
    }),
  });
  if (!res.ok) throw new ProviderError(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.content?.find((b: { type: string }) => b.type === "text")?.text;
  if (typeof out !== "string") throw new ProviderError("Respuesta inválida de Anthropic");
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
