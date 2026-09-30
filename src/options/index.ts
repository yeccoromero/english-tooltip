import { getSettings, saveSettings, type Provider } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

(async () => {
  const s = await getSettings();
  $<HTMLInputElement>("enabled").checked = s.enabled;
  $<HTMLInputElement>("hover").checked = s.hover;
  $<HTMLInputElement>("hoverDelay").value = String(s.hoverDelay);
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
