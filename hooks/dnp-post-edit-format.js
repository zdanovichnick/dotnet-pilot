#!/usr/bin/env node
// DotnetPilot Post-Edit Format — PostToolUse hook (Write/Edit/MultiEdit)
// After a .cs file is written, runs `dotnet format` on the nearest project.
// Advisory only (exit 0 with additionalContext) — never blocks.

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-post-edit-format';
const STDIN_TIMEOUT_MS = 10_000;
const FORMAT_TIMEOUT_MS = 12_000;

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
  }));
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

function runDotnetFormat(projectPath, filePath) {
  return new Promise((resolve) => {
    const proc = spawn('dotnet', ['format', projectPath, '--include', filePath, '--no-restore'], {
      timeout: FORMAT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', err => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    process.exit(0);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolInput = event?.tool_input ?? {};
  const filePath = toolInput.file_path ?? toolInput.new_path ?? toolInput.path ?? '';
  const cwd = event?.cwd ?? process.cwd();

  if (!filePath) process.exit(0);
  if (!filePath.endsWith('.cs')) process.exit(0);

  const normalized = filePath.replace(/\\/g, '/');
  if (/\/(obj|bin|Migrations)\//.test(normalized) || filePath.endsWith('.g.cs')) process.exit(0);

  if (!hookEnabled(cwd, 'post_edit_format')) process.exit(0);

  const projectPath = findNearestCsproj(path.dirname(filePath));
  if (!projectPath) process.exit(0);

  const result = await runDotnetFormat(projectPath, filePath);

  if (result.code !== 0) {
    emit(`dotnet format failed (exit ${result.code}) — check formatting manually`);
  }
  // On success (code 0): emit nothing — dotnet format ran cleanly

  process.exit(0);
}

main().catch(() => process.exit(0));
