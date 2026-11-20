import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRepoQuery, parseRepoResponse } from "../src/github.js";

test("buildRepoQuery aliases each repo", () => {
  const q = buildRepoQuery(["a/b"]);
  assert.ok(q.includes('r0: repository(owner: "a", name: "b")'));
});

test("parseRepoResponse skips null aliases and normalizes fields", () => {
  const json = {
    data: {
      r0: { stargazerCount: 5, url: "u", description: null, primaryLanguage: null },
      r1: null,
    },
    errors: [{}],
  };
  assert.deepEqual(parseRepoResponse(["a/b", "c/d"], json), {
    "a/b": { url: "u", description: "", language: "", stars: 5 },
  });
});
