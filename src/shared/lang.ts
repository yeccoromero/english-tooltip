const EN = new Set("the of and to in is that it for was on are with as be at this have from or by not but what all were when we there can an your which their if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know".split(" "));
const ES = new Set("el la los las de del y en que es un una por con para se al más este porque esta entre cuando sobre también hasta donde quien desde todo durante todos les ni contra otros ellos esto antes algunos qué unos otro otras otra él tanto esa estos mucho quienes muchos ella estar estas algunas nosotros".split(" "));

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-záéíóúñü']+/g) ?? [];
}

/** Collapse whitespace and trim. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Cheap offline guess for Spanish vs English. Returns null when unsure
 * (other scripts, single ambiguous words…) so callers can auto-detect instead.
 */
export function guessLang(text: string): "es" | "en" | null {
  const ws = words(text);
  if (ws.length === 0) return null;
  const letters = text.replace(/[^\p{L}]/gu, "");
  const latin = text.replace(/[^A-Za-z\u00C0-\u00FF]/g, "");
  if (letters.length > 0 && latin.length / letters.length < 0.7) return null;
  let en = 0;
  let es = 0;
  for (const w of ws) {
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  if (/[¿¡ñ]/i.test(text) && es >= en) return "es";
  // Spanish needs clear evidence: short texts are easily misread.
  if (es > en && (es >= 2 || es / ws.length >= 0.5)) return "es";
  if (en > es) return "en";
  return null;
}

/** Spanish name of a language code, e.g. "en" → "inglés". */
export function langName(code: string): string {
  try {
    return new Intl.DisplayNames(["es"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
