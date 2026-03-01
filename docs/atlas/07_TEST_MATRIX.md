# Test Matrix

## Current State

**There are no automated tests.** This is a single-script personal tool. Verification is manual.

## Manual Verification

### Running the dashboard

```bash
# HTML output (primary)
node scripts/alltime-recap.js --html

# CLI output
node scripts/alltime-recap.js

# Custom output directory
node scripts/alltime-recap.js --html --out=./output
```

### What to check after changes

1. **Script runs without errors**: Exit code 0, no uncaught exceptions
2. **HTML renders correctly**: Open the generated file in Chrome/Safari
3. **Stats grid shows numbers**: Not NaN, not undefined, not 0 when data exists
4. **Month bars render**: All months present, proportional heights
5. **App breakdown loads**: Apps show friendly names, not bundle IDs
6. **Share card works**: Click "Share" button, verify image generates
7. **CLI output is formatted**: Markdown table renders correctly
8. **Offline mode works**: Delete/rename session.json, verify dashboard still generates with "[api] Session file not found" warning

### Edge cases to test

| Scenario | How to Test | Expected |
|----------|------------|----------|
| No Wispr Flow installed | Rename `flow.sqlite` | Error: "Wispr Flow database not found" + exit 1 |
| Empty database | Use a fresh SQLite file with empty History table | "No Wispr Flow dictations found." + exit 0 |
| Expired auth token | Wait for token expiry or corrupt session.json | Warning in console, dashboard renders with local data |
| No internet | Disconnect network | API stats null, local-only dashboard |
| Very large dataset | Normal use (1000+ rows) | Script completes in <2 seconds |

## Atlas Verification

```bash
# Check if auto-generated atlas files are current
make atlas-check

# Regenerate
make atlas-generate
```

## Adding Tests (Future)

If tests are added, recommended approach:
1. Use Node.js built-in test runner (`node --test`)
2. Create a test fixture SQLite DB with known data
3. Test aggregation functions (monthly, DOW, hourly, streaks)
4. Test `friendlyAppName()` bundle ID resolution
5. Test `fetchApiStats()` with mock responses
6. Snapshot test the generated HTML structure
