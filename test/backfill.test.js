import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructDaily, dailyNewStars, nextToBackfill } from "../src/backfill.js";

test("reconstructDaily subtracts later stars from the total", () => {
  assert.deepEqual(
    reconstructDaily(100, { "2026-11-19": 2, "2026-11-20": 1 }, "2026-11-20", 2),
    { "2026-11-18": 97, "2026-11-19": 99, "2026-11-20": 100 },
  );
});

test("dailyNewStars expands each week into 7 dated entries", () => {
  const out = dailyNewStars([{ week: 1794700800, days: [783, 753, 662, 491, 376, 0, 0] }]);
  assert.equal(out["2026-11-15"], 783);
  assert.equal(out["2026-11-20"], 0);
  assert.equal(out["2026-11-21"], 0);
  assert.equal(Object.keys(out).length, 7);
});

test("nextToBackfill lists pending names by priority", () => {
  assert.deepEqual(
    nextToBackfill({
      a: { priority: 3, backfill: "pending" },
      b: { priority: 0, backfill: "pending" },
      c: { priority: 0, backfill: "done" },
    }),
    ["b", "a"],
  );
});
