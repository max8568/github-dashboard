import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTrending } from "../src/sources.js";

test("parseTrending extracts owner/name from the trending fixture", () => {
  const html = readFileSync(new URL("./fixtures/trending.html", import.meta.url), "utf8");
  const names = parseTrending(html);
  assert.ok(names.length >= 10 && names.length <= 25, `got ${names.length}`);
  for (const n of names) assert.match(n, /^[\w.-]+\/[\w.-]+$/);
  assert.equal(new Set(names).size, names.length);
});

test("parseTrending returns [] when there are no repo rows", () => {
  assert.deepEqual(parseTrending("<html></html>"), []);
});
