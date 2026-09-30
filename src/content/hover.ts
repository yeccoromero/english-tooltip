const WORD_CHAR = /[\p{L}\p{M}'’-]/u;

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const r = d.caretRangeFromPoint?.(x, y);
  if (r) return { node: r.startContainer, offset: r.startOffset };
  const p = d.caretPositionFromPoint?.(x, y);
  return p ? { node: p.offsetNode, offset: p.offset } : null;
}

export function isEditable(el: Element | null): boolean {
  return !!el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

/** The word under the mouse pointer and its on-screen rect, or null if the pointer isn't on a word. */
export function wordAtPoint(x: number, y: number): { text: string; rect: DOMRect; range: Range } | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  const str = caret.node.textContent ?? "";
  let start = Math.min(caret.offset, str.length);
  let end = start;
  while (start > 0 && WORD_CHAR.test(str[start - 1])) start--;
  while (end < str.length && WORD_CHAR.test(str[end])) end++;
  const raw = str.slice(start, end);
  const text = raw.replace(/^['’-]+|['’-]+$/g, "");
  if (text.replace(/[^\p{L}]/gu, "").length < 2) return null;

  const range = document.createRange();
  range.setStart(caret.node, start);
  range.setEnd(caret.node, end);
  for (const rect of range.getClientRects()) {
    // The caret API snaps to the nearest text, so make sure the pointer is really over the word.
    if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) {
      return { text, rect: range.getBoundingClientRect(), range };
    }
  }
  return null;
}
