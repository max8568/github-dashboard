const BATCH_SIZE = 50;

export function buildRepoQuery(names) {
  const fields = names.map((full, i) => {
    const [owner, name] = full.split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { nameWithOwner stargazerCount description url primaryLanguage { name } }`;
  });
  return `query { ${fields.join(" ")} }`;
}

export function parseRepoResponse(names, json) {
  const out = {};
  names.forEach((full, i) => {
    const r = json.data?.[`r${i}`];
    if (!r) return;
    out[full] = {
      url: r.url,
      description: r.description || "",
      language: r.primaryLanguage?.name || "",
      stars: r.stargazerCount,
    };
  });
  return out;
}

export async function fetchRepoInfo(token, names) {
  const out = {};
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "github-dashboard",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: buildRepoQuery(batch) }),
    });
    if (!res.ok) throw new Error(`graphql: HTTP ${res.status}`);
    Object.assign(out, parseRepoResponse(batch, await res.json()));
  }
  return out;
}
