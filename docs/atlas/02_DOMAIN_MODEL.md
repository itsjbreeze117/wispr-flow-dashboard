# Domain Model

## Core Entities

### History Row (from SQLite)
- **Defined in**: `scripts/alltime-recap.js:74-91` (SQL query)
- **Source**: `~/Library/Application Support/Wispr Flow/flow.sqlite` → `History` table
- **Key fields**: `transcriptEntityId`, `formattedText`, `timestamp`, `app` (bundle ID), `url`, `numWords`, `duration`, `speechDuration`, `conversationId`, `isArchived`
- **Filter**: `isArchived = 0` and `formattedText IS NOT NULL AND formattedText != ''`

### API Stats (from server)
- **Defined in**: `scripts/alltime-recap.js:24-58` (`fetchApiStats()`)
- **Source**: `https://api.wisprflow.ai/history/stats`
- **Key fields**: `total_words`, `total_duration`, `total_non_empty_duration`, `words_per_minute`, `day_streak`, `week_streak`, `words_this_week`, `desktop_total_words`, `mobile_total_words`, `total_apps`
- **Lifecycle**: Fetched once at startup, null if unavailable

### Hybrid Stats (derived)
- **Defined in**: `scripts/alltime-recap.js:115-131`
- **Logic**: API values preferred, SQLite as fallback
- **Key fields**: `totalDictations` (always SQLite), `totalWords` (API or SQLite), `totalDuration`, `totalSpeechDuration`, `avgWPM` (API-only), `dayStreak`, `weekStreak`

## Vocabulary

| Term | Meaning | Where Used |
|------|---------|-----------|
| Dictation | A single voice-to-text event in Wispr Flow | Everywhere — the atomic unit |
| Bundle ID | macOS app identifier (e.g., `com.tinyspeck.slackmacgap`) | `app` field in History table |
| Friendly name | Human-readable app name resolved from bundle ID | `friendlyAppName()` at line 273 |
| Voice time | `speechDuration` — actual time speaking (excludes pauses) | Stats grid |
| Hybrid stats | Strategy of preferring API data with SQLite fallback | Lines 115-131 |
| Share card | 1200x630 image generated via html2canvas for social sharing | Bottom of HTML output |
| Heatmap | DOW × hour grid showing dictation density | `heatmap` object at line 175 |
| Sparkline | Daily activity visualization across full history | `dailyMap` at line 200 |

## Aggregation Structures

### Monthly Breakdown (`monthMap`)
- Key: `YYYY-MM`, Value: `{ count, words }`
- Sorted chronologically for bar chart

### Day-of-Week (`dowMap`)
- Array of 7 elements (Sun=0 through Sat=6), value = dictation count

### Hourly (`hourMap`)
- Key: hour (0-23), value = dictation count

### DOW × Hour Heatmap (`heatmap`)
- Key: `{dow}-{hour}`, value = dictation count
- Used for personality profile peak detection

### App Breakdown (`appMap`)
- Key: friendly app name, value: `{ count, words, duration, bundleId }`
- Sorted by count descending

### Daily Activity (`dailyMap`)
- Key: `YYYY-MM-DD`, value = dictation count
- Used for sparkline and streak calculations
