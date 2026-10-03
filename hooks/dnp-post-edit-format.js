#!/usr/bin/env node
// DotnetPilot Post-Edit Format — PostToolUse (Write/Edit/MultiEdit) and Stop hook.
//
// PostToolUse only queues a saved .cs file; the Stop leg then runs `dotnet format`
// once per project over everything queued this turn. Formatting inside the turn
// would pay an MSBuild project load per edit and rewrite the file under the model,
// leaving its next Edit with a stale old_string.
// Advisory only (exit 0) — never blocks.

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-post-edit-format';
const STDIN_TIMEOUT_MS = 10_000;
// Must stay below the Stop hook's `timeout` in hooks.json (30s) so the advisory
// still gets written when `dotnet format` is slow.
const FORMAT_BUDGET_MS = 25_000;
const QUEUE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function queuePath(cwd) {
  const hash = crypto.createHash('sha1').update(cwd).digest('hex');
  return path.join(os.tmpdir(), `dnp-format-queue-${hash}.json`);
}

function readQueue(cwd) {
  try {
    const data = JSON.parse(fs.readFileSync(queuePath(cwd), 'utf8'));
    if (!data || !Array.isArray(data.files)) return [];
    const at = new Date(data.at).getTime();
    return Number.isFinite(at) && Date.now() - at < QUEUE_MAX_AGE_MS ? data.files : [];
  } catch {
    return [];
  }
}

function writeQueue(cwd, files) {
  try {
    fs.writeFileSync(queuePath(cwd), JSON.stringify({ at: new Date().toISOString(), files }));
  } catch { /* best-effort */ }
}

function clearQueue(cwd) {
  try { fs.unlinkSync(queuePath(cwd)); } catch { /* already gone */ }
}

function emit(message) {
  process.stdout.write(JSON.stringify({ systemMessage: `[${HOOK_NAME}] ${message}` }));
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => reject(new Error('stdin timeout')), STDIN_TIMEOUT_MS);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => { clearTimeout(timer); resolve(chunks.join('')); });
    process.stdin.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

function findNearestCsproj(startDir) {
  let dir = startDir;
  const root = path.parse(dir).root;
  while (dir !== root) {
    let entries;
    try {
      entries = fs.readdirSync(dir).filter(f => f.endsWith('.csproj'));
    } catch {
      return null;
    }
    if (entries.length > 0) return path.join(dir, entries[0]);
    dir = path.dirname(dir);
  }
  return null;
}

function runDotnetFormat(projectPath, files, timeoutMs) {
  return new Promise((resolve) => {
    const proc = spawn('dotnet', ['format', projectPath, '--include', ...files, '--no-restore'], {
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.on('close', code => resolve({ code }));
    proc.on('error', err => resolve({ code: -1, error: err.message }));
  });
}

function onEdit(event, cwd) {
  const toolInput = event.tool_input ?? {};
  const filePath = toolInput.file_path ?? toolInput.new_path ?? toolInput.path ?? '';
  if (!filePath.endsWith('.cs')) return;

  const normalized = filePath.replace(/\\/g, '/');
  if (/\/(obj|bin|Migrations)\//.test(normalized) || filePath.endsWith('.g.cs')) return;

  // Resolved now: a relative path would walk up to '.' forever at Stop time
  // (path.dirname('.') === '.').
  const absFile = path.resolve(cwd, filePath);
  const queued = readQueue(cwd);
  if (!queued.includes(absFile)) writeQueue(cwd, [...queued, absFile]);
}

async function onStop(cwd) {
  const queued = readQueue(cwd);
  clearQueue(cwd);

  const byProject = new Map();
  for (const file of queued) {
    if (!fs.existsSync(file)) continue;
    const project = findNearestCsproj(path.dirname(file));
    if (!project) continue;
    byProject.set(project, [...(byProject.get(project) ?? []), file]);
  }

  const deadline = Date.now() + FORMAT_BUDGET_MS;
  const failed = [];
  for (const [project, files] of byProject) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { failed.push(`${path.basename(project)} (out of time)`); continue; }
    const result = await runDotnetFormat(project, files, remaining);
    if (result.code !== 0) failed.push(`${path.basename(project)} (exit ${result.code})`);
  }

  if (failed.length > 0) emit(`dotnet format failed for ${failed.join(', ')} — check formatting manually`);
}

async function main() {
  let event;
  try {
    event = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }

  const cwd = event?.cwd ?? process.cwd();
  if (!hookEnabled(cwd, 'post_edit_format')) process.exit(0);

  const name = event?.hook_event_name ?? (event?.tool_input ? 'PostToolUse' : 'Stop');
  if (name === 'Stop') await onStop(cwd);
  else onEdit(event, cwd);

  process.exit(0);
}

main().catch(() => process.exit(0));
