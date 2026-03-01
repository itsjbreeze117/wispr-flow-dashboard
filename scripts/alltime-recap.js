#!/usr/bin/env node

const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");
const fs = require("fs");

// --- Config ---
const DB_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Wispr Flow/flow.sqlite"
);
const SESSION_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Wispr Flow/session.json"
);
const API_BASE = "https://api.wisprflow.ai";

const args = process.argv.slice(2);
const flagHTML = args.includes("--html");
const outFlag = args.find((a) => a.startsWith("--out="));
const outDir = outFlag ? outFlag.split("=")[1] : os.homedir() + "/Desktop";

// --- Fetch API stats (returns null on failure) ---
async function fetchApiStats() {
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      console.warn("[api] Session file not found — using local data only");
      return null;
    }
    const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
    const sbKey = Object.keys(sessionData).find((k) => k.startsWith("sb-"));
    if (!sbKey) {
      console.warn("[api] No sb- auth key found — using local data only");
      return null;
    }
    const session = JSON.parse(sessionData[sbKey]);
    const token = session.access_token;
    if (!token) {
      console.warn("[api] No access_token in session — using local data only");
      return null;
    }

    const res = await fetch(`${API_BASE}/history/stats`, {
      headers: { Authorization: token },
    });
    if (!res.ok) {
      console.warn(`[api] Stats request failed (${res.status}) — using local data only`);
      return null;
    }
    const stats = await res.json();
    console.log("[api] Server stats loaded successfully");
    return stats;
  } catch (err) {
    console.warn(`[api] ${err.message} — using local data only`);
    return null;
  }
}

// --- Open DB (read-only) ---
if (!fs.existsSync(DB_PATH)) {
  console.error("Wispr Flow database not found at:", DB_PATH);
  process.exit(1);
}
const db = new Database(DB_PATH, { readonly: true });

// --- Main (async for API fetch) ---
(async () => {

// Fetch API stats in parallel with DB query
const apiStatsPromise = fetchApiStats();

// --- Query all rows ---
const rows = db
  .prepare(
    `SELECT
      transcriptEntityId,
      formattedText,
      timestamp,
      app,
      url,
      numWords,
      duration,
      speechDuration,
      conversationId
    FROM History
    WHERE isArchived = 0
      AND (formattedText IS NOT NULL AND formattedText != '')
    ORDER BY timestamp ASC`
  )
  .all();

if (rows.length === 0) {
  console.log("No Wispr Flow dictations found.");
  process.exit(0);
}

// Wait for API stats
const apiStats = await apiStatsPromise;
const hasApi = apiStats !== null;

// --- Derive date range ---
const firstDate = rows[0].timestamp.slice(0, 10);
const lastDate = rows[rows.length - 1].timestamp.slice(0, 10);

// --- SQLite aggregate stats ---
const sqliteDictations = rows.length;
const sqliteWords = rows.reduce((sum, r) => sum + (r.numWords || 0), 0);
const sqliteDuration = rows.reduce((sum, r) => sum + (r.duration || 0), 0);
const sqliteSpeechDuration = rows.reduce(
  (sum, r) => sum + (r.speechDuration || 0),
  0
);

// --- Hybrid stats: prefer API, fall back to SQLite ---
const totalDictations = sqliteDictations; // API doesn't provide dictation count
const totalWords = hasApi ? apiStats.total_words : sqliteWords;
const totalDuration = hasApi ? apiStats.total_duration : sqliteDuration;
const totalSpeechDuration = hasApi
  ? apiStats.total_non_empty_duration
  : sqliteSpeechDuration;
const avgWPM = hasApi ? apiStats.words_per_minute : null;
const avgWords = sqliteWords / sqliteDictations; // always from SQLite (per-dictation avg)

// API-only stats (null when offline)
const dayStreak = hasApi ? apiStats.day_streak : null;
const weekStreak = hasApi ? apiStats.week_streak : null;
const wordsThisWeek = hasApi ? apiStats.words_this_week : null;
const desktopWords = hasApi ? apiStats.desktop_total_words : null;
const mobileWords = hasApi ? apiStats.mobile_total_words : null;
const totalAppsCount = hasApi ? apiStats.total_apps.length : null;

// Active days
const activeDays = new Set(rows.map((r) => r.timestamp.slice(0, 10)));
const activeDayCount = activeDays.size;

// Month range
const firstMonth = new Date(firstDate + "T12:00:00");
const lastMonth = new Date(lastDate + "T12:00:00");
const monthsTracked =
  (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12 +
  (lastMonth.getMonth() - firstMonth.getMonth()) +
  1;

// --- Monthly breakdown ---
const monthMap = {};
for (const r of rows) {
  const key = r.timestamp.slice(0, 7); // YYYY-MM
  if (!monthMap[key]) monthMap[key] = { count: 0, words: 0 };
  monthMap[key].count++;
  monthMap[key].words += r.numWords || 0;
}
const monthsSorted = Object.entries(monthMap).sort((a, b) =>
  a[0].localeCompare(b[0])
);
const maxMonthCount = Math.max(...monthsSorted.map(([, d]) => d.count));

// --- Day of week breakdown ---
const dowMap = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
for (const r of rows) {
  const d = new Date(r.timestamp);
  dowMap[d.getDay()]++;
}
const maxDow = Math.max(...dowMap);

// --- Hourly breakdown (aggregate all days) ---
const hourMap = {};
for (const r of rows) {
  const hour = new Date(r.timestamp).getHours();
  hourMap[hour] = (hourMap[hour] || 0) + 1;
}
const maxHour = Math.max(...Object.values(hourMap));

// --- Hourly by day-of-week (for heatmap) ---
const heatmap = {};
let maxHeat = 0;
for (const r of rows) {
  const d = new Date(r.timestamp);
  const dow = d.getDay();
  const hour = d.getHours();
  const key = `${dow}-${hour}`;
  heatmap[key] = (heatmap[key] || 0) + 1;
  if (heatmap[key] > maxHeat) maxHeat = heatmap[key];
}

// --- App breakdown ---
const appMap = {};
for (const r of rows) {
  const bundleId = r.app || "";
  const name = friendlyAppName(bundleId);
  if (!appMap[name])
    appMap[name] = { count: 0, words: 0, duration: 0, bundleId };
  appMap[name].count++;
  appMap[name].words += r.numWords || 0;
  appMap[name].duration += r.duration || 0;
}
const appsSorted = Object.entries(appMap).sort((a, b) => b[1].count - a[1].count);

// --- Daily activity data ---
const dailyMap = {};
for (const r of rows) {
  const day = r.timestamp.slice(0, 10);
  dailyMap[day] = (dailyMap[day] || 0) + 1;
}
const dailySorted = Object.entries(dailyMap).sort((a, b) =>
  a[0].localeCompare(b[0])
);
const maxDaily = Math.max(...dailySorted.map(([, c]) => c));

// --- Streaks / gaps ---
const sortedDays = [...activeDays].sort();
let longestGap = 0;
let totalGap = 0;
for (let i = 1; i < sortedDays.length; i++) {
  const prev = new Date(sortedDays[i - 1] + "T12:00:00");
  const curr = new Date(sortedDays[i] + "T12:00:00");
  const gap = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
  if (gap > longestGap) longestGap = gap;
  totalGap += gap;
}
const avgGap =
  sortedDays.length > 1
    ? (totalGap / (sortedDays.length - 1)).toFixed(1)
    : "0";

// --- Personality profile data ---
// AI-first: count dictations to AI tools
const aiApps = [
  "ai.perplexity.comet",
  "com.anthropic.claudefordesktop",
  "com.openai.chat",
];
const aiCount = rows.filter((r) => aiApps.includes(r.app)).length;
const aiPct = Math.round((aiCount / totalDictations) * 100);

// Peak day
const peakDay = dailySorted.reduce(
  (best, [date, count]) => (count > best[1] ? [date, count] : best),
  ["", 0]
);
const peakDayDate = new Date(peakDay[0] + "T12:00:00");

// Peak hour per dow
const peakHourByDow = {};
for (const [key, cnt] of Object.entries(heatmap)) {
  const [dow, hour] = key.split("-").map(Number);
  if (
    !peakHourByDow[dow] ||
    cnt > peakHourByDow[dow].count
  ) {
    peakHourByDow[dow] = { hour, count: cnt };
  }
}

// Max dictation length
const maxDictationWords = Math.max(...rows.map((r) => r.numWords || 0));

// --- Output ---
if (flagHTML) {
  const html = generateHTML();
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `wispr-dashboard-alltime-${today}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`All-time dashboard saved to: ${outPath}`);
} else {
  printCLI();
}

db.close();

// ===================== HELPERS =====================

function friendlyAppName(bundleId) {
  if (!bundleId) return "Unknown";
  const map = {
    "ai.perplexity.comet": "Perplexity",
    "com.anthropic.claudefordesktop": "Claude Desktop",
    "company.thebrowser.dia": "Dia Browser",
    "com.tinyspeck.slackmacgap": "Slack",
    "com.electron.wispr-flow": "Wispr Flow",
    "com.openai.chat": "ChatGPT",
    "com.apple.Terminal": "Terminal",
    "notion.mail.id": "Notion Mail",
    "notion.id": "Notion",
    "com.granola.app": "Granola",
    "com.apple.MobileSMS": "Messages",
    "com.1password.1password": "1Password",
    "com.google.Chrome": "Chrome",
    "com.apple.Safari": "Safari",
    "com.microsoft.VSCode": "VS Code",
    "com.todesktop.230313mzl4w4u92": "Cursor",
    "com.linear": "Linear",
    "com.apple.mail": "Mail",
    "md.obsidian": "Obsidian",
    "com.figma.Desktop": "Figma",
    "com.hnc.Discord": "Discord",
    "dev.warp.Warp-Stable": "Warp",
    "company.thebrowser.Browser": "Arc",
    "com.superhuman.electron": "Superhuman",
    "net.shinyfrog.bear": "Bear",
    "us.zoom.xos": "Zoom",
    "com.codeium.windsurf": "Windsurf",
  };
  if (map[bundleId]) return map[bundleId];
  const parts = bundleId.split(".");
  return (
    parts[parts.length - 1].charAt(0).toUpperCase() +
    parts[parts.length - 1].slice(1)
  );
}

function appIconLetter(name) {
  return name.charAt(0);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatHour(h) {
  return h === 0
    ? "12a"
    : h < 12
    ? `${h}a`
    : h === 12
    ? "12p"
    : `${h - 12}p`;
}

function formatHourLong(h) {
  return h === 0
    ? "12 AM"
    : h < 12
    ? `${h} AM`
    : h === 12
    ? "12 PM"
    : `${h - 12} PM`;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange() {
  const start = new Date(firstDate + "T12:00:00");
  const end = new Date(lastDate + "T12:00:00");
  const startStr = start.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

// ===================== CLI =====================

function printCLI() {
  const src = hasApi ? "(API + local)" : "(local only)";
  console.log(`\n# Wispr Flow All-Time Recap — ${formatDateRange()} ${src}\n`);
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Dictations (local) | ${totalDictations} |`);
  console.log(`| Total words | ${totalWords.toLocaleString()} |`);
  if (hasApi && desktopWords !== null) {
    console.log(`| └ Desktop | ${desktopWords.toLocaleString()} |`);
    console.log(`| └ Mobile | ${mobileWords.toLocaleString()} |`);
  }
  console.log(
    `| Voice time | ${formatDuration(totalSpeechDuration || totalDuration)} |`
  );
  if (avgWPM) console.log(`| Avg WPM | ${avgWPM.toFixed(1)} |`);
  console.log(`| Avg words/dictation | ${avgWords.toFixed(1)} |`);
  console.log(`| Active days | ${activeDayCount} |`);
  console.log(`| Months tracked | ${monthsTracked} |`);
  if (dayStreak !== null) console.log(`| Day streak | ${dayStreak} |`);
  if (weekStreak !== null) console.log(`| Week streak | ${weekStreak} |`);
  if (wordsThisWeek !== null) console.log(`| Words this week | ${wordsThisWeek.toLocaleString()} |`);
  if (totalAppsCount !== null) console.log(`| Total apps (all-time) | ${totalAppsCount} |`);
  console.log();

  console.log("## Month by Month\n");
  for (const [ym, data] of monthsSorted) {
    const bar =
      "\u2588".repeat(Math.round((data.count / maxMonthCount) * 20)) +
      "\u2591".repeat(20 - Math.round((data.count / maxMonthCount) * 20));
    console.log(
      `${bar} **${formatMonthLabel(ym)}** — ${data.count} dictations · ${data.words.toLocaleString()} words`
    );
  }
  console.log();

  console.log("## Apps (local data)\n");
  for (const [name, stats] of appsSorted) {
    const pct = Math.round((stats.count / totalDictations) * 100);
    console.log(
      `- **${name}** — ${stats.count} dictations (${pct}%) · ${stats.words.toLocaleString()} words`
    );
  }
  console.log();
}

// ===================== HTML =====================

function generateHTML() {
  const dateRange = formatDateRange();
  const voiceTime = formatDuration(totalSpeechDuration || totalDuration);
  const wpmDisplay = avgWPM ? avgWPM.toFixed(0) : Math.round(sqliteWords / ((sqliteSpeechDuration || sqliteDuration) / 60));
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dataSource = hasApi ? "Server API + local cache" : "Local cache only";

  // Day of week names
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Month bars
  const monthBars = monthsSorted
    .map(([ym, data]) => {
      const pct = Math.round((data.count / maxMonthCount) * 100);
      return `
    <div class="month-col">
      <div class="month-value">${data.count}</div>
      <div class="month-bar-wrap"><div class="month-bar" style="height: ${Math.max(pct, 2)}%"></div></div>
      <div class="month-label">${formatMonthLabel(ym)}</div>
      <div class="month-sublabel">${data.words.toLocaleString()}w</div>
    </div>`;
    })
    .join("\n");

  // Day of week cells
  const dowCells = dowMap
    .map((cnt, i) => {
      const intensity = cnt === 0 ? 0.06 : 0.12 + (cnt / maxDow) * 0.88;
      const isDark = intensity > 0.5;
      return `
    <div class="dow-cell" style="background: rgba(243, 78, 63, ${intensity.toFixed(2)})">
      <div class="dow-num" style="color: ${isDark ? "#f5f4ed" : "var(--text)"}">${cnt}</div>
      <div class="dow-label" style="color: ${isDark ? "rgba(245,244,237,0.7)" : "var(--text-muted)"}">${dowNames[i]}</div>
    </div>`;
    })
    .join("\n");

  // Hourly heatmap cells
  const hourCells = [];
  for (let h = 0; h < 24; h++) {
    const cnt = hourMap[h] || 0;
    const intensity = cnt === 0 ? 0.06 : 0.12 + (cnt / maxHour) * 0.88;
    const isDark = intensity > 0.5;
    hourCells.push(`
    <div class="hour-cell" style="background: rgba(243, 78, 63, ${intensity.toFixed(2)})" title="${formatHourLong(h)}: ${cnt} dictations">
      <div class="hour-num" style="color: ${isDark ? "#f5f4ed" : "var(--text)"}">${cnt}</div>
      <div class="hour-label" style="color: ${isDark ? "rgba(245,244,237,0.7)" : "var(--text-muted)"}">${h % 3 === 0 ? formatHour(h) : ""}</div>
    </div>`);
  }

  // App cards
  const appCards = appsSorted
    .map(([name, stats]) => {
      const pct = Math.round((stats.count / totalDictations) * 100);
      const letter = appIconLetter(name);
      return `
  <div class="app-card">
    <div class="app-header">
      <div class="app-icon-fallback">${letter}</div>
      <div class="app-header-text">
        <div class="app-name">${escapeHTML(name)}</div>
        <div class="app-stats">${stats.count} dictations &middot; ${stats.words.toLocaleString()} words &middot; ${pct}%</div>
      </div>
    </div>
    <div class="app-bar-wrap"><div class="app-bar" style="width: ${pct}%"></div></div>
  </div>`;
    })
    .join("\n");

  // Daily activity bars (JS-generated)
  const dailyJSON = JSON.stringify(dailySorted);

  // Peak day formatted
  const peakDayLabel = peakDayDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Top 3 apps for share card
  const top3 = appsSorted.slice(0, 3);
  const shareApps = top3
    .map(([name, stats]) => {
      const pct = Math.round((stats.count / totalDictations) * 100);
      return `
      <div class="sc-app">
        <div class="sc-app-name">${escapeHTML(name)}</div>
        <div class="sc-app-bar-wrap"><div class="sc-app-bar" style="width: ${pct}%"></div></div>
        <div class="sc-app-pct">${pct}%</div>
      </div>`;
    })
    .join("\n");

  // Personality insights
  const topDow = dowMap.indexOf(Math.max(...dowMap));
  const topDowName = dowNames[topDow];
  const topHourEntry = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
  const topHour = topHourEntry ? parseInt(topHourEntry[0]) : 0;
  const topHourCount = topHourEntry ? topHourEntry[1] : 0;
  const dowSummary = dowNames.map((n, i) => n + ": " + dowMap[i]).join(" &middot; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wispr Flow All-Time Recap &mdash; ${escapeHTML(dateRange)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f5f4ed;
    --surface: rgba(255, 255, 255, 0.6);
    --surface2: rgba(255, 255, 255, 0.85);
    --border: rgba(135, 139, 134, 0.12);
    --text: #0b0d0b;
    --text-muted: #52534e;
    --accent: #f34e3f;
    --accent-light: rgba(243, 78, 63, 0.12);
    --font-sans: "Inter", system-ui, -apple-system, sans-serif;
    --font-serif: "Instrument Serif", "Times New Roman", serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    padding: 48px 24px;
    max-width: 760px;
    margin: 0 auto;
    line-height: 1.5;
    font-size: 1.125rem;
  }
  @media (min-width: 640px) { body { padding: 64px 32px; font-size: 1.25rem; } }

  .label-mono {
    font-family: var(--font-mono); font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
    display: inline-flex; align-items: center; padding: 0.25rem 0.6rem;
    background: var(--accent-light); border-radius: 999px; margin-bottom: 16px;
  }
  h1 { font-family: var(--font-serif); font-size: 2.5rem; font-weight: 400;
    line-height: 1.15; color: var(--text); margin-bottom: 6px; font-style: italic; }
  .subtitle { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 40px; }

  .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 48px; }
  @media (min-width: 640px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
  .stat-card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 20px; backdrop-filter: blur(8px); }
  .stat-value { font-family: var(--font-serif); font-size: 2rem; font-weight: 400;
    color: var(--text); line-height: 1.1; margin-bottom: 4px; }
  .stat-label { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.14em; }
  .stat-note { font-family: var(--font-mono); font-size: 0.5rem; color: var(--text-muted);
    letter-spacing: 0.04em; margin-top: 4px; opacity: 0.7; }

  h2 { font-family: var(--font-serif); font-size: 1.75rem; font-weight: 400;
    margin-bottom: 20px; color: var(--text); padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .section { margin-bottom: 48px; }

  .month-chart { display: flex; gap: 8px; align-items: flex-end; height: 200px; padding: 16px 0; }
  .month-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
  .month-value { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); min-height: 16px; }
  .month-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .month-bar { width: 100%; max-width: 64px; background: rgba(243, 78, 63, 0.25);
    border-radius: 6px 6px 2px 2px; min-height: 2px; transition: height 0.6s ease; }
  .month-label { font-family: var(--font-mono); font-size: 0.6rem; font-weight: 500;
    letter-spacing: 0.04em; color: var(--text); text-align: center; line-height: 1.3; }
  .month-sublabel { font-family: var(--font-mono); font-size: 0.5rem; color: var(--text-muted); }

  .dow-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 8px; }
  .dow-cell { border-radius: 10px; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 14px 8px; min-height: 64px; }
  .dow-num { font-family: var(--font-serif); font-size: 1.1rem; font-weight: 400;
    font-style: italic; margin-bottom: 2px; }
  .dow-label { font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; }

  .hour-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-top: 8px; }
  @media (min-width: 640px) { .hour-grid { grid-template-columns: repeat(12, 1fr); } }
  .hour-cell { aspect-ratio: 1; border-radius: 6px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; min-height: 32px; }
  .hour-num { font-family: var(--font-serif); font-size: 0.85rem; font-weight: 400; font-style: italic; }
  .hour-label { font-family: var(--font-mono); font-size: 0.45rem; letter-spacing: 0.06em; }

  .app-card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 18px; margin-bottom: 8px; backdrop-filter: blur(8px); }
  .app-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .app-icon-fallback { display: flex; align-items: center; justify-content: center;
    background: var(--accent-light); color: var(--accent); font-family: var(--font-serif);
    font-size: 1.2rem; width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
  .app-header-text { flex: 1; min-width: 0; }
  .app-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; color: var(--text); }
  .app-bar-wrap { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .app-bar { height: 100%; background: var(--accent); border-radius: 2px; min-width: 4px; }
  .app-stats { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.04em; }

  .daily-bars { display: flex; align-items: flex-end; gap: 1px; height: 80px; padding: 8px 0; }
  .daily-bar { flex: 1; background: rgba(243, 78, 63, 0.25); border-radius: 2px 2px 0 0;
    min-width: 0; min-height: 1px; cursor: pointer; position: relative; }
  .daily-bar:hover { background: rgba(243, 78, 63, 0.5); }
  .daily-bar:hover .daily-tip { display: block; }
  .daily-tip { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%;
    transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 4px 8px;
    border-radius: 6px; font-family: var(--font-mono); font-size: 0.55rem;
    white-space: nowrap; z-index: 10; pointer-events: none; }
  .daily-legend { display: flex; justify-content: space-between; font-family: var(--font-mono);
    font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.04em; margin-top: 4px; }

  .streaks-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .streak-card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 20px; text-align: center; backdrop-filter: blur(8px); }
  .streak-value { font-family: var(--font-serif); font-size: 1.8rem; font-weight: 400;
    color: var(--accent); line-height: 1.1; margin-bottom: 4px; }
  .streak-label { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.14em; }

  .persona-card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 24px; margin-bottom: 12px; backdrop-filter: blur(8px); }
  .persona-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .persona-emoji { font-size: 1.6rem; width: 44px; height: 44px; display: flex;
    align-items: center; justify-content: center; background: var(--accent-light);
    border-radius: 12px; flex-shrink: 0; }
  .persona-title { font-family: var(--font-serif); font-size: 1.25rem; font-weight: 400;
    font-style: italic; color: var(--text); }
  .persona-desc { font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px; }
  .persona-desc strong { color: var(--text); }
  .persona-stat { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted);
    letter-spacing: 0.04em; border-top: 1px solid var(--border); padding-top: 10px; }

  .share-btn { font-family: var(--font-mono); font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent);
    background: var(--accent-light); border: none; border-radius: 999px;
    padding: 8px 16px; cursor: pointer; transition: background 0.2s; margin-bottom: 16px; }
  .share-btn:hover { background: rgba(243, 78, 63, 0.2); }

  .share-card { position: absolute; left: -9999px; top: 0; width: 1200px; height: 630px;
    background: var(--bg); padding: 56px 64px; display: flex; flex-direction: column;
    justify-content: space-between; font-family: var(--font-sans); }
  .sc-top { display: flex; justify-content: space-between; align-items: center; }
  .sc-brand { font-family: var(--font-mono); font-size: 14px; font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
  .sc-type { font-family: var(--font-mono); font-size: 13px; font-weight: 500;
    letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
  .sc-title { font-family: var(--font-serif); font-size: 52px; font-weight: 400;
    font-style: italic; color: var(--text); line-height: 1.15; margin-top: 8px; }
  .sc-stats { display: flex; gap: 24px; margin-top: 4px; }
  .sc-stat { background: rgba(255,255,255,0.6); border: 1px solid rgba(135,139,134,0.12);
    border-radius: 16px; padding: 20px 28px; flex: 1; text-align: center; }
  .sc-num { font-family: var(--font-serif); font-size: 44px; font-weight: 400;
    color: var(--text); line-height: 1.1; }
  .sc-label { font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.14em; margin-top: 4px; }
  .sc-apps { display: flex; flex-direction: column; gap: 10px; }
  .sc-app { display: flex; align-items: center; gap: 14px; }
  .sc-app-name { font-family: var(--font-sans); font-size: 16px; font-weight: 600;
    color: var(--text); min-width: 120px; text-align: right; }
  .sc-app-bar-wrap { flex: 1; height: 12px; background: rgba(135,139,134,0.08);
    border-radius: 6px; overflow: hidden; }
  .sc-app-bar { height: 100%; background: #2d2d2d; border-radius: 6px; }
  .sc-app-pct { font-family: var(--font-mono); font-size: 14px; color: var(--text-muted); min-width: 40px; }

  .share-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; }
  .share-modal.open { display: flex; }
  .share-modal-inner { background: #fff; border-radius: 20px; padding: 24px;
    max-width: 680px; width: 90%; box-shadow: 0 24px 48px rgba(0,0,0,0.2); position: relative; }
  .share-modal-inner img { width: 100%; border-radius: 12px; border: 1px solid rgba(135,139,134,0.12); }
  .modal-close { position: absolute; top: -12px; right: -12px; width: 32px; height: 32px;
    border-radius: 50%; background: var(--text); color: #fff; border: none; font-size: 18px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .share-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; }
  .share-action-btn { font-family: var(--font-mono); font-size: 0.7rem; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase; padding: 10px 20px;
    border-radius: 999px; cursor: pointer; border: none; transition: background 0.2s;
    display: flex; align-items: center; gap: 8px; }
  .share-action-btn.primary { background: var(--accent); color: #fff; }
  .share-action-btn.primary:hover { background: #e04435; }
  .share-action-btn.secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
  .share-action-btn.secondary:hover { background: #edece5; }
  .share-action-btn svg { width: 14px; height: 14px; }

  .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted);
    text-align: center; letter-spacing: 0.1em; text-transform: uppercase; }
  .footer a { color: var(--accent); text-decoration: underline;
    text-underline-offset: 3px; text-decoration-thickness: 1px; }
  .footer-brand { font-family: var(--font-mono); font-size: 0.7rem; font-weight: 500;
    letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
  .footer-links { margin-top: 6px; line-height: 1.8; }
</style>
</head>
<body>

<div class="label-mono">All-Time Recap</div>
<h1>${escapeHTML(dateRange)}</h1>
<div class="subtitle">Your voice in data &mdash; powered by Wispr Flow</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">${totalWords.toLocaleString()}</div>
    <div class="stat-label">Total Words</div>
    ${hasApi && desktopWords !== null ? `<div class="stat-note">${desktopWords.toLocaleString()} desktop + ${mobileWords.toLocaleString()} mobile</div>` : ""}
  </div>
  <div class="stat-card">
    <div class="stat-value">${voiceTime}</div>
    <div class="stat-label">Voice Time</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${wpmDisplay}</div>
    <div class="stat-label">Avg WPM</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${totalDictations.toLocaleString()}</div>
    <div class="stat-label">Dictations</div>
    <div class="stat-note">Local cache</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${activeDayCount}</div>
    <div class="stat-label">Active Days</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${monthsTracked}</div>
    <div class="stat-label">Months Tracked</div>
  </div>
  ${dayStreak !== null ? `<div class="stat-card">
    <div class="stat-value">${dayStreak}</div>
    <div class="stat-label">Day Streak</div>
  </div>` : ""}
  ${weekStreak !== null ? `<div class="stat-card">
    <div class="stat-value">${weekStreak}</div>
    <div class="stat-label">Week Streak</div>
  </div>` : ""}
  ${wordsThisWeek !== null ? `<div class="stat-card">
    <div class="stat-value">${wordsThisWeek.toLocaleString()}</div>
    <div class="stat-label">Words This Week</div>
  </div>` : ""}
</div>

<div class="section">
  <h2>Month by Month</h2>
  <div class="month-chart">
    ${monthBars}
  </div>
</div>

<div class="section">
  <h2>Day of Week</h2>
  <div class="dow-grid">
    ${dowCells}
  </div>
</div>

<div class="section">
  <h2>Hour by Hour</h2>
  <div class="hour-grid">
    ${hourCells.join("\n")}
  </div>
</div>

<div class="section">
  <h2>Apps</h2>
  ${totalAppsCount !== null ? `<div style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.04em; margin-bottom: 12px;">${totalAppsCount} apps used all-time (${appsSorted.length} shown from local cache)</div>` : ""}
  ${appCards}
</div>

<div class="section">
  <h2>Daily Activity</h2>
  <div class="daily-bars" id="dailyBars"></div>
  <div class="daily-legend">
    <span>${formatMonthLabel(monthsSorted[0][0])}</span>
    <span>${formatMonthLabel(monthsSorted[monthsSorted.length - 1][0])}</span>
  </div>
</div>

<div class="section">
  <h2>Consistency</h2>
  <div class="streaks-grid">
    <div class="streak-card">
      <div class="streak-value">${activeDayCount}</div>
      <div class="streak-label">Active Days</div>
    </div>
    <div class="streak-card">
      <div class="streak-value">${longestGap}d</div>
      <div class="streak-label">Longest Gap</div>
    </div>
    <div class="streak-card">
      <div class="streak-value">${avgGap}d</div>
      <div class="streak-label">Avg Gap</div>
    </div>
  </div>
</div>

<div class="section">
  <h2>Voice Personality Profile</h2>

  <div class="persona-card">
    <div class="persona-top">
      <div class="persona-emoji">&#9889;</div>
      <div class="persona-title">Burst Worker</div>
    </div>
    <div class="persona-desc">You dictate in intense bursts followed by long quiet stretches. Your biggest day hit <strong>${peakDay[1]} dictations</strong> (${peakDayLabel}), but your longest gap was <strong>${longestGap} days</strong>. When you're on, you're <em>on</em>.</div>
    <div class="persona-stat">Top day: ${peakDay[1]} dictations &middot; ${peakDayLabel}</div>
  </div>

  <div class="persona-card">
    <div class="persona-top">
      <div class="persona-emoji">&#129302;</div>
      <div class="persona-title">AI-First Communicator</div>
    </div>
    <div class="persona-desc"><strong>${aiPct}%</strong> of your dictations go into AI tools (Perplexity, Claude, ChatGPT). You think out loud with AI &mdash; using voice as your primary input to LLMs.</div>
    <div class="persona-stat">${aiCount} of ${totalDictations} dictations &rarr; AI tools</div>
  </div>

  <div class="persona-card">
    <div class="persona-top">
      <div class="persona-emoji">&#128170;</div>
      <div class="persona-title">${topDowName} Powerhouse</div>
    </div>
    <div class="persona-desc">${topDowName} is your most productive day &mdash; <strong>${dowMap[topDow]} dictations</strong>. ${dowSummary}</div>
    <div class="persona-stat">${dowSummary}</div>
  </div>

  <div class="persona-card">
    <div class="persona-top">
      <div class="persona-emoji">&#127908;</div>
      <div class="persona-title">Concise Dictator</div>
    </div>
    <div class="persona-desc">Your average dictation is <strong>${avgWords.toFixed(1)} words</strong> &mdash; quick commands and thoughts, not long monologues. Your longest was ${maxDictationWords} words. You use voice for speed, not essays.</div>
    <div class="persona-stat">Avg: ${avgWords.toFixed(1)} words &middot; Max: ${maxDictationWords} words &middot; ${totalWords.toLocaleString()} total</div>
  </div>
</div>

<div class="footer">
  <button class="share-btn" onclick="generateShareImage()">Share</button>
  <div class="footer-brand">Red Beard Conversions</div>
  <div class="footer-links">
    Generated ${today} &middot; ${dataSource} &middot; Powered by <a href="https://lttlmg.ht/wisprflow">Wispr Flow</a> + Claude Code
  </div>
</div>

<!-- Share Card -->
<div class="share-card" id="shareCard">
  <div>
    <div class="sc-top">
      <div class="sc-brand">Wispr Flow</div>
      <div class="sc-type">All-Time Recap</div>
    </div>
    <div class="sc-title">${escapeHTML(dateRange)}</div>
  </div>
  <div class="sc-stats">
    <div class="sc-stat"><div class="sc-num">${totalWords.toLocaleString()}</div><div class="sc-label">Words</div></div>
    <div class="sc-stat"><div class="sc-num">${voiceTime}</div><div class="sc-label">Voice Time</div></div>
    <div class="sc-stat"><div class="sc-num">${wpmDisplay} wpm</div><div class="sc-label">Avg Speed</div></div>
  </div>
  <div class="sc-apps">
    ${shareApps}
  </div>
</div>

<!-- Share Modal -->
<div class="share-modal" id="shareModal">
  <div class="share-modal-inner">
    <button class="modal-close" onclick="closeShareModal()">&times;</button>
    <img id="shareImg" />
    <div class="share-actions">
      <button class="share-action-btn primary" onclick="downloadShareImage()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
      <button class="share-action-btn secondary" onclick="shareOnX()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share on X
      </button>
    </div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
const dailyData = ${dailyJSON};
const maxDaily = Math.max(...dailyData.map(d => d[1]));
const barsContainer = document.getElementById('dailyBars');
dailyData.forEach(([date, cnt]) => {
  const pct = (cnt / maxDaily) * 100;
  const bar = document.createElement('div');
  bar.className = 'daily-bar';
  bar.style.height = Math.max(pct, 2) + '%';
  const tip = document.createElement('div');
  tip.className = 'daily-tip';
  const d = new Date(date + 'T12:00:00');
  tip.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ': ' + cnt;
  bar.appendChild(tip);
  barsContainer.appendChild(bar);
});

const shareText = "${totalWords.toLocaleString()} words dictated across ${monthsTracked} months with @WisprFlow — ${aiPct}% going straight to AI tools";
let shareBlob = null;
async function generateShareImage() {
  const btn = document.querySelector(".share-btn"); btn.textContent = "...";
  const card = document.getElementById("shareCard");
  card.style.left = "0"; card.style.top = "0"; card.style.position = "fixed"; card.style.zIndex = "-1";
  try {
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: "#f5f4ed", width: 1200, height: 630, useCORS: true });
    card.style.left = "-9999px"; card.style.position = "absolute"; card.style.zIndex = "";
    document.getElementById("shareImg").src = canvas.toDataURL("image/png");
    canvas.toBlob(b => { shareBlob = b; });
    document.getElementById("shareModal").classList.add("open");
  } catch (e) { console.error(e); }
  btn.textContent = "Share";
}
function closeShareModal() { document.getElementById("shareModal").classList.remove("open"); }
function downloadShareImage() {
  const a = document.createElement("a"); a.href = document.getElementById("shareImg").src;
  a.download = "wispr-alltime-recap.png"; a.click();
}
async function shareOnX() {
  if (shareBlob && navigator.canShare && navigator.canShare({ files: [new File([shareBlob], "recap.png", { type: "image/png" })] })) {
    await navigator.share({ text: shareText, files: [new File([shareBlob], "wispr-alltime-recap.png", { type: "image/png" })] });
  } else { downloadShareImage(); setTimeout(() => window.open("https://x.com/intent/tweet?text=" + encodeURIComponent(shareText), "_blank"), 500); }
}
document.getElementById("shareModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeShareModal(); });
</script>
</body>
</html>`;
}

})(); // end async IIFE
