import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRankings } from '../src/rank.js';

const TODAY = '2026-11-20';
const day = (offset) => {
  const d = new Date(Date.parse(TODAY + 'T00:00:00Z') + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
const repos = { 'a/a': { url: 'https://github.com/a/a', description: 'd', language: 'JS', stars: 1000 } };

test('full 31 days at +10/day', () => {
  const h = { 'a/a': {} };
  for (let i = -30; i <= 0; i++) h['a/a'][day(i)] = 1000 + (i + 30) * 10;
  const r = computeRankings(h, repos, TODAY);
  assert.equal(r.updatedAt, TODAY);
  const m = r.month;
  assert.equal(m.windowDays, 30);
  assert.equal(m.dates.length, 31);
  assert.equal(m.dates[0], day(-30));
  assert.equal(m.dates[30], TODAY);
  assert.equal(m.items[0].gain, 300);
  assert.equal(m.items[0].days, 30);
  assert.equal(m.items[0].series[0], 1000);
  assert.equal(m.items[0].series[30], 1300);
  assert.equal(m.items[0].url, 'https://github.com/a/a');
  assert.equal(r.week.items[0].gain, 70);
  assert.equal(r.week.items[0].days, 7);
});

test('gap: base is latest date on or before window start', () => {
  const h = { 'a/a': { '2026-10-19': 100, '2026-10-22': 130, [TODAY]: 200 } };
  const m = computeRankings(h, repos, TODAY).month;
  assert.equal(m.dates[0], '2026-10-21');
  assert.equal(m.items[0].days, 32);
  assert.equal(m.items[0].gain, 100);
  assert.equal(m.items[0].series[0], null);
  assert.equal(m.items[0].series[1], 130);
});

test('only today entry', () => {
  const h = { 'a/a': { [TODAY]: 500 } };
  const it = computeRankings(h, repos, TODAY).month.items[0];
  assert.equal(it.gain, 0);
  assert.equal(it.days, 0);
  assert.equal(it.series[30], 500);
  assert.ok(it.series.slice(0, 30).every((v) => v === null));
});

test('leading zero days (repo not created yet) become null in series', () => {
  const h = { 'a/a': {} };
  for (let i = -30; i <= 0; i++) h['a/a'][day(i)] = i < -20 ? 0 : (i + 21) * 10;
  const it = computeRankings(h, repos, TODAY).month.items[0];
  assert.ok(it.series.slice(0, 10).every((v) => v === null));
  assert.equal(it.series[10], 10);
  assert.equal(it.series[30], 210);
  assert.equal(it.gain, 210);
});

test('repo without today entry is left out', () => {
  const h = { 'a/a': { [day(-1)]: 5 } };
  const r = computeRankings(h, repos, TODAY);
  assert.equal(r.month.items.length, 0);
  assert.equal(r.week.items.length, 0);
});

test('missing repos entry falls back to defaults', () => {
  const h = { 'x/y': { [day(-30)]: 1, [TODAY]: 9 } };
  const it = computeRankings(h, {}, TODAY).month.items[0];
  assert.equal(it.url, 'https://github.com/x/y');
  assert.equal(it.description, '');
  assert.equal(it.language, '');
  assert.equal(it.stars, 9);
});

test('limit 20 sorted by gain desc, ties by stars', () => {
  const h = {};
  for (let i = 0; i < 25; i++) h[`o/r${i}`] = { [day(-30)]: 0, [TODAY]: i };
  const items = computeRankings(h, {}, TODAY).month.items;
  assert.equal(items.length, 20);
  assert.equal(items[0].gain, 24);
  for (let i = 1; i < 20; i++) assert.ok(items[i - 1].gain >= items[i].gain);
  const t = { 'a/a': { [day(-30)]: 0, [TODAY]: 5 }, 'b/b': { [day(-30)]: 10, [TODAY]: 15 } };
  assert.equal(computeRankings(t, {}, TODAY).month.items[0].fullName, 'b/b');
});

test('limit 20 by stars across all eligible repos, ties by gain', () => {
  const h = { 'big/old': { [day(-30)]: 1000, [TODAY]: 1000 } };
  for (let i = 1; i < 25; i++) {
    const stars = i === 23 ? 124 : 100 + i;
    h[`o/r${i}`] = { [day(-30)]: stars - i, [TODAY]: stars };
  }

  const { month, week } = computeRankings(h, {}, TODAY);
  for (const { items, itemsByStars } of [month, week]) {
    assert.equal(itemsByStars.length, 20);
    assert.equal(itemsByStars[0].fullName, 'big/old');
    for (let i = 1; i < itemsByStars.length; i++) {
      assert.ok(itemsByStars[i - 1].stars >= itemsByStars[i].stars);
    }
    assert.ok(!items.some((item) => item.fullName === 'big/old'));
    assert.deepEqual(itemsByStars.slice(1, 3).map((item) => item.fullName), ['o/r24', 'o/r23']);
  }
});
