const DAY_MS = 86400000;

const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export function dailyNewStars(weeks) {
  const out = {};
  for (const { week, days } of weeks) {
    days.forEach((n, i) => {
      out[dateOf(week * 1000 + i * DAY_MS)] = n;
    });
  }
  return out;
}

export function reconstructDaily(total, dailyNew, today, days = 30) {
  const out = {};
  for (let i = days; i >= 0; i--) {
    const d = dateOf(Date.parse(today) - i * DAY_MS);
    let later = 0;
    for (const [x, n] of Object.entries(dailyNew)) if (x > d && x <= today) later += n;
    out[d] = total - later;
  }
  return out;
}

export function nextToBackfill(watchlist) {
  return Object.entries(watchlist)
    .filter(([, e]) => e.backfill === "pending")
    .sort((a, b) => a[1].priority - b[1].priority)
    .map(([name]) => name);
}
