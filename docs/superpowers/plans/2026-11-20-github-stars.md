# GitHub 星星數觀察站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public GitHub repo whose Actions record star counts of trending repos daily and whose GitHub Pages site shows 30-day and 7-day top-20 star-gain rankings with line charts.

**Architecture:** Pure Node ESM modules (no npm dependencies) for watchlist, history, ranking, and backfill math, each unit-tested with `node:test`. Two thin scripts (`scripts/daily.js`, `scripts/backfill.js`) do the network I/O and write JSON into `data/`. Two Actions workflows run the scripts and commit `data/`. A single static `index.html` reads `data/rankings.json` and draws with Chart.js.

**Tech Stack:** Node 24 (built-in `fetch`, `node:test`), GitHub REST + GraphQL API, GitHub Actions, GitHub Pages, Chart.js 4.4.1 from cdnjs.

**Spec:** `docs/superpowers/specs/2026-11-20-github-stars-design.md`

## Global Constraints

- Repo: public, `max8568/github-dashboard`, Pages served from `main` branch root.
- No npm dependencies. `package.json` has `"type": "module"` and `"test": "node --test"`.
- Dates are `YYYY-MM-DD` strings from `new Date().toISOString().slice(0, 10)` (UTC; the 00:30 UTC run is 08:30 Taiwan, same calendar day).
- Daily run: cron `30 0 * * *`. Backfill run: cron `15 * * * *`. Both also `workflow_dispatch`.
- Ranking windows: month = 30 days, week = 7 days, top 20 each, counted back from today.
- Watchlist removal: a repo not seen in any source for 30 days is removed along with its history.
- Backfill: skip repos with total stars > 40,000 (stargazers API stops at page 400). Stop a run when `x-ratelimit-remaining` < 100.
- Backfill order: trending monthly (priority 0), weekly (1), daily (2), search (3).
- Chart: Y = stars gained since the window's start day (start day = 0); default shows top 5 lines; clicking a table row toggles that repo's line.
- Before `git push`, run `gh auth status` and confirm `max8568` is active.

## Review Focus

1. A watched repo gets deleted, renamed, or made private: GraphQL returns `null` for that alias plus an error. The daily run must skip it and finish (test in Task 4).
2. GitHub changes the Trending HTML and the parser finds nothing: the run must continue with search results and log a warning, not wipe the watchlist (test in Task 3; handling in Task 4).
3. A day is missing in history (Actions skipped a day): the ranking base must use the latest entry on or before the window start, falling back to the earliest entry (test in Task 2).
4. Daily and backfill jobs both commit `data/` at the same time: both workflows share concurrency group `data-write` and `git pull --rebase` before push (Task 7).
5. A repo with only one day of data: gain 0, `days` 0, still renders without breaking the chart (test in Task 2).

---

### Task 1: Project scaffold and watchlist/history store

**Files:**
- Create: `package.json`, `.gitignore` (`node_modules/`), `data/watchlist.json` (`{}`), `data/history.json` (`{}`), `data/repos.json` (`{}`)
- Create: `src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces:
  - `type Watchlist = { [fullName: string]: { lastSeen: string, priority: 0|1|2|3, backfill: "pending"|"done"|"skipped" } }`
  - `type History = { [fullName: string]: { [date: string]: number } }`
  - `addCandidates(watchlist: Watchlist, names: string[], priority: number, today: string): Watchlist` — new names get `backfill: "pending"`; existing get `lastSeen = today` and `priority = min(old, new)`.
  - `pruneWatchlist(watchlist, history, today: string, maxIdleDays = 30): { watchlist, history }` — removes entries with `lastSeen` more than 30 days before today, and their history.
  - `recordCounts(history: History, counts: { [fullName]: number }, today: string): History`
  - `mergeBackfill(history, fullName, daily: { [date]: number }): History` — never overwrites an existing date.
  - `readJson(path) / writeJson(path, obj)` (writes with 2-space indent, trailing newline).

- [ ] **Step 1:** `git init`, write `package.json`, `.gitignore`, empty data files. Commit the spec and plan along with them.
- [ ] **Step 2: Write failing tests** in `test/store.test.js`:
  - `addCandidates({}, ["a/b"], 2, "2026-11-20")` → `{ "a/b": { lastSeen: "2026-11-20", priority: 2, backfill: "pending" } }`
  - existing `{ "a/b": { lastSeen: "2026-11-01", priority: 2, backfill: "done" } }` + `addCandidates(..., ["a/b"], 0, "2026-11-20")` → `lastSeen "2026-11-20"`, `priority 0`, `backfill "done"`.
  - `pruneWatchlist` with `lastSeen "2026-10-20"` and today `"2026-11-20"` (31 days) removes it and its history; `"2026-10-21"` (30 days) stays.
  - `mergeBackfill({ "a/b": { "2026-11-20": 100 } }, "a/b", { "2026-11-19": 90, "2026-11-20": 99 })` → `{ "2026-11-19": 90, "2026-11-20": 100 }`.
- [ ] **Step 3:** Run `npm test` → FAIL (module not found).
- [ ] **Step 4:** Implement `src/store.js`.
- [ ] **Step 5:** Run `npm test` → all PASS.
- [ ] **Step 6:** Commit `feat: watchlist and history store`.

### Task 2: Rankings

**Files:**
- Create: `src/rank.js`
- Test: `test/rank.test.js`

**Interfaces:**
- Consumes: `History` from Task 1; `repos.json` shape `{ [fullName]: { url, description, language, stars } }`.
- Produces: `computeRankings(history, repos, today: string, limit = 20): Rankings` where
  ```
  Rankings = { updatedAt: today,
    month: Window, week: Window }
  Window = { windowDays: 30|7, dates: string[],   // window start..today, every day
    items: [{ fullName, url, description, language, stars, gain, days, series: (number|null)[] }] }
  ```
  - base date = latest history date ≤ (today − windowDays); if none, earliest history date.
  - `gain = history[today] − history[base]`; `days` = day difference between base and today.
  - `series[i]` = `history[dates[i]] − history[base]` when present and `dates[i] ≥ base`, else `null`.
  - Repos without a `today` entry are left out. Sort by gain desc, then stars desc.

- [ ] **Step 1: Write failing tests:**
  - Repo with full 31 days, +10/day → month gain 300, days 30, `series[0] === 0`, `series[30] === 300`; week gain 70.
  - Gap: entries on 2026-10-19 and 2026-10-22 but not 2026-10-21 (month start for today 2026-11-20) → base is 2026-10-19, days 32.
  - Only entry is today → gain 0, days 0, series has `null`s then `0` at the end.
  - Repo missing today's entry → not in items.
  - 25 repos → `items.length === 20`, sorted by gain desc.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/rank.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: compute month and week rankings`.

### Task 3: Candidate sources

**Files:**
- Create: `src/sources.js`
- Create: `test/fixtures/trending.html` (save real page: `curl -s https://github.com/trending?since=weekly`)
- Test: `test/sources.test.js`

**Interfaces:**
- Produces:
  - `parseTrending(html: string): string[]` — `owner/name` list in page order, deduped, from each `<article class="Box-row">`'s `<h2>` link `href="/owner/name"`.
  - `fetchTrending(since: "daily"|"weekly"|"monthly"): Promise<string[]>`
  - `searchNewRepos(token: string, today: string): Promise<string[]>` — `GET /search/repositories?q=created:>{today−30d}&sort=stars&order=desc&per_page=100`.

- [ ] **Step 1: Write failing tests:**
  - `parseTrending(fixture)` returns between 10 and 25 items, every item matches `/^[\w.-]+\/[\w.-]+$/`.
  - `parseTrending("<html></html>")` → `[]`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/sources.js` (regex parsing; no DOM library).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: trending and search candidate sources`.

### Task 4: GraphQL snapshot and daily script

**Files:**
- Create: `src/github.js`, `scripts/daily.js`
- Test: `test/github.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `buildRepoQuery(names: string[]): string` — aliases `r0..rN`, each `repository(owner:, name:) { nameWithOwner stargazerCount description url primaryLanguage { name } }`.
  - `parseRepoResponse(names: string[], json): { [fullName]: { url, description, language, stars } }` — key is the requested name; `null` aliases are skipped.
  - `fetchRepoInfo(token, names): Promise<same>` — batches of 50, POST `https://api.github.com/graphql`.
  - `scripts/daily.js` (reads `GITHUB_TOKEN`): fetch trending monthly/weekly/daily + search → `addCandidates` with priorities 0/1/2/3 → `fetchRepoInfo` for all watched → `recordCounts` → update `repos.json` → `pruneWatchlist` → `computeRankings` → write all four files in `data/`. If a trending fetch returns 0 items, `console.warn` and continue.

- [ ] **Step 1: Write failing tests:**
  - `buildRepoQuery(["a/b"])` contains `r0: repository(owner: "a", name: "b")`.
  - `parseRepoResponse(["a/b","c/d"], { data: { r0: { stargazerCount: 5, url: "u", description: null, primaryLanguage: null }, r1: null }, errors: [{}] })` → `{ "a/b": { url: "u", description: "", language: "", stars: 5 } }`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/github.js` and `scripts/daily.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Live run:** `GITHUB_TOKEN=$(gh auth token) node scripts/daily.js` → `data/watchlist.json` has ~100–175 entries, `data/rankings.json` has 20 month items with `days: 0`.
- [ ] **Step 6:** Commit `feat: daily snapshot script` (include generated `data/`).

### Task 5: Backfill

**Files:**
- Create: `src/backfill.js`, `scripts/backfill.js`
- Test: `test/backfill.test.js`

**Interfaces:**
- Consumes: Task 1 store, Task 2 `computeRankings`.
- Produces:
  - `reconstructDaily(total: number, starredAt: string[], today: string, days = 30): { [date]: number }` — for each date d in today−days..today: `total − count(starredAt whose date part > d)`.
  - `nextToBackfill(watchlist): string[]` — `pending` names sorted by priority asc.
  - `scripts/backfill.js`: for each name in order: total > 40,000 → mark `skipped`; else fetch stargazers with `Accept: application/vnd.github.star+json`, `per_page=100`, from page `ceil(total/100)` down until a page's oldest `starred_at` is before today−30 → `reconstructDaily` → `mergeBackfill` → mark `done`. Stop the whole run when `x-ratelimit-remaining` < 100 (current repo stays `pending`). At the end recompute rankings and write `data/`.

- [ ] **Step 1: Write failing tests:**
  - `reconstructDaily(100, ["2026-11-20T01:00:00Z","2026-11-19T05:00:00Z","2026-11-19T06:00:00Z"], "2026-11-20", 2)` → `{ "2026-11-18": 97, "2026-11-19": 99, "2026-11-20": 100 }`.
  - `nextToBackfill({ a: {priority:3,backfill:"pending"}, b: {priority:0,backfill:"pending"}, c: {priority:0,backfill:"done"} })` → `["b","a"]`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Live run:** `GITHUB_TOKEN=$(gh auth token) node scripts/backfill.js` → at least some repos `done`, and those show `days: 30` in `data/rankings.json`.
- [ ] **Step 6:** Commit `feat: backfill past 30 days from stargazer timestamps`.

### Task 6: Web page

**Files:**
- Create: `index.html` (inline CSS/JS; Chart.js `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`)

**Interfaces:**
- Consumes: `data/rankings.json` (Task 2 shape).

- [ ] **Step 1:** Implement: header with `updatedAt`; tabs 月排行 / 週排行; line chart using `dates` as labels and each item's `series` (`spanGaps: true`), top 5 visible by default; table columns 名次、專案（連到 url）、說明、語言、增加數、目前總數、資料天數 (show 「只有 N 天資料」 when `days < windowDays`). Clicking a row toggles that line. Works at phone width.
- [ ] **Step 2: Verify:** `python -m http.server 8000` in repo root, open `http://localhost:8000` → both tabs render 20 rows, chart shows 5 lines, clicking row 6 adds a line, no console errors.
- [ ] **Step 3:** Commit `feat: rankings page`.

### Task 7: Workflows, repo, Pages

**Files:**
- Create: `.github/workflows/daily.yml`, `.github/workflows/backfill.yml`

- [ ] **Step 1:** Write both workflows: `permissions: contents: write`; `concurrency: { group: data-write, cancel-in-progress: false }`; steps: checkout, `actions/setup-node@v4` with `node-version: 24`, `node scripts/<name>.js` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, then commit `data/` only if changed (`git diff --quiet data || (git add data && git commit -m "data: <name> $(date -u +%F)" && git pull --rebase && git push)`) as `github-actions[bot]`.
- [ ] **Step 2:** Commit `ci: daily and hourly backfill workflows`.
- [ ] **Step 3:** `gh auth status` → confirm `max8568` active. `gh repo create max8568/github-dashboard --public --source . --push`.
- [ ] **Step 4:** Enable Pages: `gh api -X POST repos/max8568/github-dashboard/pages -f "source[branch]=main" -f "source[path]=/"`.
- [ ] **Step 5: Verify:** `gh workflow run daily.yml`, then `gh run watch` → success and a new `data:` commit; open `https://max8568.github.io/github-dashboard/` → page shows today's date.
