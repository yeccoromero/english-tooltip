import { getSettings, saveSettings, type Provider } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

(async () => {
  const s = await getSettings();
  $<HTMLInputElement>("enabled").checked = s.enabled;
  $<HTMLInputElement>("hover").checked = s.hover;
  $<HTMLInputElement>("hoverDelay").value = String(s.hoverDelay);
  $<HTMLInputElement>("hoverRequireAlt").checked = s.hoverRequireAlt;
  $<HTMLInputElement>("reminder").checked = s.reminder;
  $<HTMLInputElement>("reminderHour").value = String(s.reminderHour);
  $<HTMLSelectElement>("provider").value = s.provider;
  $<HTMLInputElement>("googleKey").value = s.googleKey;
  $<HTMLInputElement>("deeplKey").value = s.deeplKey;
  $<HTMLInputElement>("anthropicKey").value = s.anthropicKey;
  $<HTMLInputElement>("maxChars").value = String(s.maxChars);
  $<HTMLTextAreaElement>("disabledHosts").value = s.disabledHosts.join("\n");
})();

$("save").addEventListener("click", async () => {
  const max = Number($<HTMLInputElement>("maxChars").value);
  await saveSettings({
    enabled: $<HTMLInputElement>("enabled").checked,
    hover: $<HTMLInputElement>("hover").checked,
    hoverRequireAlt: $<HTMLInputElement>("hoverRequireAlt").checked,
    reminder: $<HTMLInputElement>("reminder").checked,
    reminderHour: Math.min(23, Math.max(0, Math.floor(Number($<HTMLInputElement>("reminderHour").value)) || 0)),
    hoverDelay: Math.min(3000, Math.max(300, Number($<HTMLInputElement>("hoverDelay").value) || 700)),
    provider: $<HTMLSelectElement>("provider").value as Provider,
    googleKey: $<HTMLInputElement>("googleKey").value.trim(),
    deeplKey: $<HTMLInputElement>("deeplKey").value.trim(),
    anthropicKey: $<HTMLInputElement>("anthropicKey").value.trim(),
    maxChars: Number.isFinite(max) && max >= 20 ? Math.min(max, 5000) : 500,
    disabledHosts: $<HTMLTextAreaElement>("disabledHosts")
      .value.split("\n")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  });
  const st = $("status");
  st.textContent = "Guardado ✓";
  setTimeout(() => (st.textContent = ""), 2000);
});

// ---------- Account ----------
import { send } from "../shared/messages";
import { APP_URL } from "../shared/config";

interface AuthInfo { email?: string }
interface SyncInfo { syncing?: boolean; error?: string; lastSyncAt?: number }

async function renderAccount(): Promise<void> {
  const { auth, sync } = (await chrome.storage.local.get(["auth", "sync"])) as { auth?: AuthInfo; sync?: SyncInfo };
  const status = $("accountStatus");
  $("connect").hidden = !!auth;
  $("syncNow").hidden = !auth;
  $("disconnect").hidden = !auth;
  if (!auth) {
    status.textContent = "No conectado.";
    return;
  }
  const when = sync?.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : "pendiente";
  status.textContent = sync?.syncing
    ? `Conectado como ${auth.email ?? "tu cuenta"} · sincronizando…`
    : `Conectado como ${auth.email ?? "tu cuenta"} · última sincronización: ${when}`;
  if (sync?.error) $("accountMsg").textContent = `⚠ ${sync.error}`;
}

async function run(btn: HTMLElement, req: Parameters<typeof send>[0], okMsg: string): Promise<void> {
  const msg = $("accountMsg");
  (btn as HTMLButtonElement).disabled = true;
  msg.textContent = "…";
  const res = await send(req).catch(() => ({ ok: false as const, error: "No se pudo contactar con la extensión." }));
  (btn as HTMLButtonElement).disabled = false;
  msg.textContent = res.ok ? okMsg : `⚠ ${res.error}`;
  renderAccount();
}

$("connect").addEventListener("click", () => run($("connect"), { type: "connect" }, "✓ Cuenta conectada. Tu vocabulario se está sincronizando."));
$("syncNow").addEventListener("click", () => run($("syncNow"), { type: "sync" }, "✓ Sincronizado."));
$("disconnect").addEventListener("click", () => {
  if (confirm("¿Desconectar tu cuenta? Tus palabras se quedan en este navegador y en la web app.")) run($("disconnect"), { type: "disconnect" }, "Cuenta desconectada.");
});
chrome.storage.onChanged.addListener((changes) => {
  if ("auth" in changes || "sync" in changes) renderAccount();
});
renderAccount();
void APP_URL;
