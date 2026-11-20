import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseReply, pendingTranslations, pruneTranslations, withTranslations } from '../src/translate.js';

test('queues new and changed non-empty descriptions', () => {
  const repos = {
    'a/a': { description: 'Hi' },
    'b/b': { description: '' },
    'c/c': { description: 'Old' },
    'd/d': { description: 'Same' },
  };
  const translations = {
    'c/c': { source: 'Older', zh: 'x' },
    'd/d': { source: 'Same', zh: '一樣' },
  };

  assert.deepEqual(pendingTranslations(repos, translations), [
    { fullName: 'a/a', text: 'Hi' },
    { fullName: 'c/c', text: 'Old' },
  ]);
});

test('applies only matching translations and preserves the input repos', () => {
  const repos = {
    'a/a': { description: 'Hi', stars: 1 },
    'c/c': { description: 'Old' },
  };
  const translations = {
    'a/a': { source: 'Hi', zh: '嗨' },
    'c/c': { source: 'Older', zh: 'x' },
  };

  const translated = withTranslations(repos, translations);

  assert.equal(translated['a/a'].description, '嗨');
  assert.equal(translated['a/a'].stars, 1);
  assert.equal(translated['c/c'].description, 'Old');
  assert.deepEqual(repos, {
    'a/a': { description: 'Hi', stars: 1 },
    'c/c': { description: 'Old' },
  });
});

test('prunes translations for removed repos', () => {
  const translations = {
    'a/a': { source: 's', zh: 'z' },
    'gone/x': { source: 's', zh: 'z' },
  };

  assert.deepEqual(pruneTranslations(translations, { 'a/a': {} }), {
    'a/a': { source: 's', zh: 'z' },
  });
});

test('parses fenced JSON and returns null for empty or missing translations', () => {
  assert.deepEqual(parseReply('```json\n{"0":"甲","1":""}\n```', 3), ['甲', null, null]);
});

test('returns all nulls for malformed JSON', () => {
  assert.deepEqual(parseReply('not json', 2), [null, null]);
});

test('requests Traditional Chinese translations for numbered texts', () => {
  const prompt = buildPrompt(['a', 'b']);

  assert.match(prompt, /繁體中文|Traditional Chinese/);
  assert.match(prompt, /"0"\s*:\s*"a"/);
  assert.match(prompt, /"1"\s*:\s*"b"/);
});
