import { normalize, sentenceAt } from "../shared/lang";

const BLOCK = "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, dd, figcaption, article, section, div";
const MAX = 300;

/** The sentence around a selection/word, or undefined when it adds nothing (same as the text, or too long). */
export function contextFor(range: Range, text: string): string | undefined {
  try {
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const block = el?.closest(BLOCK);
    if (!block) return undefined;
    const full = normalize(block.textContent ?? "");
    const idx = full.toLowerCase().indexOf(text.toLowerCase());
    if (idx < 0) return undefined;
    const sentence = sentenceAt(full, idx, text.length);
    if (!sentence || sentence.length > MAX || sentence.toLowerCase() === text.toLowerCase()) return undefined;
    return sentence;
  } catch {
    return undefined;
  }
}
