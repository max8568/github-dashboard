const DAY_MS = 86400000;
const toMs = (date) => Date.parse(date + 'T00:00:00Z');
const addDays = (date, n) => new Date(toMs(date) + n * DAY_MS).toISOString().slice(0, 10);

function buildWindow(history, repos, today, windowDays, limit) {
  const start = addDays(today, -windowDays);
  const dates = [];
  for (let i = 0; i <= windowDays; i++) dates.push(addDays(start, i));

  const eligible = [];
  for (const [fullName, byDate] of Object.entries(history)) {
    if (byDate[today] === undefined) continue;
    const known = Object.keys(byDate).sort();
    const onOrBefore = known.filter((d) => d <= start);
    const base = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : known[0];
    const baseCount = byDate[base];
    const repo = repos[fullName] || {};
    eligible.push({
      fullName,
      url: repo.url || `https://github.com/${fullName}`,
      description: repo.description || '',
      language: repo.language || '',
      stars: repo.stars !== undefined ? repo.stars : byDate[today],
      gain: byDate[today] - baseCount,
      days: Math.round((toMs(today) - toMs(base)) / DAY_MS),
      series: dates.map((d) => (byDate[d] !== undefined && d >= base ? byDate[d] : null)),
    });
  }
  const items = [...eligible].sort((a, b) => b.gain - a.gain || b.stars - a.stars).slice(0, limit);
  const itemsByStars = [...eligible].sort((a, b) => b.stars - a.stars || b.gain - a.gain).slice(0, limit);
  return { windowDays, dates, items, itemsByStars };
}

export function computeRankings(history, repos, today, limit = 20) {
  return {
    updatedAt: today,
    month: buildWindow(history, repos, today, 30, limit),
    week: buildWindow(history, repos, today, 7, limit),
  };
}
