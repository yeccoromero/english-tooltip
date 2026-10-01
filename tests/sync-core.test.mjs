import test from "node:test";
import assert from "node:assert/strict";
import { toRemote, fromRemote, mergeRemote } from "../src/shared/sync-core.ts";

const iso = (ms) => new Date(ms).toISOString();
const local = (o = {}) => ({ text: "Serendipity", translation: "serendipia", url: "u", savedAt: 1000, updatedAt: 2000, dirty: true, ...o });
const remote = (o = {}) => ({
  id: "r1", text: "serendipity", translation: "serendipia!", context: null, url: null, definition: null,
  box: 2, due: iso(5000), reps: 3, lapses: 1, created_at: iso(1000), updated_at: iso(3000), deleted_at: null, ...o,
});

test("toRemote maps every field and always includes all keys", () => {
  const r = toRemote(local({ box: 3, due: 7000, context: "ctx", definition: { meaning: "m" }, deletedAt: 8000 }));
  assert.deepEqual(Object.keys(r).sort(), ["box", "context", "created_at", "deleted_at", "definition", "due", "lapses", "reps", "text", "translation", "updated_at", "url"].sort());
  assert.equal(r.box, 3);
  assert.equal(r.due, iso(7000));
  assert.equal(r.created_at, iso(1000));
  assert.equal(r.updated_at, iso(2000));
  assert.equal(r.deleted_at, iso(8000));
  assert.equal(r.context, "ctx");
  const bare = toRemote(local());
  assert.equal(bare.context, null);
  assert.equal(bare.deleted_at, null);
  assert.equal(bare.reps, 0);
});

test("toRemote respects the database limits", () => {
  const r = toRemote(local({ text: "x".repeat(900), translation: "y".repeat(3000), context: "z".repeat(900), url: "u".repeat(3000), box: 99 }));
  assert.equal(r.text.length, 500);
  assert.equal(r.translation.length, 2000);
  assert.equal(r.context.length, 600);
  assert.equal(r.url.length, 2000);
  assert.equal(r.box, 10);
});

test("fromRemote builds a synced local word", () => {
  const w = fromRemote(remote({ context: "c", definition: { meaning: "m" } }));
  assert.equal(w.remoteId, "r1");
  assert.equal(w.dirty, false);
  assert.equal(w.due, 5000);
  assert.equal(w.updatedAt, 3000);
  assert.equal(w.savedAt, 1000);
  assert.equal(w.context, "c");
  assert.equal(w.url, "");
  assert.equal(w.deletedAt, undefined);
});

test("merge: unknown remote word is added; remote-only tombstone is not", () => {
  assert.equal(mergeRemote([], [remote()]).length, 1);
  assert.equal(mergeRemote([], [remote({ deleted_at: iso(4000) })]).length, 0);
});

test("merge: remote newer wins", () => {
  const out = mergeRemote([local({ updatedAt: 2000 })], [remote({ updated_at: iso(3000) })]);
  assert.equal(out[0].translation, "serendipia!");
  assert.equal(out[0].dirty, false);
  assert.equal(out[0].remoteId, "r1");
});

test("merge: local newer is kept and stays dirty, gains remoteId", () => {
  const out = mergeRemote([local({ updatedAt: 4000, translation: "mine" })], [remote({ updated_at: iso(3000) })]);
  assert.equal(out[0].translation, "mine");
  assert.equal(out[0].dirty, true);
  assert.equal(out[0].remoteId, "r1");
});

test("merge: same timestamp = our own push echoed back → synced", () => {
  const out = mergeRemote([local({ updatedAt: 3000 })], [remote({ updated_at: iso(3000) })]);
  assert.equal(out[0].dirty, false);
  assert.equal(out[0].remoteId, "r1");
});

test("merge: remote deletion newer than local edit deletes locally (tombstone dropped when synced)", () => {
  const out = mergeRemote([local({ updatedAt: 2000 })], [remote({ updated_at: iso(3000), deleted_at: iso(3000) })]);
  assert.equal(out.length, 0);
});

test("merge: local deletion not yet pushed survives as dirty tombstone", () => {
  const out = mergeRemote([local({ updatedAt: 5000, deletedAt: 5000, dirty: true })], [remote({ updated_at: iso(3000) })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].deletedAt, 5000);
});

test("merge: matching is case-insensitive", () => {
  const out = mergeRemote([local({ text: "SERENDIPITY", updatedAt: 1000 })], [remote({ text: "serendipity", updated_at: iso(3000) })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "serendipity");
});
