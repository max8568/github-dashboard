import { mergeBackfill, readJson, writeJson } from "../src/store.js";
import { computeRankings } from "../src/rank.js";
import { reconstructDaily, dailyNewStars, nextToBackfill } from "../src/backfill.js";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const MIN_RATE = 100;

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "github-dashboard",
};

let rate = Infinity;
async function get(url) {
  const res = await fetch(url, { headers });
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (!Number.isNaN(remaining)) rate = remaining;
  return res;
}

let watchlist = readJson("data/watchlist.json");
let history = readJson("data/history.json");
const repos = readJson("data/repos.json");

let done = 0;
let skipped = 0;

for (const name of nextToBackfill(watchlist)) {
  const infoRes = await get(`https://api.github.com/repos/${name}`);
  if (infoRes.status === 404) {
    watchlist[name] = { ...watchlist[name], backfill: "skipped" };
    skipped++;
  } else if (!infoRes.ok) {
    console.warn(`warning: ${name} repo info returned ${infoRes.status}`);
  } else if (rate >= MIN_RATE) {
    const total = (await infoRes.json()).stargazers_count;
    const res = await get(`https://api.github.com/repos/${name}/stargazers/history`);
    if (res.status !== 200) {
      console.warn(`warning: ${name} stargazers/history returned ${res.status}`);
    } else {
      const weeks = await res.json();
      history = mergeBackfill(history, name, reconstructDaily(total, dailyNewStars(weeks), today));
      watchlist[name] = { ...watchlist[name], backfill: "done" };
      done++;
    }
  }
  if (rate < MIN_RATE) break;
}

writeJson("data/watchlist.json", watchlist);
writeJson("data/history.json", history);
writeJson("data/rankings.json", computeRankings(history, repos, today));

const pending = nextToBackfill(watchlist).length;
console.log(`done ${done}, skipped ${skipped}, still pending ${pending}, rate remaining ${rate}`);
