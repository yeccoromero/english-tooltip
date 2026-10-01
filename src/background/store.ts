import type { PendingLog, SavedWord } from "../shared/messages";
import { normalize } from "../shared/words";

// Every write to the vocabulary goes through this one lock in the service worker,
// so a save from a page, a review answer and a sync merge can never overwrite each other.
let chain: Promise<unknown> = Promise.resolve();

export function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function readWords(): Promise<SavedWord[]> {
  const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
  return normalize(words);
}

export async function readLogs(): Promise<PendingLog[]> {
  const { pendingLogs = [] } = (await chrome.storage.local.get("pendingLogs")) as { pendingLogs?: PendingLog[] };
  return pendingLogs;
}

export function mutateWords(fn: (words: SavedWord[]) => SavedWord[]): Promise<void> {
  return locked(async () => {
    await chrome.storage.local.set({ words: fn(await readWords()) });
  });
}

/** Counts one answered card for today (streak) and queues the review log for the account. */
export function recordAnswer(key: string, known: boolean, now = Date.now()): Promise<void> {
  return locked(async () => {
    const d = new Date(now);
    const p = (n: number) => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const { reviews = {}, pendingLogs = [] } = (await chrome.storage.local.get(["reviews", "pendingLogs"])) as {
      reviews?: Record<string, number>;
      pendingLogs?: PendingLog[];
    };
    reviews[day] = (reviews[day] ?? 0) + 1;
    pendingLogs.push({ key, known, at: now });
    await chrome.storage.local.set({ reviews, pendingLogs });
  });
}
