import { addCandidates, pruneWatchlist, recordCounts, readJson, writeJson } from "../src/store.js";
import { computeRankings } from "../src/rank.js";
import { fetchTrending, searchNewRepos } from "../src/sources.js";
import { fetchRepoInfo } from "../src/github.js";
import { withTranslations } from "../src/translate.js";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
let warnings = 0;

let watchlist = readJson("data/watchlist.json");
let history = readJson("data/history.json");
let repos = readJson("data/repos.json");
let translations = {};
try {
  translations = readJson("data/translations.json");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const sources = [
  ["trending monthly", 0, () => fetchTrending("monthly")],
  ["trending weekly", 1, () => fetchTrending("weekly")],
  ["trending daily", 2, () => fetchTrending("daily")],
  ["search", 3, () => searchNewRepos(token, today)],
];
for (const [label, priority, fetchNames] of sources) {
  try {
    const names = await fetchNames();
    if (names.length === 0) {
      console.warn(`warning: ${label} returned 0 items`);
      warnings++;
      continue;
    }
    watchlist = addCandidates(watchlist, names, priority, today);
  } catch (err) {
    console.warn(`warning: ${label} failed: ${err.message}`);
    warnings++;
  }
}

const info = await fetchRepoInfo(token, Object.keys(watchlist));
const counts = Object.fromEntries(Object.entries(info).map(([name, r]) => [name, r.stars]));
history = recordCounts(history, counts, today);
repos = { ...repos, ...info };

const pruned = pruneWatchlist(watchlist, history, today);
watchlist = pruned.watchlist;
history = pruned.history;
repos = Object.fromEntries(Object.entries(repos).filter(([name]) => name in watchlist));

writeJson("data/watchlist.json", watchlist);
writeJson("data/history.json", history);
writeJson("data/repos.json", repos);
writeJson("data/rankings.json", computeRankings(history, withTranslations(repos, translations), today));

console.log(`watched ${Object.keys(watchlist).length}, recorded ${Object.keys(counts).length}, warnings ${warnings}`);
