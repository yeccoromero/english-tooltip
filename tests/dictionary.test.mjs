import test from "node:test";
import assert from "node:assert/strict";
import { parseEntry, formatDefinition } from "../src/shared/dictionary.ts";

const sample = [
  {
    word: "serendipity",
    phonetic: "/ˌsɛɹ.ənˈdɪp.ɪ.ti/",
    meanings: [
      { partOfSpeech: "noun", definitions: [{ definition: "Finding something good without looking for it.", example: "It was pure serendipity." }] },
    ],
  },
];

test("parseEntry extracts phonetic, pos, meaning, example", () => {
  assert.deepEqual(parseEntry(sample), {
    phonetic: "/ˌsɛɹ.ənˈdɪp.ɪ.ti/",
    pos: "noun",
    meaning: "Finding something good without looking for it.",
    example: "It was pure serendipity.",
  });
});
test("parseEntry falls back to phonetics[].text and skips empty meanings", () => {
  const d = parseEntry([{ phonetics: [{}, { text: "/x/" }], meanings: [{ partOfSpeech: "verb", definitions: [] }, { partOfSpeech: "noun", definitions: [{ definition: "d" }] }] }]);
  assert.deepEqual(d, { phonetic: "/x/", pos: "noun", meaning: "d", example: undefined });
});
test("parseEntry returns null for the API's not-found object", () => {
  assert.equal(parseEntry({ title: "No Definitions Found" }), null);
  assert.equal(parseEntry([]), null);
});
test("formatDefinition builds tooltip text", () => {
  assert.equal(formatDefinition(parseEntry(sample)), "/ˌsɛɹ.ənˈdɪp.ɪ.ti/ · noun\nFinding something good without looking for it.\n“It was pure serendipity.”");
});
