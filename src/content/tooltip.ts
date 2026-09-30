const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.tip, .side {
  position: absolute; z-index: 2147483647;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #111827; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,.14);
}
@media (prefers-color-scheme: dark) {
  .tip, .side { color: #f3f4f6; background: #1f2937; border-color: #374151; }
  button:hover { background: #374151 !important; }
}
.tip { width: max-content; max-width: 340px; padding: 8px 12px; }
.tr { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
.tr.spin { font-weight: 400; opacity: .6; }
.err { font-size: 13px; color: #dc2626; }
.expl { margin-top: 8px; padding-top: 8px; border-top: 1px solid #9ca3af44; font-size: 13px; font-weight: 400; white-space: pre-wrap; }
.side { display: flex; gap: 2px; padding: 3px; }
button {
  all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center; font-size: 13px;
}
button:hover { background: #f3f4f6; }
[hidden] { display: none !important; }
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

type Box = { top: number; bottom: number; left: number; width: number };

export class Tooltip {
  private host: HTMLElement;
  private tip: HTMLElement;
  private side: HTMLElement;
  private rect: Box | null = null;
  private expl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;

  constructor() {
    this.host = document.createElement("english-tooltip");
    this.host.style.cssText = "all:initial;position:absolute;top:0;left:0;z-index:2147483647;";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.tip = document.createElement("div");
    this.tip.className = "tip";
    this.side = document.createElement("div");
    this.side.className = "side";
    root.append(style, this.tip, this.side);
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

  hide(): void {
    this.host.remove();
    this.rect = null;
  }

  /** Fill the on-demand explanation inside the tooltip. */
  setExplanation(text: string, isError = false): void {
    if (!this.expl) return;
    this.expl.hidden = false;
    this.expl.textContent = text;
    this.expl.style.color = isError ? "#dc2626" : "";
    this.position();
  }

  setSaved(): void {
    if (this.saveBtn) {
      this.saveBtn.textContent = "★";
      this.saveBtn.title = "Guardado";
    }
  }

  private render(c: TipContent, h: TipHandlers): void {
    this.expl = null;
    this.saveBtn = null;
    this.tip.removeAttribute("title");
    const body = document.createElement("div");

    if (c.state === "loading") {
      body.append(div("tr spin", "Traduciendo…"));
    } else if (c.state === "error") {
      body.append(div("err", c.error ?? "Error"));
    } else {
      body.append(div("tr", c.translation ?? ""));
      this.expl = div("expl", "");
      this.expl.hidden = true;
      body.append(this.expl);
      if (c.provider) this.tip.title = c.provider;
    }
    this.tip.replaceChildren(body);

    // Actions live in their own module beside the tooltip (only once there is a translation).
    this.side.hidden = c.state !== "done";
    if (c.state === "done") {
      this.saveBtn = btn("☆", "Guardar en vocabulario", h.onSave);
      this.side.replaceChildren(btn("🔊", "Escuchar pronunciación", h.onSpeak), this.saveBtn, btn("💡", "Explicar (Claude)", h.onExplain));
    }
  }

  private position(): void {
    if (!this.rect) return;
    const r = this.rect;
    const minX = window.scrollX + 4;
    const maxX = window.scrollX + document.documentElement.clientWidth - 4;
    const gap = 8;

    this.tip.style.left = "0px";
    this.tip.style.top = "0px";
    const { width: tw, height: th } = this.tip.getBoundingClientRect();
    const sideShown = !this.side.hidden;
    const { width: sw, height: sh } = sideShown ? this.side.getBoundingClientRect() : { width: 0, height: 0 };
    const sideGap = sideShown ? 6 : 0;

    // Center the tooltip over the selection, leaving room for the side module.
    let top = r.top - th - gap;
    if (top < window.scrollY + 4) top = r.bottom + gap; // no room above → below
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(minX, Math.min(left, maxX - tw - sw - sideGap));

    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
    if (sideShown) {
      this.side.style.left = `${left + tw + sideGap}px`;
      this.side.style.top = `${top + (th - sh) / 2}px`;
    }
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
