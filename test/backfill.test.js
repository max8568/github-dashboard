import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructDaily, nextToBackfill } from "../src/backfill.js";

test("reconstructDaily subtracts later stars from the total", () => {
  assert.deepEqual(
    reconstructDaily(100, ["2026-11-20T01:00:00Z", "2026-11-19T05:00:00Z", "2026-11-19T06:00:00Z"], "2026-11-20", 2),
    { "2026-11-18": 97, "2026-11-19": 99, "2026-11-20": 100 },
  );
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
