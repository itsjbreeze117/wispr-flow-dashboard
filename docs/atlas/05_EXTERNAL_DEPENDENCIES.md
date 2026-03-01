# External Dependencies

## Package Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `better-sqlite3` | Synchronous SQLite3 driver for reading Wispr Flow's local database | `^11.0.0` |

That's it — one dependency. Everything else is Node.js built-ins (`path`, `os`, `fs`).

## External Services

### Wispr Flow API (`api.wisprflow.ai`)
- **Used for**: Server-side aggregated stats (total words, streaks, WPM, device breakdown)
- **Integration point**: `scripts/alltime-recap.js:24-58` (`fetchApiStats()`)
- **Auth**: Supabase access_token from `~/Library/Application Support/Wispr Flow/session.json`
- **If unavailable**: Graceful degradation — dashboard renders with local SQLite data only. API-exclusive stats (streaks, WPM, device split) are omitted. Console warns but does not error.

### Wispr Flow SQLite Database
- **Used for**: All dictation history (the primary data source)
- **Integration point**: `scripts/alltime-recap.js:61-65` (DB open) + `scripts/alltime-recap.js:74-91` (query)
- **If unavailable**: Hard failure — script exits with error message ("Wispr Flow database not found")

### html2canvas (CDN — browser-side only)
- **Used for**: Generating shareable 1200x630 PNG image from the dashboard HTML
- **Integration point**: Loaded via `<script>` tag in generated HTML
- **If unavailable**: Share button fails silently — core dashboard still renders

### Google Fonts (CDN — browser-side only)
- **Used for**: Loading Instrument Serif, Inter, and JetBrains Mono typefaces
- **Integration point**: `<link>` tags in generated HTML `<head>`
- **If unavailable**: Browser falls back to system fonts — layout shifts possible but functional

## System Dependencies

| Dependency | Required | Purpose |
|-----------|---------|---------|
| Node.js | Yes | Runtime |
| macOS | Yes | Wispr Flow only runs on macOS; DB path is macOS-specific |
| Wispr Flow app | Yes | Must be installed — creates the SQLite database |
| Python 3 | For atlas only | Runs `scripts/atlas/generate_atlas.py` |
