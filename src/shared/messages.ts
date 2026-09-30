export interface SavedWord {
  text: string;
  translation: string;
  url: string;
  savedAt: number;
}

export type Request =
  | { type: "translate"; text: string }
  | { type: "explain"; text: string; translation: string }
  | { type: "save"; word: SavedWord };

export type Response =
  | { ok: true; translation: string; provider: string }
  | { ok: true; explanation: string }
  | { ok: true }
  | { ok: false; error: string };

export function send(req: Request): Promise<Response> {
  return chrome.runtime.sendMessage(req) as Promise<Response>;
}
