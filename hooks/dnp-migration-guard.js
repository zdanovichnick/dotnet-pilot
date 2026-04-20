#!/usr/bin/env node
// DotnetPilot Migration Guard — PreToolUse hook (Write/Edit)
// Warns when manually editing EF Core migration files.
// Advisory only (exit 0 with additionalContext) — never blocks.

const path = require('path');
const fs = require('fs');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-migration-guard';
const EXPECTED_PROTOCOL_VERSION = 1;

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
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

    if (!data || typeof data !== 'object' || !('tool_input' in data)) {
      emit(`[hook-version-mismatch] Expected tool_input in event payload (protocol v${EXPECTED_PROTOCOL_VERSION}).`);
      process.exit(0);
    }

    const cwd = data.cwd || process.cwd();

    if (!hookEnabled(cwd, 'migration_guard')) process.exit(0);

    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    // Check if the file is inside a Migrations directory
    const normalizedPath = filePath.replace(/\\/g, '/');
    const isInMigrationsDir = /[/\\]Migrations[/\\]/.test(normalizedPath);
    const looksGenerated =
      /[/\\]Migrations[/\\]\d{14}_.+\.cs$/.test(normalizedPath) ||
      /[/\\]Migrations[/\\].+\.Designer\.cs$/.test(normalizedPath) ||
      /ModelSnapshot\.cs$/.test(normalizedPath);
    const isMigration = isInMigrationsDir && (looksGenerated || normalizedPath.endsWith('.cs'));

    if (!isMigration) process.exit(0);

    const fileName = path.basename(filePath);
    emit(`MIGRATION WARNING: You are about to manually edit migration file \`${fileName}\`. ` +
      'Manual edits to EF Core migration files can break the migration chain. ' +
      'Consider using `dotnet ef migrations add <Name>` to generate a new migration instead. ' +
      'If you must edit manually, ensure the ModelSnapshot stays in sync.');
  } catch (e) {
    process.exit(0);
  }
});
