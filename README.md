# Wispr Flow Dashboard

A personal analytics dashboard that visualizes your [Wispr Flow](https://wispr.flow) voice dictation data. Reads directly from the local SQLite database — no API keys, no login, no data leaves your machine.

## What You Get

- **Stats grid** — total dictations, words, voice time, averages
- **Month-by-month** bar chart showing usage over time
- **Day-of-week** and **hour-by-hour** heatmaps
- **App breakdown** — where your dictations go (Slack, Claude, Perplexity, etc.)
- **Daily activity** sparkline across your full history
- **Consistency metrics** — active days, longest gap, average gap
- **Voice Personality Profile** — data-driven insights about your dictation patterns
- **Share card** — generates a 1200x630 image for sharing on X

## Setup

```bash
git clone https://github.com/itsjbreeze117/wispr-flow-dashboard.git
cd wispr-flow-dashboard/scripts
npm install
```

Requires Node.js and macOS with Wispr Flow installed.

## Usage

Generate the all-time dashboard:

```bash
node scripts/alltime-recap.js --html
```

Output saves to `~/Desktop/wispr-dashboard-alltime-YYYY-MM-DD.html` by default.

### Options

| Flag | Description |
|------|-------------|
| `--html` | Generate HTML dashboard (omit for CLI output) |
| `--out=/path/to/dir` | Custom output directory |

### Examples

```bash
# HTML to desktop
node scripts/alltime-recap.js --html

# HTML to current directory
node scripts/alltime-recap.js --html --out=.

# CLI text output
node scripts/alltime-recap.js
```

## How It Works

The script reads Wispr Flow's local SQLite database at:

```
~/Library/Application Support/Wispr Flow/flow.sqlite
```

All data stays local. The database is opened in **read-only mode** — nothing is written or modified.

## Design

Built with the [founder.codes](https://founder.codes) design language:

- **Instrument Serif** (italic headings), **Inter** (body), **JetBrains Mono** (labels)
- Coral accent (`#f34e3f`) on warm beige (`#f5f4ed`)
- Frosted glass cards with backdrop blur
- Single-column, 760px max-width layout
- Mobile responsive

## License

MIT
