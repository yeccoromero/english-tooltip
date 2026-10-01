import { getConfig } from "../shared/config";
import { AuthExpired, getValidSession } from "../shared/auth";
import { mergeRemote, toRemote, type RemoteWord } from "../shared/sync-core";
import { keyOf } from "../shared/words";
import { locked, mutateWords, readLogs, readWords } from "./store";

export interface SyncState {
  lastPull?: string;
  lastSyncAt?: number;
  error?: string;
  syncing?: boolean;
  userId?: string;
  email?: string;
}

const PAGE = 1000;
const CHUNK = 200;

export async function getSyncState(): Promise<SyncState> {
  const { sync = {} } = (await chrome.storage.local.get("sync")) as { sync?: SyncState };
  return sync;
}

async function patchState(patch: Partial<SyncState>): Promise<void> {
  await chrome.storage.local.set({ sync: { ...(await getSyncState()), ...patch } });
}

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = await getConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  }).catch(() => {
    throw new Error("Sin conexión con el servidor.");
  });
  if (res.status === 401) throw new AuthExpired("La sesión caducó. Vuelve a conectar tu cuenta.");
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function syncOnce(): Promise<void> {
  const session = await getValidSession();
  if (!session) return;
  const token = session.access_token;

  // 1) Pull: everything the server changed since the last pull, merged last-write-wins.
  const state = await getSyncState();
  const rows: (RemoteWord & { synced_at: string })[] = [];
  for (let offset = 0; offset < PAGE * 20; offset += PAGE) {
    const filter = state.lastPull ? `&synced_at=gte.${encodeURIComponent(state.lastPull)}` : "";
    const page = await api<(RemoteWord & { synced_at: string })[]>(
      `words?select=*&order=synced_at.asc&limit=${PAGE}&offset=${offset}${filter}`,
      token,
    );
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (rows.length) await mutateWords((words) => mergeRemote(words, rows));
  const lastPull = rows.length ? rows[rows.length - 1].synced_at : state.lastPull;

  // 2) Push: local changes that are not on the server yet.
  const snapshot = (await readWords()).filter((w) => w.dirty);
  for (let i = 0; i < snapshot.length; i += CHUNK) {
    const chunk = snapshot.slice(i, i + CHUNK);
    const saved = await api<{ id: string; text: string }[]>("words?on_conflict=user_id,text_key", token, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(chunk.map(toRemote)),
    });
    const ids = new Map(saved.map((r) => [keyOf(r.text), r.id]));
    const sent = new Map(chunk.map((w) => [keyOf(w.text), w.updatedAt]));
    await mutateWords((words) =>
      words
        .map((w) => {
          const k = keyOf(w.text);
          const id = ids.get(k);
          if (!id) return w;
          // Only clear "dirty" if the word did not change while the request was in flight.
          return w.updatedAt === sent.get(k) ? { ...w, remoteId: id, dirty: false } : { ...w, remoteId: id };
        })
        .filter((w) => !(w.deletedAt && !w.dirty)),
    );
  }

  // 3) Review logs (need the word's server id, so they go after the words).
  const logs = await readLogs();
  const idOf = new Map((await readWords()).filter((w) => w.remoteId).map((w) => [keyOf(w.text), w.remoteId as string]));
  const ready = logs.filter((l) => idOf.has(l.key));
  if (ready.length) {
    await api("review_logs", token, {
      method: "POST",
      body: JSON.stringify(ready.map((l) => ({ word_id: idOf.get(l.key), known: l.known, reviewed_at: new Date(l.at).toISOString() }))),
    });
    // Drop only what was sent; answers recorded while the request ran stay queued.
    await locked(async () => {
      const sent = new Set(ready.map((l) => `${l.key}|${l.at}`));
      await chrome.storage.local.set({ pendingLogs: (await readLogs()).filter((l) => !sent.has(`${l.key}|${l.at}`)) });
    });
  }

  await patchState({ lastPull, lastSyncAt: Date.now(), error: undefined, userId: session.user_id, email: session.email });
}

let running: Promise<void> | null = null;
let again = false;

/** Runs a sync; calls made while one is running are folded into one extra run. Never throws. */
export function scheduleSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    await patchState({ syncing: true });
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } catch (e) {
      await patchState({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      await patchState({ syncing: false });
      running = null;
    }
  })();
  return running;
}

/** Forget the account link (words stay local and are queued for upload to whichever account connects next). */
export async function resetAccountLink(): Promise<void> {
  await mutateWords((words) => words.map((w) => ({ ...w, remoteId: undefined, dirty: true })));
  await chrome.storage.local.remove(["auth", "sync", "pendingLogs"]);
}
