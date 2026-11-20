import type { AgentRun } from '../../types'
import {
  finishedRuns,
  formatDuration,
  formatTokens,
  formatUsd,
  isLive,
  statsByType,
  statsFromTotals,
  type AgentHistory,
  type AgentMemory,
  type MemoryEntry,
  type RosterAgent,
  type TypeStats,
} from './agents-data'
import type { ReviewSummary } from './dashboard-data'

export type AgentsPageInput = {
  nowMs: number
  cwd: string
  runs: readonly AgentRun[]
  roster: readonly RosterAgent[]
  review?: ReviewSummary
  history?: AgentHistory
  memory?: { dir: string; entries: readonly MemoryEntry[] }
  agentMemory?: readonly AgentMemory[]
}

export const HISTORY_ROWS = 50
export const DATA_FILE = 'dnp-agents-data.js'
export const POLL_MS = 1000
const NOSCRIPT_REFRESH_S = 5
const PLUGIN_PREFIX = 'dotnet-pilot:'

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const shortType = (type: string) => (type.startsWith(PLUGIN_PREFIX) ? type.slice(PLUGIN_PREFIX.length) : type)

const badge = (status: string) => `<span class="badge ${escapeHtml(status)}">${status === 'running' ? 'working' : escapeHtml(status)}</span>`

const verdictChip = (verdict: string | undefined) => {
  if (verdict === undefined) return ''
  const kind = verdict.startsWith('[HALT') ? 'halt' : verdict.startsWith('[PARTIAL') ? 'partial' : 'routing'
  return `<span class="chip ${kind}">${escapeHtml(verdict)}</span>`
}

const modelCell = (run: AgentRun) => escapeHtml([run.model, run.effort].filter(v => v !== undefined && v !== '').join(' · ') || '—')

const empty = (cols: number, text: string) => `<tr><td colspan="${cols}" class="empty">${escapeHtml(text)}</td></tr>`

const liveRows = (runs: readonly AgentRun[], nowMs: number) => {
  const live = runs.filter(isLive)
  if (live.length === 0) return empty(6, 'No agent is running.')
  return live
    .map(
      r => `<tr>
  <td><strong>${escapeHtml(shortType(r.type))}</strong><div class="sub">${escapeHtml(r.description)}</div></td>
  <td>${badge(r.status)}</td>
  <td>${modelCell(r)}</td>
  <td class="num" data-start="${r.startMs}">${formatDuration(nowMs - r.startMs)}</td>
  <td class="num">${formatTokens(r.tokens)}</td>
  <td class="num">${formatUsd(r.usd)}</td>
</tr>`,
    )
    .join('\n')
}

const historyRows = (runs: readonly AgentRun[], history: AgentHistory | undefined) => {
  const done = finishedRuns(runs, history?.recent ?? []).slice(0, HISTORY_ROWS)
  if (done.length === 0) return empty(5, history === undefined ? 'No agent has finished in this session.' : 'No agent has finished in this project yet.')
  return done
    .map(
      r => `<tr>
  <td><strong>${escapeHtml(shortType(r.type))}</strong><div class="sub">${escapeHtml(r.description)}</div>${verdictChip(r.verdict)}</td>
  <td>${badge(r.status)}</td>
  <td>${modelCell(r)}</td>
  <td class="num">${formatDuration(r.durationMs)}</td>
  <td class="num">${formatTokens(r.tokens)}</td>
</tr>`,
    )
    .join('\n')
}

const statsRows = (stats: readonly TypeStats[], emptyText: string) => {
  if (stats.length === 0) return empty(6, emptyText)
  return stats
    .map(s => {
      const rate = s.successRate === undefined ? '—' : `${Math.round(s.successRate * 100)}%`
      const bar = s.successRate === undefined ? '' : `<div class="bar"><span style="width:${Math.round(s.successRate * 100)}%"></span></div>`
      return `<tr>
  <td><strong>${escapeHtml(shortType(s.type))}</strong></td>
  <td class="num">${s.runs}</td>
  <td class="num">${rate}${bar}</td>
  <td class="num">${s.avgMs === undefined ? '—' : formatDuration(s.avgMs)}</td>
  <td class="num">${formatTokens(s.tokens)}</td>
  <td class="num">${s.usd > 0 ? formatUsd(s.usd) : '—'}</td>
</tr>`
    })
    .join('\n')
}

const memoryCell = (m: AgentMemory | undefined) =>
  m === undefined ? '—' : `<span title="${escapeHtml(m.folder)}">${m.notes} note${m.notes === 1 ? '' : 's'}${m.hasIndex ? '' : ', no index'}</span>`

const rosterRows = (roster: readonly RosterAgent[], used: ReadonlySet<string>, agentMemory: readonly AgentMemory[]) => {
  if (roster.length === 0) return empty(6, 'No agents/dnp-*.md files were found.')
  return [...roster]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      a => `<tr>
  <td><strong>${escapeHtml(a.name)}</strong>${used.has(a.name) ? ' <span class="badge completed">used</span>' : ''}</td>
  <td>${escapeHtml(a.model)}</td>
  <td>${escapeHtml(a.effort)}</td>
  <td class="num">${a.toolCount}</td>
  <td>${memoryCell(agentMemory.find(m => m.agent === a.name))}</td>
  <td class="sub">${escapeHtml(a.skills.join(', ') || '—')}</td>
</tr>`,
    )
    .join('\n')
}

const memoryRows = (entries: readonly MemoryEntry[]) => {
  if (entries.length === 0) return empty(3, 'No memory entries for this project.')
  return [...entries]
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .map(
      m => `<tr>
  <td><strong>${escapeHtml(m.name)}</strong><div class="sub">${escapeHtml(m.file)}</div></td>
  <td>${escapeHtml(m.type)}</td>
  <td class="sub">${escapeHtml(m.description)}</td>
</tr>`,
    )
    .join('\n')
}

const reviewLine = (review: ReviewSummary | undefined) =>
  review === undefined
    ? 'No review run saved for this folder.'
    : `Last review ${review.runId} (${review.depth}): agents ${review.returned}/${review.requested} returned, ${review.confirmed.length} confirmed, ${review.refuted} refuted.`

const CSS = `
:root { color-scheme: light dark; --bg:#f6f7f9; --card:#ffffff; --fg:#16181d; --muted:#5f6673; --line:#e3e6eb;
  --accent:#3b5bdb; --ok:#2b8a3e; --ok-bg:#e6f4ea; --warn:#b35c00; --warn-bg:#fff1e0; --bad:#c92a2a; --bad-bg:#fdecec;
  --run:#1c64d1; --run-bg:#e5effd; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0f1115; --card:#171a21; --fg:#e7e9ee; --muted:#9aa1ad;
  --line:#2a2f39; --accent:#8ea2ff; --ok:#69db7c; --ok-bg:#16301d; --warn:#ffb35c; --warn-bg:#3a2810; --bad:#ff8787; --bad-bg:#3b1818;
  --run:#74a7ff; --run-bg:#14274a; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding:20px 16px 8px; max-width:1200px; margin:0 auto; }
h1 { margin:0; font-size:20px; } header p { margin:4px 0 0; color:var(--muted); font-size:13px; word-break:break-all; }
.counts { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
.count { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; min-width:110px; }
.count b { display:block; font-size:20px; }
.count span { color:var(--muted); font-size:12px; }
main { display:grid; grid-template-columns:1fr; gap:16px; padding:8px 16px 24px; max-width:1200px; margin:0 auto; }
@media (min-width: 900px) { main { grid-template-columns:1fr 1fr; } .wide { grid-column:1 / -1; } }
section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; min-width:0; }
h2 { margin:0 0 10px; font-size:15px; } h2 small { color:var(--muted); font-weight:normal; }
.scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:7px 8px; border-top:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-weight:600; font-size:12px; border-top:none; }
.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
.sub { color:var(--muted); font-size:12px; }
.empty { color:var(--muted); text-align:center; padding:18px; }
.badge { display:inline-block; border-radius:999px; padding:1px 8px; font-size:12px; font-weight:600; }
.badge.running, .badge.waiting { color:var(--run); background:var(--run-bg); }
.badge.completed { color:var(--ok); background:var(--ok-bg); }
.badge.failed { color:var(--bad); background:var(--bad-bg); }
.badge.aborted { color:var(--warn); background:var(--warn-bg); }
.chip { display:inline-block; margin-top:4px; border-radius:6px; padding:2px 6px; font:12px ui-monospace, Consolas, monospace; word-break:break-word; }
.chip.halt { color:var(--bad); background:var(--bad-bg); }
.chip.partial { color:var(--warn); background:var(--warn-bg); }
.chip.routing { color:var(--run); background:var(--run-bg); }
.bar { height:4px; background:var(--line); border-radius:2px; margin-top:4px; }
.bar span { display:block; height:100%; background:var(--ok); border-radius:2px; }
footer { max-width:1200px; margin:0 auto; padding:0 16px 24px; color:var(--muted); font-size:12px; }
.status::before { content:""; display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; background:var(--muted); vertical-align:middle; }
.status.live::before { background:var(--run); animation:pulse 1.2s ease-in-out infinite; }
.status.stale::before { background:var(--warn); }
@keyframes pulse { 50% { opacity:.3; } }
@media (prefers-reduced-motion: reduce) { .status.live::before { animation:none; } }
`

// Runs in the browser. A <script src> is re-added each second because fetch() is refused on file://.
// The mod clock and the browser clock may count from different origins, so elapsed time is the
// mod's own updatedMs plus the browser time since that value first arrived.
const CLIENT = (updatedMs: number, live: number) => `(function () {
  var parts = { counts: null, main: null, footer: null };
  var shellMs = ${updatedMs};
  var state = { updatedMs: shellMs, live: ${live}, seenAt: Date.now() };
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }
  window.dnpAgentsUpdate = function (d) {
    if (d.updatedMs !== state.updatedMs) state = { updatedMs: d.updatedMs, live: d.live, seenAt: Date.now() };
    for (var k in parts) {
      var el = document.getElementById('dnp-' + k);
      if (!el || typeof d[k] !== 'string' || d[k] === parts[k]) continue;
      var isShellCopy = parts[k] === null && d.updatedMs === shellMs;
      parts[k] = d[k];
      if (!isShellCopy) el.innerHTML = d[k];
    }
    tick();
  };
  function tick() {
    var age = Date.now() - state.seenAt;
    var modNow = state.updatedMs + age;
    var cells = document.querySelectorAll('[data-start]');
    for (var i = 0; i < cells.length; i++) cells[i].textContent = fmt(modNow - Number(cells[i].getAttribute('data-start')));
    var el = document.getElementById('dnp-status');
    if (!el) return;
    var stale = state.live > 0 && age > 10000;
    el.className = 'status' + (stale ? ' stale' : state.live > 0 ? ' live' : '');
    el.textContent = stale ? 'no update for ' + fmt(age) + ', is the session still running?' : (state.live > 0 ? 'live' : 'idle') + ' · last change ' + fmt(age) + ' ago';
  }
  function poll() {
    var s = document.createElement('script');
    s.src = '${DATA_FILE}?' + Date.now();
    s.onload = s.onerror = function () { s.remove(); };
    document.head.appendChild(s);
  }
  tick();
  setInterval(tick, 1000);
  setInterval(poll, ${POLL_MS});
})();`

type PageParts = { updatedMs: number; live: number; counts: string; main: string; footer: string }

const pageParts = (input: AgentsPageInput): PageParts => {
  const { nowMs, runs, roster, review, history, memory, agentMemory = [] } = input
  const used = new Set([...runs.map(r => shortType(r.type)), ...Object.keys(history?.totals ?? {}).map(shortType)])
  const live = runs.filter(isLive).length
  const finished = runs.filter(r => !isLive(r))
  const completed = finished.filter(r => r.status === 'completed').length
  const rate = finished.length === 0 ? '—' : `${Math.round((completed / finished.length) * 100)}%`
  const tokens = runs.reduce((n, r) => n + r.tokens, 0)
  const counts = `
    <div class="count"><b>${live}</b><span>working now</span></div>
    <div class="count"><b>${finished.length}</b><span>finished</span></div>
    <div class="count"><b>${rate}</b><span>success rate</span></div>
    <div class="count"><b>${formatTokens(tokens)}</b><span>tokens</span></div>
  `
  const main = `
  <section class="wide"><h2>Live agents</h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Status</th><th>Model</th><th class="num">Elapsed</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>${liveRows(runs, nowMs)}</tbody></table></div></section>
  <section class="wide"><h2>Run history <small>last ${HISTORY_ROWS}${history === undefined ? '' : ' · all sessions'}</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Outcome</th><th>Model</th><th class="num">Duration</th><th class="num">Tokens</th></tr></thead>
    <tbody>${historyRows(runs, history)}</tbody></table></div></section>
  <section><h2>Per-agent stats <small>this session</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th class="num">Runs</th><th class="num">Success</th><th class="num">Avg</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>${statsRows(statsByType(runs), 'No runs yet.')}</tbody></table></div></section>
  <section><h2>Per-agent stats <small>all sessions</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th class="num">Runs</th><th class="num">Success</th><th class="num">Avg</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>${statsRows(statsFromTotals(history?.totals ?? {}), 'No finished run is saved for this project yet.')}</tbody></table></div></section>
  <section class="wide"><h2>Roster <small>agent memory in .claude/agent-memory/</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Model</th><th>Effort</th><th class="num">Tools</th><th>Memory</th><th>Skills</th></tr></thead>
    <tbody>${rosterRows(roster, used, agentMemory)}</tbody></table></div></section>
  <section class="wide"><h2>Project memory <small>${escapeHtml(memory?.dir ?? 'not read')}</small></h2><div class="scroll"><table>
    <thead><tr><th>Memory</th><th>Type</th><th>Description</th></tr></thead>
    <tbody>${memoryRows(memory?.entries ?? [])}</tbody></table></div></section>
`
  return { updatedMs: nowMs, live, counts, main, footer: escapeHtml(reviewLine(review)) }
}

// The data file is plain script so the page can load it from file:// where fetch() is refused.
export const renderAgentsData = (input: AgentsPageInput): string =>
  `window.dnpAgentsUpdate && window.dnpAgentsUpdate(${JSON.stringify(pageParts(input))});\n`

export const renderAgentsPage = (input: AgentsPageInput): string => {
  const parts = pageParts(input)
  const stamp = new Date(input.nowMs).toISOString().replace('T', ' ').slice(0, 19)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<noscript><meta http-equiv="refresh" content="${NOSCRIPT_REFRESH_S}"></noscript>
<title>DotnetPilot Agents</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>DotnetPilot agents</h1>
  <p>${escapeHtml(input.cwd)} · <span id="dnp-status" class="status">written ${stamp} UTC</span></p>
  <div class="counts" id="dnp-counts">${parts.counts}</div>
</header>
<main id="dnp-main">${parts.main}</main>
<footer id="dnp-footer">${parts.footer}</footer>
<script>${CLIENT(parts.updatedMs, parts.live)}</script>
</body>
</html>
`
}
