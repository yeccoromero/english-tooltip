const EN = new Set("the of and to in is that it for was on are with as be at this have from or by not but what all were when we there can an your which their if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know".split(" "));
const ES = new Set("el la los las de del y en que es un una por con para no se su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros".split(" "));

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-záéíóúñü']+/g) ?? [];
}

/** True when the text plausibly is English (or too short/ambiguous to tell). */
export function looksEnglish(text: string): boolean {
  const ws = words(text);
  if (ws.length === 0) return false;
  if (/[áéíóúñü¿¡]/i.test(text)) return false;
  // Non-latin scripts: not English.
  const letters = text.replace(/[^\p{L}]/gu, "");
  const latin = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0 && latin.length / letters.length < 0.7) return false;
  let en = 0;
  let es = 0;
  for (const w of ws) {
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  return !(es > en && es >= 1);
}

/** Collapse whitespace and trim. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
