import type { SavedWord } from "./messages";
import { grade } from "../vocab/review";

/** Identity of a word: case-insensitive text (same rule as the database's unique key). */
export const keyOf = (text: string) => text.toLowerCase();

/** Words the user can see (tombstones hidden). */
export const live = (words: SavedWord[]) => words.filter((w) => !w.deletedAt);

/** Older words (before account sync existed) get sync bookkeeping and are queued for upload. */
export function normalize(words: SavedWord[]): SavedWord[] {
  return words.map((w) => (w.updatedAt === undefined ? { ...w, updatedAt: w.savedAt, dirty: true } : w));
}

/** Save/refresh a word. Keeps review progress, id and creation date of an existing one. */
export function applySave(words: SavedWord[], incoming: SavedWord, now = Date.now()): SavedWord[] {
  const key = keyOf(incoming.text);
  const old = words.find((w) => keyOf(w.text) === key);
  const merged: SavedWord = old
    ? {
        ...old,
        translation: incoming.translation,
        url: incoming.url || old.url,
        context: incoming.context ?? old.context,
        definition: incoming.definition ?? old.definition,
        deletedAt: undefined, // saving again brings a deleted word back
        updatedAt: now,
        dirty: true,
      }
    : { ...incoming, updatedAt: now, dirty: true };
  return [merged, ...words.filter((w) => keyOf(w.text) !== key)];
}

export function applyAnswer(words: SavedWord[], key: string, known: boolean, now = Date.now()): SavedWord[] {
  return words.map((w) => {
    if (keyOf(w.text) !== key || w.deletedAt) return w;
    const g = grade(w, known, now);
    return { ...w, ...g, updatedAt: now, dirty: true };
  });
}

export function applyRemove(words: SavedWord[], key: string, now = Date.now()): SavedWord[] {
  return words.map((w) => (keyOf(w.text) === key && !w.deletedAt ? { ...w, deletedAt: now, updatedAt: now, dirty: true } : w));
}

export function applyClear(words: SavedWord[], now = Date.now()): SavedWord[] {
  return words.map((w) => (w.deletedAt ? w : { ...w, deletedAt: now, updatedAt: now, dirty: true }));
}

/** Merge a backup file: add unknown words, keep the newer version of known ones. */
export function applyImport(words: SavedWord[], imported: SavedWord[], now = Date.now()): SavedWord[] {
  const byKey = new Map(words.map((w) => [keyOf(w.text), w]));
  for (const raw of imported) {
    if (!raw || typeof raw.text !== "string" || typeof raw.translation !== "string" || !raw.text.trim()) continue;
    const key = keyOf(raw.text);
    const mine = byKey.get(key);
    const theirs: SavedWord = { ...raw, savedAt: raw.savedAt ?? now, updatedAt: raw.updatedAt ?? raw.savedAt ?? now, dirty: true, remoteId: mine?.remoteId };
    if (!mine || (theirs.updatedAt ?? 0) > (mine.updatedAt ?? 0)) byKey.set(key, theirs);
  }
  return [...byKey.values()].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}
