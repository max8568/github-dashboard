const DAY_MS = 86400000;

export function reconstructDaily(total, starredAt, today, days = 30) {
  const starDates = starredAt.map((s) => s.slice(0, 10));
  const out = {};
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.parse(today) - i * DAY_MS).toISOString().slice(0, 10);
    out[d] = total - starDates.filter((s) => s > d).length;
  }
  return out;
}

export function nextToBackfill(watchlist) {
  return Object.entries(watchlist)
    .filter(([, e]) => e.backfill === "pending")
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name]) => name);
}
