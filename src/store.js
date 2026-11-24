import { readFileSync, writeFileSync } from "node:fs";

const DAY_MS = 86400000;

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

// Daily counts are start-of-day snapshots, so a run is labeled with the nearest UTC midnight.
export function snapshotDate(now = Date.now()) {
  return new Date(now + DAY_MS / 2).toISOString().slice(0, 10);
}

export function addCandidates(watchlist, names, priority, today) {
  const out = { ...watchlist };
  for (const name of names) {
    const old = out[name];
    out[name] = old
      ? { ...old, lastSeen: today, priority: Math.min(old.priority, priority) }
      : { lastSeen: today, priority, backfill: "pending" };
  }
  return out;
}

export function pruneWatchlist(watchlist, history, today, maxIdleDays = 30) {
  const nextWatchlist = {};
  const nextHistory = { ...history };
  for (const [name, entry] of Object.entries(watchlist)) {
    if (daysBetween(entry.lastSeen, today) > maxIdleDays) delete nextHistory[name];
    else nextWatchlist[name] = entry;
  }
  return { watchlist: nextWatchlist, history: nextHistory };
}

export function recordCounts(history, counts, today) {
  const out = { ...history };
  for (const [name, count] of Object.entries(counts)) {
    out[name] = { ...out[name], [today]: count };
  }
  return out;
}

export function mergeBackfill(history, fullName, daily) {
  return { ...history, [fullName]: { ...daily, ...history[fullName] } };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}
