import test from "node:test";
import assert from "node:assert/strict";
import { guessLang, normalize, langName } from "../src/shared/lang.ts";

test("guesses English", () => {
  assert.equal(guessLang("The quick brown fox jumps over the lazy dog"), "en");
});
test("guesses Spanish", () => {
  assert.equal(guessLang("El perro de mi vecino es muy grande"), "es");
  assert.equal(guessLang("¿Cómo estás?"), "es");
});
test("short English snippets are not misread as Spanish", () => {
  for (const t of ["no", "me", "no way", "let me know", "a lot"]) assert.notEqual(guessLang(t), "es", t);
});
test("unsure → null (auto-detect later)", () => {
  assert.equal(guessLang("serendipity"), null);
  assert.equal(guessLang("日本語のテキスト"), null);
  assert.equal(guessLang("12345"), null);
});
test("normalize collapses whitespace", () => {
  assert.equal(normalize("  hello \n  world\t "), "hello world");
});
test("langName is Spanish", () => {
  assert.equal(langName("en"), "inglés");
});
