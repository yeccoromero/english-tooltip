import test from "node:test";
import assert from "node:assert/strict";
import { grade, dueQueue, isDue, streak, dayKey } from "../src/vocab/review.ts";

const w = (over = {}) => ({ text: "a", translation: "b", url: "u", savedAt: 1, ...over });
const DAY = 86_400_000;

test("new words are due", () => assert.equal(isDue(w(), 1000), true));
test("correct answer advances box and schedules days ahead", () => {
  const g = grade(w(), true, 1000);
  assert.equal(g.box, 1);
  assert.equal(g.due, 1000 + 1 * DAY);
  const g2 = grade(g, true, 1000);
  assert.equal(g2.box, 2);
  assert.equal(g2.due, 1000 + 2 * DAY);
});
test("box is capped", () => {
  assert.equal(grade(w({ box: 6 }), true, 0).box, 6);
});
test("wrong answer resets to box 0, due in a minute", () => {
  const g = grade(w({ box: 4 }), false, 1000);
  assert.equal(g.box, 0);
  assert.equal(g.due, 61_000);
});
test("queue holds only due words, most overdue first", () => {
  const q = dueQueue([w({ savedAt: 1, due: 500 }), w({ savedAt: 2, due: 9999 }), w({ savedAt: 3, due: 100 })], 1000);
  assert.deepEqual(q.map((x) => x.savedAt), [3, 1]);
});

test("streak counts consecutive days ending today", () => {
  const now = new Date(2026, 8, 30, 12).getTime();
  const k = (d) => dayKey(now - d * DAY);
  assert.equal(streak({ [k(0)]: 3, [k(1)]: 1, [k(2)]: 5 }, now), 3);
  assert.equal(streak({ [k(1)]: 1, [k(2)]: 2 }, now), 2); // not reviewed yet today: still alive
  assert.equal(streak({ [k(0)]: 1, [k(2)]: 2 }, now), 1); // gap breaks it
  assert.equal(streak({}, now), 0);
  assert.equal(streak({ [k(3)]: 4 }, now), 0);
});
