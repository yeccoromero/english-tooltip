import { getSettings, saveSettings } from "../shared/settings";
import { explainWithClaude, translateRemote } from "../shared/providers";
import { lookup } from "../shared/dictionary";
import { dueQueue } from "../vocab/review";
import type { Definition, Request, Response, SavedWord } from "../shared/messages";
import { applyAnswer, applyClear, applyImport, applyRemove, applySave } from "../shared/words";
import { signInWithGoogle } from "../shared/auth";
import { mutateWords, recordAnswer } from "./store";
import { getSyncState, resetAccountLink, scheduleSync } from "./sync";

const cache = new Map<string, { translation: string; provider: string; detected?: string }>();
const CACHE_MAX = 200;
const defCache = new Map<string, Definition>();

async function handle(req: Request): Promise<Response> {
  const s = await getSettings();
  try {
    if (req.type === "translate") {
      const key = `${req.source ?? "auto"}>${req.target ?? "es"}|${req.text}`;
      const hit = cache.get(key);
      if (hit) return { ok: true, ...hit };
      const out = await translateRemote(req.text, s, req.source, req.target);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, out);
      return { ok: true, ...out };
    }
    if (req.type === "explain") {
      return { ok: true, explanation: await explainWithClaude(req.text, req.translation, s.anthropicKey) };
    }
    if (req.type === "define") {
      const key = req.word.toLowerCase();
      let def = defCache.get(key);
      if (!def) {
        def = await lookup(req.word);
        if (defCache.size >= CACHE_MAX) defCache.delete(defCache.keys().next().value as string);
        defCache.set(key, def);
      }
      return { ok: true, definition: def };
    }
    if (req.type === "save") {
      await mutateWords((words) => applySave(words, req.word));
      void scheduleSync();
      return { ok: true };
    }
    if (req.type === "answer") {
      await mutateWords((words) => applyAnswer(words, req.key, req.known));
      await recordAnswer(req.key, req.known);
      void scheduleSync();
      return { ok: true };
    }
    if (req.type === "remove") {
      await mutateWords((words) => applyRemove(words, req.key));
      void scheduleSync();
      return { ok: true };
    }
    if (req.type === "clear") {
      await mutateWords((words) => applyClear(words));
      void scheduleSync();
      return { ok: true };
    }
    if (req.type === "import") {
      await mutateWords((words) => applyImport(words, req.words));
      void scheduleSync();
      return { ok: true };
    }
    if (req.type === "sync") {
      await scheduleSync();
      const st = await getSyncState();
      return st.error ? { ok: false, error: st.error } : { ok: true };
    }
    if (req.type === "connect") {
      const auth = await signInWithGoogle();
      const prev = await getSyncState();
      // A different account than before: its server ids don't apply, upload everything to it.
      if (prev.userId && prev.userId !== auth.user_id) {
        await mutateWords((words) => words.map((w) => ({ ...w, remoteId: undefined, dirty: true })));
        await chrome.storage.local.set({ sync: { userId: auth.user_id, email: auth.email } });
      }
      await scheduleSync();
      const st = await getSyncState();
      return st.error ? { ok: false, error: st.error } : { ok: true };
    }
    if (req.type === "disconnect") {
      await resetAccountLink();
      return { ok: true };
    }
    return { ok: false, error: "Mensaje desconocido" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse);
  return true; // async response
});

async function updateBadge(): Promise<void> {
  const { enabled } = await getSettings();
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  await chrome.action.setTitle({
    title: enabled ? "English Tooltip: activado (clic para desactivar)" : "English Tooltip: desactivado (clic para activar)",
  });
}

// One click on the icon = on/off. Nothing else to choose.
chrome.action.onClicked.addListener(async () => {
  const { enabled } = await getSettings();
  await saveSettings({ enabled: !enabled });
});

chrome.storage.onChanged.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "vocab", title: "Mi vocabulario", contexts: ["action"] });
  chrome.contextMenus.create({ id: "options", title: "Opciones", contexts: ["action"] });
  updateBadge();
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "vocab") chrome.tabs.create({ url: chrome.runtime.getURL("vocab.html") });
  if (info.menuItemId === "options") chrome.runtime.openOptionsPage();
});
updateBadge();

// ---- Daily review reminder ----
const ALARM = "daily-review";

async function scheduleReminder(): Promise<void> {
  const { reminder, reminderHour } = await getSettings();
  await chrome.alarms.clear(ALARM);
  if (!reminder) return;
  const when = new Date();
  when.setHours(reminderHour, 0, 0, 0);
  if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
  await chrome.alarms.create(ALARM, { when: when.getTime(), periodInMinutes: 24 * 60 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
  const due = dueQueue(words).length;
  if (due === 0) return;
  await chrome.notifications.create("review", {
    type: "basic",
    iconUrl: "icons/128.png",
    title: "Hora de repasar",
    message: due === 1 ? "Tienes 1 palabra para repasar." : `Tienes ${due} palabras para repasar.`,
  });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === "review") chrome.tabs.create({ url: chrome.runtime.getURL("vocab.html") });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && ("reminder" in changes || "reminderHour" in changes)) scheduleReminder();
});
chrome.runtime.onInstalled.addListener(scheduleReminder);
chrome.runtime.onStartup.addListener(scheduleReminder);

// ---- Account sync ----
const SYNC_ALARM = "account-sync";
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
  void scheduleSync();
});
chrome.runtime.onStartup.addListener(() => void scheduleSync());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void scheduleSync();
});
