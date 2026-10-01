import { send } from "../shared/messages";
import { APP_URL } from "../shared/config";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function show(step: 1 | 2 | 3): void {
  [1, 2, 3].forEach((n) => {
    $(`s${n}`).hidden = n !== step;
    $(`d${n}`).classList.toggle("on", n === step);
  });
}

/** Remember that the welcome flow was seen, so it does not open again. */
const markDone = () => chrome.storage.local.set({ onboarded: true });

async function finish(email?: string): Promise<void> {
  await markDone();
  $("doneLead").textContent = email
    ? `Cuenta conectada: ${email}. Lo que guardes se sincroniza solo.`
    : "Usarás la extensión sin cuenta. Puedes conectarla cuando quieras en Opciones → Cuenta.";
  const web = $<HTMLAnchorElement>("webapp");
  web.href = APP_URL;
  web.hidden = !email;
  show(3);
}

$("next1").addEventListener("click", () => show(2));

$("connect").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("connect");
  const msg = $("msg");
  btn.disabled = true;
  msg.className = "msg";
  msg.textContent = "Abriendo Google…";
  const res = await send({ type: "connect" }).catch(() => ({ ok: false as const, error: "No se pudo contactar con la extensión." }));
  btn.disabled = false;
  if (res.ok) {
    const { auth } = (await chrome.storage.local.get("auth")) as { auth?: { email?: string } };
    await finish(auth?.email ?? "tu cuenta");
  } else {
    msg.className = "msg err";
    msg.textContent = `⚠ ${res.error}`;
  }
});

$("skip").addEventListener("click", () => finish());

// Reopened while already connected: go straight to the last step.
chrome.storage.local.get("auth").then(({ auth }) => {
  if (auth) void finish((auth as { email?: string }).email ?? "tu cuenta");
});
