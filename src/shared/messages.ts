export interface Definition {
  phonetic?: string;
  pos?: string;
  meaning: string;
  example?: string;
}

export interface SavedWord {
  text: string;
  translation: string;
  url: string;
  savedAt: number;
  /** Sentence where the word was found. */
  context?: string;
  definition?: Definition;
  /** Leitner box 0..5 (review progress) and next review time (ms). */
  box?: number;
  due?: number;
  reps?: number;
  lapses?: number;
  // --- sync bookkeeping (account sync) ---
  /** Last local change (ms). Last-write-wins against the server's updated_at. */
  updatedAt?: number;
  /** Soft delete (ms): the tombstone is kept until the deletion has been synced. */
  deletedAt?: number;
  /** True while local changes have not been pushed yet. */
  dirty?: boolean;
  /** Row id in public.words once synced. */
  remoteId?: string;
}

export interface PendingLog {
  key: string;
  known: boolean;
  at: number;
}

export type Request =
  | { type: "translate"; text: string; source?: string; target?: string }
  | { type: "explain"; text: string; translation: string }
  | { type: "define"; word: string }
  | { type: "save"; word: SavedWord }
  | { type: "answer"; key: string; known: boolean }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "import"; words: SavedWord[] }
  | { type: "sync" }
  | { type: "connect" }
  | { type: "disconnect" };

export type Response =
  | { ok: true; translation: string; provider: string; detected?: string }
  | { ok: true; explanation: string }
  | { ok: true; definition: Definition }
  | { ok: true }
  | { ok: false; error: string };

export function send(req: Request): Promise<Response> {
  return chrome.runtime.sendMessage(req) as Promise<Response>;
}
