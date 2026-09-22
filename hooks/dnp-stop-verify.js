#!/usr/bin/env node
// DotnetPilot Stop Verify — Stop hook, plus a PostToolUse (Write|Edit|MultiEdit)
// entry that stamps when a .NET source file was last written in this directory.
//
// On Stop, nudges the model to build and test before ending the turn when .NET
// source was edited here and no green `dotnet build`/`dotnet test` has been
// recorded since (state comes from hooks/_lib/build-state.js, written by
// dnp-build-verify). Silent when the git tree has no modified .NET source, so a
// committed or reverted edit does not nag.
//
// Advisory by default. `.planning/config.json` -> `hooks.stop_verify_block: true`
// turns the nudge into a block; `stop_hook_active` is honoured so a blocked stop
// is allowed through on the retry and never loops.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { hookEnabled, hookFlag } = require('./_lib/config');
const { isDotNetProject } = require('./_lib/dotnet');
const { readState } = require('./_lib/build-state');

const HOOK_NAME = 'dnp-stop-verify';
const SOURCE_EXT = /\.(cs|csproj|razor)$/i;
const MARKER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function markerPath(cwd) {
  const hash = crypto.createHash('sha1').update(cwd).digest('hex');
  return path.join(os.tmpdir(), `dnp-cs-edit-${hash}.json`);
}

function stampEdit(cwd, filePath) {
  try {
    fs.writeFileSync(markerPath(cwd), JSON.stringify({ at: new Date().toISOString(), file: filePath }));
  } catch { /* best-effort */ }
}

function readMarker(cwd) {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath(cwd), 'utf8'));
    const at = new Date(data.at).getTime();
    return Number.isFinite(at) ? { at, file: data.file } : null;
  } catch {
    return null;
  }
}

// The solution file to name in the suggested commands: bare name when it sits
// in cwd, absolute path when it lives in a parent. Empty when none is found.
function findSolution(cwd) {
  let dir = cwd;
  for (let i = 0; i <= 5; i++) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { break; }
    const sln = entries.find(e => e.endsWith('.slnx')) || entries.find(e => e.endsWith('.sln'));
    if (sln) return dir === cwd ? sln : path.join(dir, sln);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
}

// true = no modified/untracked .NET source; false = dirty; null = no git answer.
// Git pathspecs match `*` across directory separators, so `*.cs` covers the tree.
function sourceTreeClean(cwd) {
  const r = spawnSync('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all', '--', '*.cs', '*.csproj', '*.razor'],
    { cwd, encoding: 'utf8', timeout: 5000 });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim().length === 0;
}

function stopReason(cwd) {
  const marker = readMarker(cwd);
  if (!marker || Date.now() - marker.at > MARKER_MAX_AGE_MS) return null;
  if (sourceTreeClean(cwd) === true) return null;

  const state = readState(cwd);
  if (state && state.count > 0) {
    return `the last \`dotnet ${state.lastKind || 'build'}\` here failed (${state.count} consecutive)`;
  }
  if (!state || !state.lastSuccess) {
    return 'no green `dotnet build`/`dotnet test` has been recorded in this directory since .NET source was edited';
  }
  if (new Date(state.lastSuccess).getTime() < marker.at) {
    return `.NET source was edited after the last green \`dotnet ${state.lastKind || 'build'}\``;
  }
  return null;
}

function onStop(data, cwd) {
  if (data.stop_hook_active) return;
  if (!isDotNetProject(cwd)) return;

  const reason = stopReason(cwd);
  if (!reason) return;

  const sln = findSolution(cwd);
  const target = sln ? ` ${sln}` : '';
  const message = `[${HOOK_NAME}] VERIFY BEFORE STOPPING: ${reason}. Run:\n` +
    `  dotnet build${target} --nologo -v q\n` +
    `  dotnet test${target} --no-build --nologo\n` +
    'then report the result, or say explicitly that verification was skipped and why.';

  if (hookFlag(cwd, 'stop_verify_block')) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: message }));
  } else {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Stop', additionalContext: message }
    }));
  }
}

function onEdit(data, cwd) {
  const filePath = (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || '';
  if (!SOURCE_EXT.test(filePath)) return;
  if (/[\\/](bin|obj)[\\/]/.test(filePath)) return;
  stampEdit(cwd, filePath);
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
    if (!hookEnabled(cwd, 'stop_verify')) process.exit(0);

    const event = data.hook_event_name || (data.tool_input ? 'PostToolUse' : 'Stop');
    if (event === 'Stop') onStop(data, cwd);
    else if (data.tool_input) onEdit(data, cwd);
  } catch {
    // advisory: any failure is silence
  }
  process.exit(0);
});
