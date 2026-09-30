import type { Definition } from "./messages";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Parses a dictionaryapi.dev response (array of entries) into one compact definition. */
export function parseEntry(data: any): Definition | null {
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) return null;
  const phonetic: string | undefined =
    entry.phonetic || entry.phonetics?.find((p: any) => p?.text)?.text || undefined;
  for (const m of entry.meanings ?? []) {
    const d = m?.definitions?.find((x: any) => x?.definition);
    if (d) return { phonetic, pos: m.partOfSpeech, meaning: d.definition, example: d.example };
  }
  return null;
}

/** Looks the word up in the free dictionaryapi.dev service (run from the service worker). */
export async function lookup(word: string): Promise<Definition> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    throw new Error("No se pudo consultar el diccionario.");
  });
  if (res.status === 404) throw new Error("Sin definición para esta palabra.");
  if (!res.ok) throw new Error(`Diccionario HTTP ${res.status}`);
  const def = parseEntry(await res.json());
  if (!def) throw new Error("Sin definición para esta palabra.");
  return def;
}

/** Plain-text rendering used inside the tooltip. */
export function formatDefinition(d: Definition): string {
  const head = [d.phonetic, d.pos].filter(Boolean).join(" · ");
  return [head, d.meaning, d.example ? `“${d.example}”` : ""].filter(Boolean).join("\n");
}
