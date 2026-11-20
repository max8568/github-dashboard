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

async function fetchBatch(token, batch) {
  const ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "github-dashboard",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: buildRepoQuery(batch) }),
      });
      if (!res.ok) failure = `HTTP ${res.status}`;
      else {
        const json = await res.json();
        if (json.data) return json;
        failure = `no data (${JSON.stringify(json.errors ?? null).slice(0, 200)})`;
      }
    } catch (e) {
      failure = e.message;
    }
    if (attempt >= ATTEMPTS) throw new Error(`graphql: ${failure}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

export async function fetchRepoInfo(token, names) {
  const out = {};
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    Object.assign(out, parseRepoResponse(batch, await fetchBatch(token, batch)));
  }
  return out;
}
