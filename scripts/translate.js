import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { computeRankings } from "../src/rank.js";
import { readJson, writeJson } from "../src/store.js";
import { buildPrompt, parseReply, pendingTranslations, pruneTranslations, withTranslations } from "../src/translate.js";

if (process.env.CI !== undefined && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.log("translate: skipped (no CLAUDE_CODE_OAUTH_TOKEN)");
  process.exit(0);
}

const repos = readJson("data/repos.json");
const translationsPath = "data/translations.json";
let translations = {};
try {
  translations = JSON.parse(await readFile(translationsPath, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const pending = pendingTranslations(repos, translations);
const batchSize = 40;
let added = 0;
let failed = 0;

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  let replies;
  try {
    const response = spawnSync("claude", ["-p", "--output-format", "json", "--max-turns", "1", "--model", "haiku"], {
      input: buildPrompt(batch.map(({ text }) => text)),
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (response.error) throw new Error(response.error.code || "CLI could not start");
    if (response.status !== 0) throw new Error(response.signal || `exit status ${response.status}`);

    let output;
    try {
      output = JSON.parse(response.stdout);
    } catch {
      throw new Error("invalid CLI JSON");
    }
    if (output?.is_error === true) throw new Error("CLI reported an error");
    if (typeof output?.result !== "string") throw new Error("missing CLI result text");
    replies = parseReply(output.result, batch.length);
  } catch (err) {
    console.warn(`warning: translate batch ${offset / batchSize + 1} failed: ${err.message}`);
    failed += batch.length;
    continue;
  }

  for (const [i, { fullName, text }] of batch.entries()) {
    const zh = replies[i];
    if (zh === null) {
      failed++;
    } else {
      translations[fullName] = { source: text, zh };
      added++;
    }
  }
}

translations = pruneTranslations(translations, repos);
writeJson(translationsPath, translations);

if (added > 0) {
  const history = readJson("data/history.json");
  const { updatedAt } = readJson("data/rankings.json");
  writeJson("data/rankings.json", computeRankings(history, withTranslations(repos, translations), updatedAt));
}

console.log(`translate: added ${added}, failed ${failed}, total ${Object.keys(translations).length}`);
