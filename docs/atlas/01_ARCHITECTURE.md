# Architecture

## Overview

wispr-flow-dashboard is a single Node.js CLI script that reads Wispr Flow's local SQLite database, optionally fetches server-side stats via the Wispr Flow API, and generates either a styled HTML dashboard or plain-text CLI output. All processing happens in one file (`scripts/alltime-recap.js`) with no build step, no framework, and no server.

## Components

### CLI Entry (`scripts/alltime-recap.js`)
- **Purpose**: The entire application — DB access, API fetch, data aggregation, HTML generation, CLI output
- **Location**: `scripts/alltime-recap.js` (single ~900-line file)
- **No external framework** — pure Node.js with one dependency (`better-sqlite3`)

### Atlas Tooling (`scripts/atlas/`)
- **Purpose**: Auto-generate repo documentation
- **Location**: `scripts/atlas/generate_atlas.py`
- **Independent** from the main application

## Data Flow

```
┌──────────────────┐     ┌──────────────────┐
│  Wispr Flow       │     │  Wispr Flow API   │
│  flow.sqlite      │     │  /history/stats   │
│  (local, readonly)│     │  (optional)       │
└────────┬─────────┘     └────────┬──────────┘
         │                        │
         ▼                        ▼
    ┌────────────────────────────────┐
    │   alltime-recap.js             │
    │                                │
    │  1. Open DB (readonly)         │
    │  2. Fetch API stats (parallel) │
    │  3. Query all History rows     │
    │  4. Derive hybrid stats        │
    │  5. Aggregate breakdowns       │
    │  6. Generate output            │
    └───────────┬────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   HTML file        CLI stdout
   (--html)         (default)
```

## Communication Patterns

- **SQLite**: Read-only connection to `~/Library/Application Support/Wispr Flow/flow.sqlite`
- **HTTP**: Optional fetch to `https://api.wisprflow.ai/history/stats` using Supabase auth token from `session.json`
- **File I/O**: Writes HTML output to disk (default: `~/Desktop/`)

## Key Design Decisions

- **Single-file architecture**: Everything in one .js file for simplicity — no build step, no module system (tradeoff: file is ~900 lines)
- **Hybrid data strategy**: API stats preferred when available, SQLite as fallback — ensures offline functionality
- **Inline CSS/HTML**: All styling embedded in the JS string template (tradeoff: no syntax highlighting, harder to maintain)
- **Read-only DB access**: Database opened with `{ readonly: true }` — zero risk of corrupting Wispr Flow data
- **founder.codes design language**: Instrument Serif + Inter + JetBrains Mono, coral accent, frosted glass cards
