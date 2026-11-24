import { test } from "node:test";
import assert from "node:assert/strict";
import { addCandidates, pruneWatchlist, mergeBackfill } from "../src/store.js";

test("addCandidates adds new names as pending", () => {
  assert.deepEqual(addCandidates({}, ["a/b"], 2, "2026-11-20"), {
    "a/b": { lastSeen: "2026-11-20", priority: 2, backfill: "pending" },
  });
});

test("addCandidates refreshes existing names and keeps lowest priority", () => {
  const wl = { "a/b": { lastSeen: "2026-11-01", priority: 2, backfill: "done" } };
  assert.deepEqual(addCandidates(wl, ["a/b"], 0, "2026-11-20"), {
    "a/b": { lastSeen: "2026-11-20", priority: 0, backfill: "done" },
  });
});

test("pruneWatchlist removes entries idle more than 30 days with their history", () => {
  const wl = {
    "old/x": { lastSeen: "2026-10-20", priority: 1, backfill: "done" },
    "new/y": { lastSeen: "2026-10-21", priority: 1, backfill: "done" },
  };
  const hist = { "old/x": { "2026-10-20": 5 }, "new/y": { "2026-10-21": 6 } };
  const out = pruneWatchlist(wl, hist, "2026-11-20");
  assert.deepEqual(Object.keys(out.watchlist), ["new/y"]);
  assert.deepEqual(Object.keys(out.history), ["new/y"]);
});

test("recordCounts writes today's count per repo", async () => {
  const { recordCounts } = await import("../src/store.js");
  assert.deepEqual(recordCounts({ "a/b": { "2026-11-19": 9 } }, { "a/b": 10, "c/d": 3 }, "2026-11-20"), {
    "a/b": { "2026-11-19": 9, "2026-11-20": 10 },
    "c/d": { "2026-11-20": 3 },
  });
});

test("mergeBackfill never overwrites an existing date", () => {
  const out = mergeBackfill({ "a/b": { "2026-11-20": 100 } }, "a/b", { "2026-11-19": 90, "2026-11-20": 99 });
  assert.deepEqual(out["a/b"], { "2026-11-19": 90, "2026-11-20": 100 });
});

test("readJson/writeJson round-trip with 2-space indent and trailing newline", async () => {
  const { readJson, writeJson } = await import("../src/store.js");
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const p = join(mkdtempSync(join(tmpdir(), "store-")), "x.json");
  writeJson(p, { a: 1 });
  assert.equal(readFileSync(p, "utf8"), '{\n  "a": 1\n}\n');
  assert.deepEqual(readJson(p), { a: 1 });
});

test("snapshotDate labels a run with the nearest UTC midnight", async () => {
  const { snapshotDate } = await import("../src/store.js");
  // 03:47 Taiwan on 11/25 = 19:47 UTC on 11/24 → start of 11/25
  assert.equal(snapshotDate(Date.parse("2026-11-24T19:47:00Z")), "2026-11-25");
  // the same run delayed 8 hours still lands on 11/25
  assert.equal(snapshotDate(Date.parse("2026-11-25T03:47:00Z")), "2026-11-25");
});
