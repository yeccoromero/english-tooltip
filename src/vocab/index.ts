import type { SavedWord } from "../shared/messages";

const list = document.getElementById("list") as HTMLUListElement;

async function load(): Promise<SavedWord[]> {
  const { words = [] } = (await chrome.storage.local.get("words")) as { words?: SavedWord[] };
  return words;
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

async function render(): Promise<void> {
  const words = await load();
  list.replaceChildren();
  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aún no guardaste nada. Usa ⭐ en el tooltip.";
    list.append(li);
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
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Quitar";
    del.addEventListener("click", async () => {
      await chrome.storage.local.set({ words: (await load()).filter((x) => x.savedAt !== w.savedAt) });
      render();
    });
    li.append(box, del);
    list.append(li);
  }
}

document.getElementById("opts")!.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("clear")!.addEventListener("click", async () => {
  if (confirm("¿Borrar todo el vocabulario?")) {
    await chrome.storage.local.set({ words: [] });
    render();
  }
});

document.getElementById("csv")!.addEventListener("click", async () => {
  const rows = (await load()).map((w) => `${csvCell(w.text)},${csvCell(w.translation)},${csvCell(w.url)}`);
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vocabulario.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

render();
