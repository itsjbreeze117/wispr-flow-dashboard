# Critical Flows

## Flow 1: HTML Dashboard Generation (Primary)

**Trigger**: `node scripts/alltime-recap.js --html`

1. `scripts/alltime-recap.js:19-22` — Parse CLI args (`--html`, `--out=`)
2. `scripts/alltime-recap.js:61-65` — Open SQLite DB in read-only mode
3. `scripts/alltime-recap.js:71` — Kick off `fetchApiStats()` (async, parallel with DB query)
4. `scripts/alltime-recap.js:74-91` — Query all non-archived History rows, ordered by timestamp
5. `scripts/alltime-recap.js:99-100` — Await API stats, determine hybrid data source
6. `scripts/alltime-recap.js:106-131` — Derive hybrid stats (API preferred, SQLite fallback)
7. `scripts/alltime-recap.js:145-256` — Compute all aggregations (monthly, DOW, hourly, heatmap, apps, daily, streaks, personality)
8. `scripts/alltime-recap.js:260` — Call `generateHTML()`
9. `scripts/alltime-recap.js:438+` — Build full HTML string with inline CSS, data-driven sections
10. `scripts/alltime-recap.js:262-263` — Write HTML file to `outDir/wispr-dashboard-alltime-YYYY-MM-DD.html`
11. `scripts/alltime-recap.js:269` — Close DB

**End state**: HTML file on disk, ready to open in browser
**Gotchas**: See `06_GOTCHAS.md` — session.json format, DB schema dependency

## Flow 2: CLI Text Output

**Trigger**: `node scripts/alltime-recap.js` (no `--html` flag)

1. Same as Flow 1 steps 1-7 (args, DB, API, query, aggregation)
2. `scripts/alltime-recap.js:266` — Call `printCLI()`
3. `scripts/alltime-recap.js:391-434` — Print formatted markdown table to stdout

**End state**: Stats printed to terminal

## Flow 3: API Stats Fetch

**Trigger**: Called automatically during startup (parallel with DB query)

1. `scripts/alltime-recap.js:27` — Check if `session.json` exists
2. `scripts/alltime-recap.js:31-37` — Parse session.json, find `sb-*` key (Supabase auth)
3. `scripts/alltime-recap.js:38` — Extract `access_token`
4. `scripts/alltime-recap.js:44-48` — HTTP GET to `https://api.wisprflow.ai/history/stats` with auth header
5. `scripts/alltime-recap.js:51-53` — Parse JSON response, return stats object

**End state**: `apiStats` object or `null` (graceful degradation at every step)
**Gotchas**: Token may be expired — no refresh logic exists

## Flow 4: App Name Resolution

**Trigger**: Called per-row during app aggregation

1. `scripts/alltime-recap.js:273` — `friendlyAppName(bundleId)` called
2. `scripts/alltime-recap.js:276-303` — Check hardcoded map of ~30 bundle IDs
3. `scripts/alltime-recap.js:304-309` — If not found, extract last segment of bundle ID and capitalize

**End state**: Human-readable app name string
**Gotchas**: Unknown apps show generic names — map needs manual maintenance

## Flow 5: Share Card Generation

**Trigger**: User clicks "Share" button in the HTML dashboard (browser-side)

1. Browser loads html2canvas from CDN
2. Captures the `#share-card` element as a canvas
3. Converts to PNG data URL
4. Opens in new tab or triggers download

**End state**: 1200x630 PNG image for social sharing
**Gotchas**: Requires CDN access — fails offline
