const CSS = `
:host { all: initial; }
.tip {
  position: absolute; z-index: 2147483647; box-sizing: border-box;
  width: max-content; max-width: 360px; min-width: 120px; padding: 10px 12px;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #111827; background: #fff; border: 1px solid #d1d5db; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
}
@media (prefers-color-scheme: dark) {
  .tip { color: #f3f4f6; background: #1f2937; border-color: #374151; }
  .orig { color: #9ca3af !important; }
  button:hover { background: #374151 !important; }
}
.orig { font-size: 12px; color: #6b7280; margin-bottom: 4px; overflow-wrap: anywhere; }
.tr { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
.err { color: #dc2626; font-size: 13px; }
.meta { font-size: 11px; color: #9ca3af; margin-top: 6px; }
.expl { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb33; font-size: 13px; white-space: pre-wrap; }
.bar { display: flex; gap: 4px; margin-top: 8px; }
button {
  all: unset; cursor: pointer; padding: 2px 8px; border-radius: 6px; font-size: 13px;
  border: 1px solid #9ca3af55;
}
button:hover { background: #e5e7eb; }
button[disabled] { opacity: .5; cursor: default; }
.spin { opacity: .7; }
`;

export interface TipContent {
  original: string;
  state: "loading" | "done" | "error";
  translation?: string;
  provider?: string;
  error?: string;
}

export interface TipHandlers {
  onSpeak(): void;
  onSave(): void;
  onExplain(): void;
}

export class Tooltip {
  private host: HTMLElement;
  private root: ShadowRoot;
  private tip: HTMLElement;
  private rect: { top: number; bottom: number; left: number; width: number } | null = null;
  private expl: HTMLElement | null = null;

  constructor() {
    this.host = document.createElement("english-tooltip");
    this.host.style.cssText = "all:initial;position:absolute;top:0;left:0;z-index:2147483647;";
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.tip = document.createElement("div");
    this.tip.className = "tip";
    this.root.append(style, this.tip);
  }

  contains(target: EventTarget | null): boolean {
    return target === this.host;
  }

  get visible(): boolean {
    return this.host.isConnected;
  }

  show(rect: DOMRect, c: TipContent, h: TipHandlers): void {
    this.rect = {
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
    };
    this.render(c, h);
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.position();
  }

  update(c: TipContent, h: TipHandlers): void {
    if (!this.visible) return;
    this.render(c, h);
    this.position();
  }

  setExplanation(text: string, isError = false): void {
    if (!this.expl) return;
    this.expl.textContent = text;
    this.expl.style.color = isError ? "#dc2626" : "";
    this.position();
  }

  hide(): void {
    this.host.remove();
    this.rect = null;
  }

  private render(c: TipContent, h: TipHandlers): void {
    const body = document.createElement("div");
    const orig = div("orig", truncate(c.original, 120));
    body.append(orig);
    if (c.state === "loading") body.append(div("tr spin", "Traduciendo…"));
    if (c.state === "error") body.append(div("err", c.error ?? "Error"));
    if (c.state === "done") {
      body.append(div("tr", c.translation ?? ""));
      if (c.provider) body.append(div("meta", c.provider));
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.append(
        btn("🔊", "Escuchar pronunciación", h.onSpeak),
        btn("⭐", "Guardar en vocabulario", h.onSave),
        btn("💡", "Explicar (Claude)", h.onExplain),
      );
      this.expl = div("expl", "");
      this.expl.hidden = true;
      body.append(bar, this.expl);
    } else {
      this.expl = null;
    }
    this.tip.replaceChildren(body);
  }

  /** Reveal the explanation box (called before filling it). */
  showExplanationBox(): void {
    if (this.expl) this.expl.hidden = false;
  }

  private position(): void {
    if (!this.rect) return;
    const r = this.rect;
    const tip = this.tip;
    const minX = window.scrollX + 4;
    const maxX = window.scrollX + document.documentElement.clientWidth - 4;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const { width, height } = tip.getBoundingClientRect();
    const gap = 8;
    let top = r.top - height - gap;
    if (top < window.scrollY + 4) top = r.bottom + gap; // not enough room above → below
    const left = Math.max(minX, Math.min(r.left + r.width / 2 - width / 2, maxX - width));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
}

function div(cls: string, text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

function btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
