export function pendingTranslations(repos, translations) {
  const pending = [];
  for (const fullName of Object.keys(repos).sort()) {
    const text = repos[fullName].description;
    if (typeof text === 'string' && text.trim() && translations[fullName]?.source !== text) {
      pending.push({ fullName, text });
    }
  }
  return pending;
}

export function withTranslations(repos, translations) {
  return Object.fromEntries(Object.entries(repos).map(([name, repo]) => {
    const translation = translations[name];
    const entry = translation && translation.source === repo.description
      ? { ...repo, description: translation.zh }
      : repo;
    return [name, entry];
  }));
}

export function pruneTranslations(translations, repos) {
  return Object.fromEntries(Object.entries(translations).filter(([name]) => Object.hasOwn(repos, name)));
}

export function buildPrompt(texts) {
  const descriptions = Object.fromEntries(texts.map((text, i) => [String(i), text]));
  return [
    'Translate each numbered GitHub repository description into Traditional Chinese as used in Taiwan (台灣繁體中文).',
    'Keep product names, code identifiers, and proper nouns as-is.',
    'If a description is already in Traditional Chinese, return it unchanged. Convert Simplified Chinese to Traditional Chinese.',
    'Reply with ONLY a JSON object mapping each number, as a string key starting at "0", to its translation. Include no other text.',
    '',
    JSON.stringify(descriptions),
  ].join('\n');
}

export function parseReply(reply, count) {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  let parsed;
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(reply.slice(start, end + 1));
    } catch {
      return Array(count).fill(null);
    }
  }
  return Array.from({ length: count }, (_, i) => {
    const value = parsed?.[String(i)];
    return typeof value === 'string' ? value.trim() || null : null;
  });
}
