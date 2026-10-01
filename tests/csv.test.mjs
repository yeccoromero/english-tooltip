import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvToWords } from "../src/shared/csv.ts";

test("parseCsv handles quotes, commas, newlines, BOM and CRLF", () => {
  const rows = parseCsv('﻿"say ""hi""","di hola, amigo","line1\nline2",""\r\nb,c,,\r\n');
  assert.deepEqual(rows, [['say "hi"', "di hola, amigo", "line1\nline2", ""], ["b", "c", "", ""]]);
});

test("csvToWords reads the 4-column export (word, translation, context, url)", () => {
  const [w] = csvToWords('"serendipity","serendipia","She felt serendipity!","https://x.com/a"');
  assert.equal(w.text, "serendipity");
  assert.equal(w.translation, "serendipia");
  assert.equal(w.context, "She felt serendipity!");
  assert.equal(w.url, "https://x.com/a");
});

test("csvToWords reads the older 3-column export (url in column 3)", () => {
  const [w] = csvToWords('"ubiquitous","omnipresente","https://x.com/b"');
  assert.equal(w.context, undefined);
  assert.equal(w.url, "https://x.com/b");
});

test("csvToWords skips incomplete rows", () => {
  assert.equal(csvToWords('"only word"\n,"only translation"\n"a","b"').length, 1);
});
