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
//   Line 1 (always): <model> | ⚙ <effort>[≠<configured>] | CTX <pct>% · <tokens>
//                    | GIT <branch> <dirty/upstream> | ⏱ <elapsed> | $<cost>
//     ⚙ shows the ACTIVE effort level; a ≠ suffix names the CONFIGURED level
//     when it differs (i.e. the configured one is not actually in force).
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
const STATUSLINE_VERSION = '2.6.0';

const DOTNET_MARKERS = ['.sln', '.slnx', '.csproj'];
const SEP = ' │ '; // " │ "

// ---- color -----------------------------------------------------------------
const useColor = !process.env.NO_COLOR;
const ANSI = { dim: '2', red: '31', cyan: '36', green: '32', yellow: '33', blue: '34' };

// Reasoning-effort value color, brightest at the top of the scale so higher
// effort reads as "hotter" and a level change is obvious at a glance.
function effortColor(level) {
  switch (level) {
    case 'max': return ANSI.red;
    case 'xhigh': return ANSI.yellow;
    case 'high': return ANSI.cyan;
    case 'medium': return ANSI.blue;
    default: return ANSI.dim; // low (and any future/unknown level)
  }
}
function c(code, s) {
  return useColor ? `[${code}m${s}[0m` : String(s);
}

// ---- configured (as opposed to active) reasoning effort ---------------------
// The payload's effort.level is the level the turn ACTUALLY ran at, after any
// silent downgrade for the selected model. That can differ from the level the
// user configured — most often because a stale CLAUDE_CODE_EFFORT_LEVEL launch
// pin outranks the `effortLevel` setting, or because the model does not support
// the requested level (effort is unsupported outright on Haiku 4.5). When the
// two disagree the line shows both, so a level that silently is not in force
// reads as a mismatch rather than looking like a statusline bug.
//
// Precedence mirrors Claude Code's own: an env pin wins for the session, then
// project-local settings, then project, then user. "auto"/"unset" is not a pin.
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

function readEffortLevel(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')).effortLevel;
    return typeof v === 'string' && EFFORT_LEVELS.includes(v.toLowerCase()) ? v.toLowerCase() : '';
  } catch {
    return ''; // absent, unreadable, or malformed — not worth surfacing
  }
}

function configuredEffort(cwd) {
  const pin = (process.env.CLAUDE_CODE_EFFORT_LEVEL || '').toLowerCase();
  if (pin && pin !== 'auto' && pin !== 'unset') {
    // A real pin IS the level in force; every settings file is overridden by it.
    return EFFORT_LEVELS.includes(pin) ? pin : '';
  }
  for (const file of [
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
  ]) {
    const level = readEffortLevel(file);
    if (level) return level;
  }
  return '';
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

  const dotnet = isDotNetProject(cwd);
  const line1 = buildUniversalLine(data, cwd);
  const line2 = dotnet ? buildDotnetLine(cwd) : '';
  // Discovery hint under the .NET line — the plugin's commands only matter in a
  // .NET project, so the tip only shows there.
  const line3 = dotnet ? tipLine() : '';

  const out = [line1, line2, line3].filter(Boolean).join('\n');
  if (out) process.stdout.write(out + '\n');
}

function buildUniversalLine(data, cwd) {
  const parts = [];

  const model = (data.model && (data.model.display_name || data.model.id)) || 'Claude';
  parts.push(c(ANSI.cyan, model));

  // Reasoning effort. TWO values, because they can legitimately disagree:
  //   active     = data.effort.level — what the turn ACTUALLY ran at, already
  //                downgraded if the model can't serve the requested level.
  //   configured = what the user asked for (env pin / settings effortLevel).
  // Showing only `active` made a neutralized setting look like a statusline bug
  // (e.g. a stale CLAUDE_CODE_EFFORT_LEVEL pin outranking effortLevel: xhigh,
  // which then renders as plain "high" with no hint why). On a mismatch we
  // render `active` + a dim "!=configured" so the cause is visible on the line.
  // Two spaces: the gear glyph renders double-width in most terminals and
  // visually swallows a single trailing space.
  const effort = data.effort && data.effort.level;
  if (typeof effort === 'string' && effort) {
    let seg = c(ANSI.dim, '⚙  ') + c(effortColor(effort), effort); // "⚙  "
    const wanted = configuredEffort(cwd);
    if (wanted && wanted !== effort) seg += c(ANSI.yellow, '≠' + wanted); // "!=<configured>"
    parts.push(seg);
  }

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

// ---- tip line (plugin discovery hints) -------------------------------------
// A short, rotating "how to use DotnetPilot" pointer shown under the .NET line.
const DNP_TIPS = [
  '/dotnet-pilot:utility:help — list every command',
  '/dotnet-pilot:dotnet:scaffold — feature (endpoint+handler+tests)',
  '/dotnet-pilot:dotnet:tdd — implement via failing tests first',
  '/dotnet-pilot:quality:review — .NET-aware code review',
  '/dotnet-pilot:dotnet:add-migration — safe EF Core migration',
  '/dotnet-pilot:project:verify — build + tests + DI + arch check',
  '/dotnet-pilot:quality:security-scan — OWASP + secrets + CVEs',
];

function tipLine() {
  // Rotate on a coarse ~30s bucket: the tip varies over a session without
  // flickering between the frequent statusline refreshes (refreshInterval is
  // seconds). Date.now() bucketing mirrors the staleness check in buildFailState.
  const idx = Math.floor(Date.now() / 30000) % DNP_TIPS.length;
  return c(ANSI.dim, 'TIP ') + c(ANSI.dim, DNP_TIPS[idx]);
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
    // Two spaces: ✚ renders double-width in most terminals and visually
    // abuts the branch name with only a single leading space (same glyph-swallow
    // that widened the gear/clock segments).
    if (dirty > 0) label += '  ' + c(ANSI.yellow, `✚${dirty}`); // "✚N"
  }

  // "<behind>\t<ahead>" relative to upstream; absent upstream => command fails.
  const lr = git(cwd, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (lr) {
    const [behind, ahead] = lr.split(/\s+/).map(x => parseInt(x, 10) || 0);
    let ua = '';
    if (ahead > 0) ua += `↑${ahead}`; // ↑
    if (behind > 0) ua += `↓${behind}`; // ↓
    if (ua) label += '  ' + c(ANSI.dim, ua); // double-width arrows — see ✚ above
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
