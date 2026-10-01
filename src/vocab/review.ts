import type { SavedWord } from "../shared/messages";

// Leitner boxes: days until the next review after a correct answer.
const INTERVAL_DAYS = [1, 2, 4, 8, 16, 32];
const AGAIN_DELAY_MS = 60_000;
const DAY = 86_400_000;

export function isDue(w: SavedWord, now = Date.now()): boolean {
  return !w.deletedAt && (w.due ?? 0) <= now;
}

/** Words to review now, most overdue (and new ones) first. */
export function dueQueue(words: SavedWord[], now = Date.now()): SavedWord[] {
  return words.filter((w) => isDue(w, now)).sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
}

/** Returns the word updated after the user's answer. */
export function grade(w: SavedWord, known: boolean, now = Date.now()): SavedWord {
  const reps = (w.reps ?? 0) + 1;
  if (!known) return { ...w, box: 0, due: now + AGAIN_DELAY_MS, reps, lapses: (w.lapses ?? 0) + 1 };
  const box = Math.min((w.box ?? 0) + 1, INTERVAL_DAYS.length);
  return { ...w, box, due: now + INTERVAL_DAYS[box - 1] * DAY, reps };
}

/** Local calendar day key, e.g. "2026-09-30". */
export function dayKey(ms = Date.now()): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Consecutive days with at least one review, ending today — or yesterday when you
 * haven't reviewed yet today (the streak is still alive until the day ends).
 */
export function streak(counts: Record<string, number>, now = Date.now()): number {
  let t = now;
  if (!counts[dayKey(t)]) t -= DAY;
  let n = 0;
  while (counts[dayKey(t)] > 0) {
    n++;
    t -= DAY;
  }
  return n;
}
