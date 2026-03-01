# State — Sources of Truth

## 1. Wispr Flow SQLite Database (Primary)

- **Location**: `~/Library/Application Support/Wispr Flow/flow.sqlite`
- **Stores**: All dictation history — text, timestamps, app context, word counts, durations
- **Written by**: Wispr Flow desktop app (not this project)
- **Read by**: `scripts/alltime-recap.js` via `better-sqlite3` in read-only mode
- **Consistency**: Strong — single-writer (Wispr Flow app), read-only consumer
- **Schema**: `History` table with columns: `transcriptEntityId`, `formattedText`, `timestamp`, `app`, `url`, `numWords`, `duration`, `speechDuration`, `conversationId`, `isArchived`

## 2. Wispr Flow Session File

- **Location**: `~/Library/Application Support/Wispr Flow/session.json`
- **Stores**: Supabase authentication tokens (access_token, refresh_token)
- **Written by**: Wispr Flow desktop app
- **Read by**: `fetchApiStats()` in `scripts/alltime-recap.js:27-37`
- **Consistency**: Eventual — tokens expire, no refresh logic in this project
- **Key format**: JSON with a `sb-*` key containing serialized session object

## 3. Wispr Flow Cloud API

- **Location**: `https://api.wisprflow.ai/history/stats`
- **Stores**: Server-side aggregated stats (total_words, streaks, WPM, device breakdown)
- **Written by**: Wispr Flow backend
- **Read by**: `fetchApiStats()` in `scripts/alltime-recap.js:44-53`
- **Consistency**: Eventually consistent with local DB — server may have data from other devices

## 4. Generated HTML Output (Ephemeral)

- **Location**: `~/Desktop/wispr-dashboard-alltime-YYYY-MM-DD.html` (or custom `--out=` path)
- **Stores**: Rendered dashboard snapshot — all data baked into static HTML
- **Written by**: `scripts/alltime-recap.js:262-263`
- **Read by**: Browser (user opens file)
- **Consistency**: Point-in-time snapshot — stale as soon as new dictations occur

## Reconciliation Rules

1. **API wins for aggregate stats**: When API is available, `totalWords`, `totalDuration`, `totalSpeechDuration`, and `avgWPM` come from the server (more complete — includes mobile and other devices)
2. **SQLite wins for per-dictation data**: Dictation count, breakdowns by app/time/DOW always come from local DB (API doesn't expose row-level data)
3. **SQLite is the offline fallback**: All core functionality works without API — dashboard renders with local data only
4. **API-exclusive fields are null when offline**: `dayStreak`, `weekStreak`, `wordsThisWeek`, `desktopWords`, `mobileWords`, `totalAppsCount` — displayed only when API succeeds
