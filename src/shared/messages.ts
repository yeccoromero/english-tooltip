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
}

export type Request =
  | { type: "translate"; text: string; source?: string; target?: string }
  | { type: "explain"; text: string; translation: string }
  | { type: "define"; word: string }
  | { type: "save"; word: SavedWord };

export type Response =
  | { ok: true; translation: string; provider: string; detected?: string }
  | { ok: true; explanation: string }
  | { ok: true; definition: Definition }
  | { ok: true }
  | { ok: false; error: string };

export function send(req: Request): Promise<Response> {
  return chrome.runtime.sendMessage(req) as Promise<Response>;
}
