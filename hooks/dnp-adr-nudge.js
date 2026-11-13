#!/usr/bin/env node
// DotnetPilot ADR Nudge — Stop hook.
//
// When the repo keeps Architecture Decision Records (one of ADR_DIRS exists) and
// the uncommitted tree carries a decision-shaped change — a package added to or
// removed from a production project, a project reference added or removed, a
// project created or deleted, a new DbContext — while nothing under the ADR
// directory changed, asks the model to record or supersede an ADR, or to say why
// none is needed.
//
// The ADR directory doubles as the opt-in: repos without one never hear from this
// hook. Version-only package bumps are not decisions and are ignored. A given set
// of signals is raised once; the nudge repeats only when the set changes.
// Advisory: never blocks, honours `stop_hook_active`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { hookEnabled } = require('./_lib/config');
const { isDotNetProject } = require('./_lib/dotnet');

const HOOK_NAME = 'dnp-adr-nudge';
const ADR_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'docs/architecture/decisions', 'doc/adr', 'adr'];
const BUILD_FILES = ['*.csproj', 'Directory.Packages.props', 'Directory.Build.props'];
const TEST_PROJECT = /(^|\/)tests?\/|\.(Unit|Integration|Functional|Architecture)?Tests?\.csproj$/i;
const GENERATED = /(^|\/)(bin|obj|Migrations)\//i;
const DBCONTEXT_CLASS = /\bclass\s+(\w+)[^:{;]*:\s*(?:[\w.]+\.)?\w*DbContext\b/;
const MAX_LISTED = 8;
const MAX_UNTRACKED_CS = 200;

function git(cwd, args) {
  const r = spawnSync('git', ['--no-optional-locks', ...args],
    { cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

function findAdrDir(root) {
  return ADR_DIRS.find(d => {
    try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; }
  }) || null;
}

function nextAdrNumber(root, adrDir) {
  let max = 0;
  try {
    for (const name of fs.readdirSync(path.join(root, adrDir))) {
      const m = /^(?:adr[-_]?)?(\d+)/i.exec(name);
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch { /* unreadable dir: start at 1 */ }
  return String(max + 1).padStart(4, '0');
}

function projectName(file) {
  return path.basename(file).replace(/\.csproj$/i, '');
}

// Splits a unified diff into per-file added/removed line lists.
function parseDiff(text) {
  const files = new Map();
  let current = null;
  for (const line of (text || '').split('\n')) {
    const header = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (line.startsWith('--- ')) continue;
    if (header) {
      current = header[1] === '/dev/null' ? null : header[1].trim();
      if (current && !files.has(current)) files.set(current, { added: [], removed: [] });
      continue;
    }
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = m ? m[2].trim() : null;
      if (current && !files.has(current)) files.set(current, { added: [], removed: [] });
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+')) files.get(current).added.push(line.slice(1));
    else if (line.startsWith('-')) files.get(current).removed.push(line.slice(1));
  }
  return files;
}

function includes(lines, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*\\bInclude\\s*=\\s*"([^"]+)"`, 'i');
  const out = new Set();
  for (const l of lines) {
    const m = re.exec(l);
    if (m) out.add(m[1].trim());
  }
  return out;
}

function referenceName(include) {
  return path.basename(include.replace(/\\/g, '/')).replace(/\.csproj$/i, '');
}

function buildFileSignals(diffs, newProjects) {
  const signals = [];
  for (const [file, { added, removed }] of diffs) {
    if (TEST_PROJECT.test(file) || GENERATED.test(file)) continue;
    const owner = /\.csproj$/i.test(file) ? projectName(file) : path.basename(file);
    if (newProjects.has(file)) continue;

    for (const tag of ['PackageReference', 'PackageVersion']) {
      const plus = includes(added, tag);
      const minus = includes(removed, tag);
      for (const p of plus) if (!minus.has(p)) signals.push(`package ${p} added to ${owner}`);
      for (const p of minus) if (!plus.has(p)) signals.push(`package ${p} removed from ${owner}`);
    }

    const refPlus = new Set([...includes(added, 'ProjectReference')].map(referenceName));
    const refMinus = new Set([...includes(removed, 'ProjectReference')].map(referenceName));
    for (const r of refPlus) if (!refMinus.has(r)) signals.push(`${owner} now references ${r}`);
    for (const r of refMinus) if (!refPlus.has(r)) signals.push(`${owner} no longer references ${r}`);
  }
  return signals;
}

function dbContextSignals(csDiffs, root, untrackedCs) {
  const found = new Set();
  for (const [file, { added, removed }] of csDiffs) {
    if (GENERATED.test(file)) continue;
    const before = new Set(removed.map(l => (DBCONTEXT_CLASS.exec(l) || [])[1]).filter(Boolean));
    for (const l of added) {
      const m = DBCONTEXT_CLASS.exec(l);
      if (m && !before.has(m[1])) found.add(m[1]);
    }
  }
  for (const file of untrackedCs.slice(0, MAX_UNTRACKED_CS)) {
    if (GENERATED.test(file)) continue;
    let text = '';
    try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
    for (const l of text.split('\n')) {
      const m = DBCONTEXT_CLASS.exec(l);
      if (m) found.add(m[1]);
    }
  }
  return [...found].map(name => `new DbContext ${name}`);
}

function collectSignals(root) {
  const hasHead = git(root, ['rev-parse', '--verify', '-q', 'HEAD']) !== null;
  const lsUntracked = patterns => (git(root, ['ls-files', '--others', '--exclude-standard', '--', ...patterns]) || '')
    .split('\n').map(s => s.trim()).filter(Boolean);

  const untrackedProjects = lsUntracked(['*.csproj']).filter(f => !GENERATED.test(f));
  const newProjects = new Set(untrackedProjects);
  const deletedProjects = [];
  let buildDiffs = new Map();
  let csDiffs = new Map();

  if (hasHead) {
    for (const line of (git(root, ['diff', 'HEAD', '--name-status', '--no-renames', '--', '*.csproj']) || '').split('\n')) {
      const m = /^([AD])\t(.+)$/.exec(line.trim());
      if (!m || GENERATED.test(m[2])) continue;
      if (m[1] === 'A') newProjects.add(m[2]);
      else deletedProjects.push(m[2]);
    }
    buildDiffs = parseDiff(git(root, ['diff', 'HEAD', '-U0', '--no-color', '--no-ext-diff', '--', ...BUILD_FILES]));
    csDiffs = parseDiff(git(root, ['diff', 'HEAD', '-U0', '--no-color', '--no-ext-diff', '--', '*.cs']));
  }

  const signals = [
    ...[...newProjects].filter(f => !TEST_PROJECT.test(f)).map(f => `new project ${projectName(f)}`),
    ...deletedProjects.filter(f => !TEST_PROJECT.test(f)).map(f => `project ${projectName(f)} deleted`),
    ...buildFileSignals(buildDiffs, newProjects),
    ...dbContextSignals(csDiffs, root, lsUntracked(['*.cs'])),
  ];
  return [...new Set(signals)].sort();
}

function adrTouched(root, adrDir) {
  const out = git(root, ['status', '--porcelain', '--untracked-files=all', '--', adrDir]);
  return out === null || out.trim().length > 0;
}

function advisedPath(root) {
  const hash = crypto.createHash('sha1').update(root).digest('hex');
  return path.join(os.tmpdir(), `dnp-adr-advised-${hash}.json`);
}

function alreadyAdvised(root, fingerprint) {
  try {
    return JSON.parse(fs.readFileSync(advisedPath(root), 'utf8')).fingerprint === fingerprint;
  } catch {
    return false;
  }
}

function recordAdvised(root, fingerprint) {
  try {
    fs.writeFileSync(advisedPath(root), JSON.stringify({ at: new Date().toISOString(), fingerprint }));
  } catch { /* best-effort */ }
}

function onStop(data, cwd) {
  if (data.stop_hook_active) return;
  if (!isDotNetProject(cwd)) return;

  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return;
  const root = path.resolve(top.trim());

  const adrDir = findAdrDir(root);
  if (!adrDir || adrTouched(root, adrDir)) return;

  const signals = collectSignals(root);
  if (signals.length === 0) return;

  const fingerprint = crypto.createHash('sha1').update(signals.join('\n')).digest('hex');
  if (alreadyAdvised(root, fingerprint)) return;
  recordAdvised(root, fingerprint);

  const listed = signals.slice(0, MAX_LISTED).map(s => `  - ${s}`).join('\n');
  const more = signals.length > MAX_LISTED ? `\n  - …and ${signals.length - MAX_LISTED} more` : '';
  const message = `[${HOOK_NAME}] ARCHITECTURE DECISION? These uncommitted changes look like decisions, ` +
    `and nothing under ${adrDir}/ changed:\n${listed}${more}\n` +
    `If one records a decision, add ${adrDir}/${nextAdrNumber(root, adrDir)}-<title>.md following the existing ` +
    'ADRs\' naming and sections, or mark the ADR it reverses as superseded. If none does, say so in one line.';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: message }
  }));
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    if (!data || typeof data !== 'object') process.exit(0);

    const cwd = data.cwd || process.cwd();
    if (!hookEnabled(cwd, 'adr_nudge')) process.exit(0);
    if ((data.hook_event_name || 'Stop') === 'Stop') onStop(data, cwd);
  } catch {
    // advisory: any failure is silence
  }
  process.exit(0);
});
