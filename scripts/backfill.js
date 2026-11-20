import { mergeBackfill, readJson, writeJson } from "../src/store.js";
import { computeRankings } from "../src/rank.js";
import { reconstructDaily, nextToBackfill } from "../src/backfill.js";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
const MAX_TOTAL = 40000;
const MIN_RATE = 100;

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.star+json",
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

outer: for (const name of nextToBackfill(watchlist)) {
  const infoRes = await get(`https://api.github.com/repos/${name}`);
  if (infoRes.status === 404) {
    watchlist[name] = { ...watchlist[name], backfill: "skipped" };
    skipped++;
  } else if (!infoRes.ok) {
    console.warn(`warning: ${name} repo info returned ${infoRes.status}`);
  } else {
    const total = (await infoRes.json()).stargazers_count;
    if (total > MAX_TOTAL) {
      watchlist[name] = { ...watchlist[name], backfill: "skipped" };
      skipped++;
    } else {
      const starredAt = [];
      let ok = true;
      for (let page = Math.max(1, Math.ceil(total / 100)); page >= 1; page--) {
        const res = await get(`https://api.github.com/repos/${name}/stargazers?per_page=100&page=${page}`);
        if (!res.ok) {
          console.warn(`warning: ${name} stargazers page ${page} returned ${res.status}`);
          ok = false;
          break;
        }
        const items = await res.json();
        for (const item of items) starredAt.push(item.starred_at);
        const oldest = items.length ? items[0].starred_at.slice(0, 10) : null;
        if (rate < MIN_RATE) {
          ok = false;
          break;
        }
        if (oldest && oldest < cutoff) break;
      }
      if (ok) {
        history = mergeBackfill(history, name, reconstructDaily(total, starredAt, today));
        watchlist[name] = { ...watchlist[name], backfill: "done" };
        done++;
      }
    }
  }
  if (rate < MIN_RATE) break outer;
}

writeJson("data/watchlist.json", watchlist);
writeJson("data/history.json", history);
writeJson("data/rankings.json", computeRankings(history, repos, today));

const pending = nextToBackfill(watchlist).length;
console.log(`done ${done}, skipped ${skipped}, still pending ${pending}, rate remaining ${rate}`);
