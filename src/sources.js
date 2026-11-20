const HEADERS = { "User-Agent": "github-dashboard" };

export function parseTrending(html) {
  const names = [];
  const articles = html.split('<article class="Box-row">').slice(1);
  for (const article of articles) {
    const m = article.match(/<h2[^>]*>[\s\S]*?href="\/([\w.-]+\/[\w.-]+)"/);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export async function fetchTrending(since) {
  const res = await fetch(`https://github.com/trending?since=${since}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`trending ${since}: HTTP ${res.status}`);
  return parseTrending(await res.text());
}

export async function searchNewRepos(token, today) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  const since = d.toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=100`;
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`search: HTTP ${res.status}`);
  const body = await res.json();
  return body.items.map((i) => i.full_name);
}
