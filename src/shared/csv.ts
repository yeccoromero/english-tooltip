import type { SavedWord } from "./messages";

/** Minimal RFC-4180 CSV parser (quoted cells, "" escapes, commas/newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/**
 * Words from the CSV this extension exports. Columns: word, translation, [context], [url].
 * (The older 3-column export had url in the third column.)
 */
export function csvToWords(text: string, now = Date.now()): SavedWord[] {
  return parseCsv(text)
    .filter((r) => r[0]?.trim() && r[1]?.trim())
    .map((r, i) => {
      const third = r[2] ?? "";
      const looksLikeUrl = /^https?:\/\//.test(third);
      return {
        text: r[0].trim(),
        translation: r[1].trim(),
        context: !looksLikeUrl && third ? third : undefined,
        url: looksLikeUrl ? third : (r[3] ?? ""),
        savedAt: now - i, // keep file order
      };
    });
}
