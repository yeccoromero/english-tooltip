import test from "node:test";
import assert from "node:assert/strict";
import { looksEnglish, normalize } from "../src/shared/lang.ts";

test("detects English", () => {
  assert.equal(looksEnglish("The quick brown fox jumps over the lazy dog"), true);
  assert.equal(looksEnglish("serendipity"), true); // single ambiguous word → allowed
});
test("rejects Spanish and other scripts", () => {
  assert.equal(looksEnglish("El perro de mi vecino es muy grande"), false);
  assert.equal(looksEnglish("¿Cómo estás?"), false);
  assert.equal(looksEnglish("日本語のテキスト"), false);
  assert.equal(looksEnglish("12345"), false);
});
test("normalize collapses whitespace", () => {
  assert.equal(normalize("  hello \n  world\t "), "hello world");
});
