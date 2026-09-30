import type { SavedWord } from "../shared/messages";
import { dayKey, dueQueue, grade, streak } from "./review";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load(): Promise<SavedWord[]> {
  const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
  return words;
}
const store = (words: SavedWord[]) => chrome.storage.local.set({ words });
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

// ---------- Review (flashcards) ----------
let queue: SavedWord[] = [];
let total = 0;
let current: SavedWord | null = null;

async function loadCounts(): Promise<Record<string, number>> {
  const { reviews = {} } = (await chrome.storage.local.get("reviews")) as { reviews?: Record<string, number> };
  return reviews;
}

async function renderChips(): Promise<void> {
  const counts = await loadCounts();
  const s = streak(counts);
  $("streak").textContent = s > 0 ? `🔥 Racha: ${s} ${s === 1 ? "día" : "días"}` : "🔥 Sin racha todavía";
  const t = counts[dayKey()] ?? 0;
  $("today").textContent = `Hoy: ${t} ${t === 1 ? "repasada" : "repasadas"}`;
}

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
        ? "Aún no guardaste nada. Subraya una palabra que no entiendas y pulsa ⭐ en el tooltip."
        : "🎉 ¡Listo por ahora! Vuelve más tarde para repasar las siguientes.";
    return;
  }
  $("front").textContent = current.text;
  $("back").textContent = current.translation;
  const d = current.definition;
  $("def").textContent = d ? [[d.phonetic, d.pos].filter(Boolean).join(" · "), d.meaning].filter(Boolean).join("\n") : "";
  fillContext($("ctx"), current);
  try {
    $("src").textContent = new URL(current.url).hostname;
  } catch {
    $("src").textContent = "";
  }
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

const w_hasContext = () => !!current?.context;

function reveal(): void {
  if (!current) return;
  $("def").hidden = !$("def").textContent;
  $("ctx").hidden = !w_hasContext();
  $("back").hidden = false;
  $("actShow").hidden = true;
  $("actGrade").hidden = false;
}

async function answer(known: boolean): Promise<void> {
  if (!current) return;
  const updated = grade(current, known);
  const counts = await loadCounts();
  counts[dayKey()] = (counts[dayKey()] ?? 0) + 1;
  await chrome.storage.local.set({ reviews: counts });
  const words = await load();
  await store(words.map((w) => (w.savedAt === updated.savedAt ? updated : w)));
  if (!known) queue.push(updated); // see it again at the end of this session
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
    li.textContent = "Aún no guardaste nada. Usa ⭐ en el tooltip.";
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
      await store((await load()).filter((x) => x.savedAt !== w.savedAt));
      renderList();
    });
    li.append(box, del);
    ul.append(li);
  }
}

$("clear").addEventListener("click", async () => {
  if (confirm("¿Borrar todo el vocabulario?")) {
    await store([]);
    renderList();
  }
});

$("csv").addEventListener("click", async () => {
  const rows = (await load()).map((w) => `${csvCell(w.text)},${csvCell(w.translation)},${csvCell(w.url)}`);
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vocabulario.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

startReview();
