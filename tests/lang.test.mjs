import test from "node:test";
import assert from "node:assert/strict";
import { guessLang, normalize, langName, matchPunctuation, sentenceAt } from "../src/shared/lang.ts";

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
  assert.equal(normalize("  hello   \n  world\t "), "hello\nworld");
});
test("langName is Spanish", () => {
  assert.equal(langName("en"), "inglés");
});

test("punctuation: keeps final period / comma of the original", () => {
  assert.equal(matchPunctuation("Hello, world.", "Hola mundo", "es"), "Hola mundo.");
  assert.equal(matchPunctuation("Well,", "Bueno", "es"), "Bueno,");
});
test("punctuation: drops punctuation the translator added", () => {
  assert.equal(matchPunctuation("serendipity", "serendipia.", "es"), "serendipia");
});
test("punctuation: Spanish ¿ ¡ are added when the original asks / exclaims", () => {
  assert.equal(matchPunctuation("Are you ok?", "Estás bien", "es"), "¿Estás bien?");
  assert.equal(matchPunctuation("Wow!", "Guau", "es"), "¡Guau!");
  assert.equal(matchPunctuation("Are you ok?", "¿Estás bien?", "es"), "¿Estás bien?");
});
test("punctuation: target English has no ¿ ¡", () => {
  assert.equal(matchPunctuation("¿Cómo estás?", "¿How are you", "en"), "How are you?");
});
test("punctuation: ellipsis is kept", () => {
  assert.equal(matchPunctuation("Well...", "Bueno.", "es"), "Bueno...");
});

test("sentenceAt returns the sentence around the span", () => {
  const full = "First one. She felt serendipity at the door! Then left.";
  const idx = full.indexOf("serendipity");
  assert.equal(sentenceAt(full, idx, "serendipity".length), "She felt serendipity at the door!");
  assert.equal(sentenceAt(full, 0, 5), "First one.");
  assert.equal(sentenceAt(full, full.indexOf("Then"), 4), "Then left.");
});
test("sentenceAt stops at line breaks", () => {
  const full = "Title line\nThe word here matters";
  assert.equal(sentenceAt(full, full.indexOf("word"), 4), "The word here matters");
});
