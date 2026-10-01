import type { Definition, SavedWord } from "./messages";
import { keyOf } from "./words";

/** A row of public.words as returned by PostgREST. */
export interface RemoteWord {
  id: string;
  text: string;
  translation: string;
  context: string | null;
  url: string | null;
  definition: Definition | null;
  box: number;
  due: string;
  reps: number;
  lapses: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Payload for upsert. Every key is always present (PostgREST bulk inserts need uniform objects). */
export function toRemote(w: SavedWord) {
  return {
    text: w.text.slice(0, 500),
    translation: w.translation.slice(0, 2000),
    context: w.context ? w.context.slice(0, 600) : null,
    url: w.url ? w.url.slice(0, 2000) : null,
    definition: w.definition ?? null,
    box: Math.min(Math.max(w.box ?? 0, 0), 10),
    due: iso(w.due ?? Date.now()),
    reps: w.reps ?? 0,
    lapses: w.lapses ?? 0,
    created_at: iso(w.savedAt),
    updated_at: iso(w.updatedAt ?? w.savedAt),
    deleted_at: w.deletedAt ? iso(w.deletedAt) : null,
  };
}

export function fromRemote(r: RemoteWord): SavedWord {
  return {
    text: r.text,
    translation: r.translation,
    url: r.url ?? "",
    savedAt: Date.parse(r.created_at),
    context: r.context ?? undefined,
    definition: r.definition ?? undefined,
    box: r.box,
    due: Date.parse(r.due),
    reps: r.reps,
    lapses: r.lapses,
    updatedAt: Date.parse(r.updated_at),
    deletedAt: r.deleted_at ? Date.parse(r.deleted_at) : undefined,
    remoteId: r.id,
    dirty: false,
  };
}

/**
 * Last-write-wins merge of rows pulled from the server into the local list.
 * - unknown word → added (unless it only exists as a server tombstone)
 * - server newer → server version wins
 * - same timestamp → it is our own push coming back: mark as synced
 * - local newer → keep local (stays dirty, will be pushed)
 * Synced tombstones are dropped at the end.
 */
export function mergeRemote(local: SavedWord[], rows: RemoteWord[]): SavedWord[] {
  const byKey = new Map(local.map((w) => [keyOf(w.text), w]));
  for (const r of rows) {
    const key = keyOf(r.text);
    const mine = byKey.get(key);
    if (!mine) {
      if (!r.deleted_at) byKey.set(key, fromRemote(r));
      continue;
    }
    const ru = Date.parse(r.updated_at);
    const lu = mine.updatedAt ?? mine.savedAt;
    if (ru > lu) byKey.set(key, fromRemote(r));
    else if (ru === lu) byKey.set(key, { ...mine, remoteId: r.id, dirty: false });
    else byKey.set(key, { ...mine, remoteId: r.id });
  }
  return [...byKey.values()]
    .filter((w) => !(w.deletedAt && !w.dirty))
    .sort((a, b) => b.savedAt - a.savedAt);
}
