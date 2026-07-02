#!/usr/bin/env node
// DotnetPilot statusline — renders a compact, .NET-aware status line.
//
// Claude Code pipes a session JSON object on stdin and renders whatever this
// script writes to stdout (one terminal row per line). This script is the
// SOURCE OF TRUTH; the install command and the dnp-statusline-sync hook copy
// it to ~/.claude/dnp-statusline.js (a stable path, because ${CLAUDE_PLUGIN_ROOT}
// is NOT expanded inside statusLine command strings). Because the installed copy
// lives outside the plugin, it CANNOT require hooks/_lib/*, so this file is
// deliberately self-contained: the small bits it borrows (dotnet detection,
// build-fail temp path) are re-implemented here with a pointer to their origin.
//
// Layout:
//   Line 1 (always): <model> | CTX <pct>% · <tokens> | GIT <branch> <dirty/upstream> | ⏱ <elapsed> | $<cost>
//   Line 2 (.NET only): SLN <name> | TFM <tfm> | BUILD ✗ Nx
//
// Never throws, never blocks: any failure degrades to a shorter line or nothing.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Installed-version stamp — read by dnp-statusline-sync.js to decide whether to
// refresh the copy in ~/.claude. Keep in sync with plugin.json on release.
const STATUSLINE_VERSION = '2.5.2';

const DOTNET_MARKERS = ['.sln', '.slnx', '.csproj'];
const SEP = ' │ '; // " │ "

// ---- color -----------------------------------------------------------------
const useColor = !process.env.NO_COLOR;
const ANSI = { dim: '2', red: '31', cyan: '36', green: '32', yellow: '33', blue: '34' };
function c(code, s) {
  return useColor ? `[${code}m${s}[0m` : String(s);
}

// ---- stdin -----------------------------------------------------------------
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  let data = {};
  try {
    data = JSON.parse(input) || {};
  } catch {
    // Malformed payload — emit a minimal line rather than crashing.
    process.stdout.write(c(ANSI.cyan, 'Claude') + '\n');
    process.exit(0);
  }
  try {
    render(data);
  } catch {
    // Last-resort: never fail the status line.
  }
  process.exit(0);
});

// ---- render ----------------------------------------------------------------
function render(data) {
  const cwd = data.cwd || (data.workspace && data.workspace.current_dir) || process.cwd();

  const line1 = buildUniversalLine(data, cwd);
  const line2 = isDotNetProject(cwd) ? buildDotnetLine(cwd) : '';

  const out = [line1, line2].filter(Boolean).join('\n');
  if (out) process.stdout.write(out + '\n');
}

function buildUniversalLine(data, cwd) {
  const parts = [];

  const model = (data.model && (data.model.display_name || data.model.id)) || 'Claude';
  parts.push(c(ANSI.cyan, model));

  // Reasoning-effort level (low|medium|high|xhigh|max) — live session config the
  // model runs under; piped as effort.level in the statusLine stdin schema.
  const effort = data.effort && data.effort.level;
  // Two spaces: the gear glyph renders double-width in most terminals and
  // visually swallows a single trailing space.
  if (typeof effort === 'string' && effort) parts.push(c(ANSI.dim, '⚙  ') + effort); // "⚙  "

  const ctx = contextSegment(data.context_window);
  if (ctx) parts.push(ctx);

  const git = gitSegment(cwd);
  if (git) parts.push(git);

  const cost = data.cost || {};
  const elapsed = humanizeMs(cost.total_duration_ms);
  if (elapsed) parts.push(c(ANSI.dim, '⏱  ') + elapsed); // "⏱  " (double-width glyph — see effort segment)

  if (typeof cost.total_cost_usd === 'number') {
    parts.push(c(ANSI.green, '$' + cost.total_cost_usd.toFixed(2)));
  }

  return parts.join(c(ANSI.dim, SEP));
}

function buildDotnetLine(cwd) {
  const parts = [];

  const sln = nearestSolutionName(cwd);
  if (sln) parts.push(c(ANSI.blue, 'SLN ') + sln);

  const tfm = nearestTargetFramework(cwd);
  if (tfm) parts.push(c(ANSI.dim, 'TFM ') + tfm);

  const fail = buildFailState(cwd);
  if (fail) parts.push(c(ANSI.red, `BUILD ✗ ${fail}x`)); // "BUILD ✗ Nx"

  return parts.length ? parts.join(c(ANSI.dim, SEP)) : '';
}

// ---- context segment -------------------------------------------------------
function contextSegment(ctxWin) {
  if (!ctxWin || typeof ctxWin !== 'object') return '';
  const bits = [];
  if (typeof ctxWin.used_percentage === 'number') {
    bits.push(`${Math.round(ctxWin.used_percentage)}%`);
  }
  if (typeof ctxWin.total_input_tokens === 'number') {
    bits.push(compactTokens(ctxWin.total_input_tokens));
  }
  if (!bits.length) return '';
  return c(ANSI.dim, 'CTX ') + bits.join(c(ANSI.dim, ' · ')); // " · "
}

function compactTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

// ---- git segment -----------------------------------------------------------
function git(cwd, args) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 800, windowsHide: true });
    if (r.status !== 0) return null;
    return (r.stdout || '').trim();
  } catch {
    return null;
  }
}

function gitSegment(cwd) {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) return ''; // not a repo (or git unavailable)

  let label = c(ANSI.dim, 'GIT ') + branch;

  const porcelain = git(cwd, ['status', '--porcelain']);
  if (porcelain) {
    const dirty = porcelain.split('\n').filter(Boolean).length;
    if (dirty > 0) label += ' ' + c(ANSI.yellow, `✚${dirty}`); // "✚N"
  }

  // "<behind>\t<ahead>" relative to upstream; absent upstream => command fails.
  const lr = git(cwd, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (lr) {
    const [behind, ahead] = lr.split(/\s+/).map(x => parseInt(x, 10) || 0);
    let ua = '';
    if (ahead > 0) ua += `↑${ahead}`; // ↑
    if (behind > 0) ua += `↓${behind}`; // ↓
    if (ua) label += ' ' + c(ANSI.dim, ua);
  }

  return label;
}

// ---- .NET detection (mirrors hooks/_lib/dotnet.js) -------------------------
function dirHasDotNetMarker(dir) {
  try {
    return fs.readdirSync(dir).some(e => DOTNET_MARKERS.some(ext => e.endsWith(ext)));
  } catch {
    return false;
  }
}

function isDotNetProject(dir, maxUp = 5) {
  if (!dir) return false;
  let current = dir;
  for (let i = 0; i <= maxUp; i++) {
    if (dirHasDotNetMarker(current)) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

// Walk up returning the first matching filename found; ext list in priority order.
function nearestFileByExt(dir, exts, maxUp = 5) {
  let current = dir;
  for (let i = 0; i <= maxUp; i++) {
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch {
      entries = [];
    }
    for (const ext of exts) {
      const hit = entries.find(e => e.endsWith(ext));
      if (hit) return path.join(current, hit);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function nearestSolutionName(cwd) {
  const sln = nearestFileByExt(cwd, ['.slnx', '.sln']) || nearestFileByExt(cwd, ['.csproj']);
  return sln ? path.basename(sln).replace(/\.(slnx|sln|csproj)$/, '') : '';
}

function nearestTargetFramework(cwd) {
  const csproj = nearestFileByExt(cwd, ['.csproj']);
  if (!csproj) return '';
  let xml;
  try {
    xml = fs.readFileSync(csproj, 'utf8');
  } catch {
    return '';
  }
  const single = xml.match(/<TargetFramework>([^<]+)<\/TargetFramework>/i);
  if (single) return single[1].trim();
  const multi = xml.match(/<TargetFrameworks>([^<]+)<\/TargetFrameworks>/i);
  if (multi) return multi[1].split(';')[0].trim(); // first of a multi-target set
  return '';
}

// ---- build-fail state (shared contract with hooks/dnp-build-verify.js) -----
// Path scheme MUST match getFailCountPath() in hooks/dnp-build-verify.js. The
// file exists only after a failed `dotnet build/test` and is deleted on success,
// so its absence cannot prove a passing build — we surface failures only. This
// also covers test failures, which that hook records in the same file.
function buildFailState(cwd) {
  // Shared contract with hooks/dnp-build-verify.js:getFailCountPath — the sha1
  // scheme must match exactly, or the statusline reads the wrong (or no) file.
  const hash = crypto.createHash('sha1').update(cwd).digest('hex');
  const filePath = path.join(os.tmpdir(), `dnp-build-fail-${hash}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const lastFail = new Date(data.lastFail).getTime();
    if (Date.now() - lastFail >= 60 * 60 * 1000) return 0; // stale (>1h) — ignore
    return data.count || 0;
  } catch {
    return 0;
  }
}

// ---- misc ------------------------------------------------------------------
function humanizeMs(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}
