import type { SavedWord } from "../shared/messages";
import { send } from "../shared/messages";
import { APP_URL } from "../shared/config";
import { csvToWords } from "../shared/csv";
import { keyOf, live } from "../shared/words";
import { dayKey, dueQueue, grade, streak } from "./review";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// All reads come straight from storage; every change goes through the background (single writer + account sync).
async function load(): Promise<SavedWord[]> {
  const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
  return live(words);
}
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

// ---------- Tabs ----------
function tab(name: "review" | "list"): void {
  $("review").hidden = name !== "review";
  $("list").hidden = name !== "list";
  $("tabReview").classList.toggle("on", name === "review");
  $("tabList").classList.toggle("on", name === "list");
  if (name === "review") startReview();
  else renderList();
}
$("tabReview").addEventListener("click", () => tab("review"));
$("tabList").addEventListener("click", () => tab("list"));
$("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
const webapp = $<HTMLAnchorElement>("webapp");
webapp.href = APP_URL;

// ---------- Chips: streak, today, sync ----------
async function loadCounts(): Promise<Record<string, number>> {
  const { reviews = {} } = (await chrome.storage.local.get("reviews")) as { reviews?: Record<string, number> };
  return reviews;
}

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

async function renderChips(): Promise<void> {
  const counts = await loadCounts();
  const s = streak(counts);
  $("streak").textContent = s > 0 ? `🔥 Racha: ${s} ${s === 1 ? "día" : "días"}` : "🔥 Sin racha todavía";
  const t = counts[dayKey()] ?? 0;
  $("today").textContent = `Hoy: ${t} ${t === 1 ? "repasada" : "repasadas"}`;

  const { auth, sync } = (await chrome.storage.local.get(["auth", "sync"])) as {
    auth?: { email?: string };
    sync?: { syncing?: boolean; error?: string; lastSyncAt?: number };
  };
  const chip = $("syncChip");
  if (!auth) chip.textContent = "☁ No conectado: conecta tu cuenta en Opciones";
  else if (sync?.syncing) chip.textContent = "☁ Sincronizando…";
  else if (sync?.error) chip.textContent = `☁ Error: ${sync.error}`;
  else chip.textContent = `☁ ${auth.email ?? "Cuenta"} · sincronizado ${sync?.lastSyncAt ? ago(sync.lastSyncAt) : "pendiente"}`;
}

// ---------- Review (flashcards) ----------
let queue: SavedWord[] = [];
let total = 0;
let current: SavedWord | null = null;

async function startReview(): Promise<void> {
  renderChips();
  const words = await load();
  queue = dueQueue(words);
  total = words.length;
  next();
}

function next(): void {
  current = queue.shift() ?? null;
  $("stats").textContent = `${queue.length + (current ? 1 : 0)} por repasar · ${total} guardadas`;
  $("def").hidden = true;
  $("ctx").hidden = true;
  const card = $("card");
  card.hidden = !current;
  $("actShow").hidden = !current;
  $("actGrade").hidden = true;
  $("back").hidden = true;
  const done = $("done");
  done.hidden = !!current;
  if (!current) {
    done.textContent =
      total === 0
        ? "Aún no guardaste nada. Subraya una palabra que no entiendas y pulsa ☆ en el tooltip."
        : "🎉 ¡Listo por ahora! Vuelve más tarde para repasar las siguientes.";
    return;
  }
  $("front").textContent = current.text;
  $("back").textContent = current.translation;
  const d = current.definition;
  $("def").textContent = d ? [[d.phonetic, d.pos].filter(Boolean).join(" · "), d.meaning].filter(Boolean).join("\n") : "";
  fillContext($("ctx"), current);
}

/** Sentence where the word was found, with the word highlighted (built with text nodes, no HTML injection). */
function fillContext(el: HTMLElement, w: SavedWord): void {
  el.replaceChildren();
  if (!w.context) return;
  const i = w.context.toLowerCase().indexOf(w.text.toLowerCase());
  if (i < 0) {
    el.textContent = w.context;
  } else {
    const mark = document.createElement("mark");
    mark.textContent = w.context.slice(i, i + w.text.length);
    el.append(w.context.slice(0, i), mark, w.context.slice(i + w.text.length));
  }
}

const hasContext = () => !!current?.context;

function reveal(): void {
  if (!current) return;
  $("def").hidden = !$("def").textContent;
  $("ctx").hidden = !hasContext();
  $("back").hidden = false;
  $("actShow").hidden = true;
  $("actGrade").hidden = false;
}

async function answer(known: boolean): Promise<void> {
  if (!current) return;
  const w = current;
  await send({ type: "answer", key: keyOf(w.text), known });
  if (!known) queue.push(grade(w, false)); // see it again at the end of this session
  renderChips();
  next();
}

$("show").addEventListener("click", reveal);
$("good").addEventListener("click", () => answer(true));
$("again").addEventListener("click", () => answer(false));
$("speak").addEventListener("click", () => {
  if (!current) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(current.text);
  u.lang = "en-US";
  speechSynthesis.speak(u);
});
document.addEventListener("keydown", (e) => {
  if ($("review").hidden) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (!$("actShow").hidden) reveal();
  } else if (!$("actGrade").hidden) {
    if (e.key === "ArrowRight" || e.key === "1") answer(true);
    if (e.key === "ArrowLeft" || e.key === "2") answer(false);
  }
});

// ---------- List ----------
async function renderList(): Promise<void> {
  const ul = $("ul");
  const words = await load();
  ul.replaceChildren();
  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aún no guardaste nada. Usa ☆ en el tooltip.";
    ul.append(li);
    return;
  }
  for (const w of words) {
    const li = document.createElement("li");
    const box = document.createElement("div");
    const en = document.createElement("div");
    en.className = "en";
    en.textContent = w.text;
    const es = document.createElement("div");
    es.className = "es";
    es.textContent = w.translation;
    box.append(en, es);
    if (w.context) {
      const c = document.createElement("div");
      c.className = "ctx";
      c.textContent = w.context;
      box.append(c);
    }
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Quitar";
    del.addEventListener("click", async () => {
      await send({ type: "remove", key: keyOf(w.text) });
      renderList();
    });
    li.append(box, del);
    ul.append(li);
  }
}

$("clear").addEventListener("click", async () => {
  if (confirm("¿Borrar todo el vocabulario? (También se borrará de tu cuenta si está conectada)")) {
    await send({ type: "clear" });
    renderList();
  }
});

function download(name: string, mime: string, content: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("csv").addEventListener("click", async () => {
  const rows = (await load()).map((w) => `${csvCell(w.text)},${csvCell(w.translation)},${csvCell(w.context ?? "")},${csvCell(w.url)}`);
  download("vocabulario.csv", "text/csv;charset=utf-8", "\ufeff" + rows.join("\n"));
});

// Backup keeps review progress too (CSV does not). Sync bookkeeping is left out; it is rebuilt on import.
$("backup").addEventListener("click", async () => {
  const words = (await load()).map(({ dirty: _d, remoteId: _r, ...rest }) => rest);
  download(`vocabulario-${dayKey()}.json`, "application/json", JSON.stringify(words, null, 2));
});
const file = $<HTMLInputElement>("file");
$("restore").addEventListener("click", () => file.click());
file.addEventListener("change", async () => {
  const f = file.files?.[0];
  file.value = "";
  if (!f) return;
  try {
    const raw = await f.text();
    const data = f.name.toLowerCase().endsWith(".csv") ? csvToWords(raw) : JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) throw new Error("nothing to import");
    await send({ type: "import", words: data });
    renderList();
  } catch {
    alert("Ese archivo no es una copia válida (usa el .json de «Copia de seguridad» o el .csv exportado).");
  }
});

// Keep chips and list fresh when a sync (or another tab) changes the data. The card being reviewed is left alone.
chrome.storage.onChanged.addListener((changes) => {
  if ("reviews" in changes || "sync" in changes || "auth" in changes) renderChips();
  if ("words" in changes && !$("list").hidden) renderList();
});

startReview();
