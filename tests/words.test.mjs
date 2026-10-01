import test from "node:test";
import assert from "node:assert/strict";
import { applySave, applyAnswer, applyRemove, applyClear, applyImport, normalize, live, keyOf } from "../src/shared/words.ts";

const w = (o = {}) => ({ text: "Serendipity", translation: "serendipia", url: "u", savedAt: 100, ...o });

test("keyOf is case-insensitive", () => assert.equal(keyOf("Serendipity"), keyOf("serendipity")));

test("normalize queues legacy words for upload", () => {
  const [n] = normalize([w()]);
  assert.equal(n.updatedAt, 100);
  assert.equal(n.dirty, true);
  assert.equal(normalize([w({ updatedAt: 5, dirty: false })])[0].dirty, false);
});

test("applySave adds a new word as dirty", () => {
  const out = applySave([], w(), 500);
  assert.equal(out.length, 1);
  assert.equal(out[0].updatedAt, 500);
  assert.equal(out[0].dirty, true);
});

test("applySave keeps progress, id and creation date of an existing word (case-insensitive)", () => {
  const old = w({ box: 3, due: 9999, reps: 4, lapses: 1, remoteId: "r1", savedAt: 50, dirty: false, updatedAt: 60 });
  const out = applySave([old], w({ text: "serendipity", translation: "nueva", context: "ctx", savedAt: 700 }), 800);
  assert.equal(out.length, 1);
  assert.equal(out[0].translation, "nueva");
  assert.equal(out[0].context, "ctx");
  assert.equal(out[0].box, 3);
  assert.equal(out[0].remoteId, "r1");
  assert.equal(out[0].savedAt, 50);
  assert.equal(out[0].dirty, true);
  assert.equal(out[0].updatedAt, 800);
});

test("applySave revives a deleted word", () => {
  const out = applySave([w({ deletedAt: 10, remoteId: "r1" })], w(), 900);
  assert.equal(out[0].deletedAt, undefined);
  assert.equal(live(out).length, 1);
});

test("applyAnswer grades, counts reps/lapses and marks dirty", () => {
  const out = applyAnswer([w({ box: 1, reps: 2 })], "serendipity", true, 1000);
  assert.equal(out[0].box, 2);
  assert.equal(out[0].reps, 3);
  assert.equal(out[0].dirty, true);
  assert.equal(out[0].updatedAt, 1000);
  const miss = applyAnswer([w({ box: 4 })], "serendipity", false, 1000);
  assert.equal(miss[0].box, 0);
  assert.equal(miss[0].lapses, 1);
});

test("applyAnswer ignores deleted words", () => {
  const out = applyAnswer([w({ deletedAt: 1 })], "serendipity", true, 1000);
  assert.equal(out[0].reps, undefined);
});

test("applyRemove leaves a dirty tombstone", () => {
  const out = applyRemove([w()], "serendipity", 2000);
  assert.equal(out[0].deletedAt, 2000);
  assert.equal(out[0].dirty, true);
  assert.equal(live(out).length, 0);
});

test("applyClear tombstones everything once", () => {
  const out = applyClear([w(), w({ text: "b", deletedAt: 5 })], 3000);
  assert.equal(out[0].deletedAt, 3000);
  assert.equal(out[1].deletedAt, 5);
});

test("applyImport adds unknown words and keeps the newer version", () => {
  const mine = [w({ updatedAt: 500, translation: "mine", remoteId: "r1" })];
  const out = applyImport(mine, [
    { text: "serendipity", translation: "older", url: "", savedAt: 1, updatedAt: 100 },
    { text: "ubiquitous", translation: "omnipresente", url: "", savedAt: 2 },
    { bogus: true },
  ], 9999);
  assert.equal(out.length, 2);
  assert.equal(out.find((x) => x.text === "Serendipity").translation, "mine");
  assert.equal(out.find((x) => x.text === "ubiquitous").dirty, true);
  const newer = applyImport(mine, [{ text: "SERENDIPITY", translation: "newer", url: "", savedAt: 1, updatedAt: 900 }], 9999);
  assert.equal(newer[0].translation, "newer");
  assert.equal(newer[0].remoteId, "r1");
});
