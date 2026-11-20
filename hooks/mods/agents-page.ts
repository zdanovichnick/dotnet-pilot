import type { AgentRun } from '../../types'
import { formatDuration, formatTokens, formatUsd, isLive, statsByType, type RosterAgent } from './agents-data'
import type { ReviewSummary } from './dashboard-data'

export type AgentsPageInput = {
  nowMs: number
  cwd: string
  runs: readonly AgentRun[]
  roster: readonly RosterAgent[]
  review?: ReviewSummary
}

export const HISTORY_ROWS = 50
export const LIVE_REFRESH_S = 5
export const IDLE_REFRESH_S = 30
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
  <td class="num">${formatDuration(nowMs - r.startMs)}</td>
  <td class="num">${formatTokens(r.tokens)}</td>
  <td class="num">${formatUsd(r.usd)}</td>
</tr>`,
    )
    .join('\n')
}

const historyRows = (runs: readonly AgentRun[]) => {
  const done = runs.filter(r => !isLive(r)).sort((a, b) => (b.endMs ?? 0) - (a.endMs ?? 0)).slice(0, HISTORY_ROWS)
  if (done.length === 0) return empty(5, 'No agent has finished in this session.')
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

const statsRows = (runs: readonly AgentRun[]) => {
  const stats = statsByType(runs)
  if (stats.length === 0) return empty(6, 'No runs yet.')
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

const rosterRows = (roster: readonly RosterAgent[], runs: readonly AgentRun[]) => {
  if (roster.length === 0) return empty(5, 'No agents/dnp-*.md files were found.')
  const used = new Set(runs.map(r => shortType(r.type)))
  return [...roster]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      a => `<tr>
  <td><strong>${escapeHtml(a.name)}</strong>${used.has(a.name) ? ' <span class="badge completed">used</span>' : ''}</td>
  <td>${escapeHtml(a.model)}</td>
  <td>${escapeHtml(a.effort)}</td>
  <td class="num">${a.toolCount}</td>
  <td class="sub">${escapeHtml(a.skills.join(', ') || '—')}</td>
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
`

export const renderAgentsPage = (input: AgentsPageInput): string => {
  const { nowMs, cwd, runs, roster, review } = input
  const live = runs.filter(isLive).length
  const finished = runs.filter(r => !isLive(r))
  const completed = finished.filter(r => r.status === 'completed').length
  const rate = finished.length === 0 ? '—' : `${Math.round((completed / finished.length) * 100)}%`
  const tokens = runs.reduce((n, r) => n + r.tokens, 0)
  const refresh = live > 0 ? LIVE_REFRESH_S : IDLE_REFRESH_S
  const stamp = new Date(nowMs).toISOString().replace('T', ' ').slice(0, 19)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${refresh}">
<title>DotnetPilot Agents</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>DotnetPilot agents</h1>
  <p>${escapeHtml(cwd)} · updated ${stamp} UTC · refreshes every ${refresh}s</p>
  <div class="counts">
    <div class="count"><b>${live}</b><span>working now</span></div>
    <div class="count"><b>${finished.length}</b><span>finished</span></div>
    <div class="count"><b>${rate}</b><span>success rate</span></div>
    <div class="count"><b>${formatTokens(tokens)}</b><span>tokens</span></div>
  </div>
</header>
<main>
  <section class="wide"><h2>Live agents</h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Status</th><th>Model</th><th class="num">Elapsed</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>${liveRows(runs, nowMs)}</tbody></table></div></section>
  <section class="wide"><h2>Run history <small>last ${HISTORY_ROWS}</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Outcome</th><th>Model</th><th class="num">Duration</th><th class="num">Tokens</th></tr></thead>
    <tbody>${historyRows(runs)}</tbody></table></div></section>
  <section><h2>Per-agent stats <small>this session</small></h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th class="num">Runs</th><th class="num">Success</th><th class="num">Avg</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>${statsRows(runs)}</tbody></table></div></section>
  <section><h2>Roster</h2><div class="scroll"><table>
    <thead><tr><th>Agent</th><th>Model</th><th>Effort</th><th class="num">Tools</th><th>Skills</th></tr></thead>
    <tbody>${rosterRows(roster, runs)}</tbody></table></div></section>
</main>
<footer>${escapeHtml(reviewLine(review))}</footer>
</body>
</html>
`
}
