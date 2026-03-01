# Gotchas

## Database Schema

### SQLite schema is owned by Wispr Flow, not this project
- **File**: `scripts/alltime-recap.js:74-91`
- **Risk**: Wispr Flow app updates may change the `History` table schema (rename columns, add required fields, change types)
- **Rule**: Pin to known-working Wispr Flow versions. After app updates, verify DB schema before running.
- **Why**: We query the DB directly — there's no versioned API contract for the local database.

### DB path is hardcoded to macOS
- **File**: `scripts/alltime-recap.js:9-12`
- **Risk**: Fails on any non-macOS system or if Wispr Flow changes its data directory
- **Rule**: If porting to another OS, the `DB_PATH` constant must be updated
- **Why**: `~/Library/Application Support/` is a macOS convention

## Authentication

### Session tokens expire with no refresh
- **File**: `scripts/alltime-recap.js:31-38`
- **Risk**: API calls fail silently when the Supabase token expires. User sees "local data only" without understanding why.
- **Rule**: If API stats stop appearing, open Wispr Flow app (which refreshes the session), then re-run the script.
- **Why**: We read the token from disk but don't implement the Supabase refresh_token flow.

### Session.json key format depends on Supabase config
- **File**: `scripts/alltime-recap.js:32-33`
- **Risk**: The `sb-*` key prefix is a Supabase convention. If Wispr Flow changes auth providers, this breaks.
- **Rule**: The key lookup at line 32 (`Object.keys(sessionData).find(k => k.startsWith("sb-"))`) is the fragile point.

## App Name Resolution

### Bundle ID map requires manual maintenance
- **File**: `scripts/alltime-recap.js:273-309`
- **Risk**: New apps show as generic names (last segment of bundle ID, capitalized). Users see "Slackmacgap" instead of "Slack" for unmapped IDs.
- **Rule**: When users report unknown apps, add the bundle ID → display name mapping to the `map` object.
- **Why**: There's no macOS API call to resolve bundle IDs to display names in Node.js without native modules.

## HTML Generation

### All CSS is inline in a JS template literal
- **File**: `scripts/alltime-recap.js:438+`
- **Risk**: ~500 lines of CSS embedded in a JavaScript string. No syntax highlighting, no linting, easy to introduce unclosed tags or broken selectors.
- **Rule**: When editing CSS, use a separate file for drafting, then paste back. Test in browser after every change.

### html2canvas loads from CDN at runtime
- **File**: Generated HTML `<script>` tag
- **Risk**: Share card feature breaks if user is offline or CDN is down
- **Rule**: For offline support, bundle html2canvas locally

### Date parsing assumes UTC-ish timestamps
- **File**: `scripts/alltime-recap.js:138-139`, `scripts/alltime-recap.js:366-372`
- **Risk**: `new Date(dateStr + "T12:00:00")` trick avoids timezone-shift issues but assumes timestamps don't already include timezone info
- **Rule**: Don't change the `T12:00:00` suffix without understanding why it's there (prevents off-by-one day errors near midnight)

## Output

### Output overwrites without warning
- **File**: `scripts/alltime-recap.js:263`
- **Risk**: Running twice on the same day overwrites the previous HTML file (same filename pattern)
- **Rule**: If you need to preserve outputs, use `--out=` with different directories
