#!/usr/bin/env node
// DotnetPilot Build Verify — PostToolUse hook (Bash)
// After dotnet build/test commands, parses output for errors
// and injects structured summaries as additionalContext.
// Tracks consecutive failures for escalation.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-build-verify';
const EXPECTED_PROTOCOL_VERSION = 1;

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
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

    if (!hookEnabled(cwd, 'build_verify')) process.exit(0);

    const toolInput = data.tool_input || {};
    const command = toolInput.command || '';

    // Only process dotnet build/test commands
    const isDotnetBuild = /dotnet\s+(build|test|run)/.test(command);
    if (!isDotnetBuild) process.exit(0);

    const toolResult = data.tool_result || {};
    const output = toolResult.stdout || toolResult.output || '';
    const exitCode = toolResult.exit_code ?? toolResult.exitCode ?? 0;

    if (exitCode === 0) {
      // Reset failure counter on success
      resetFailureCount(cwd);
      process.exit(0);
    }

    // Build/test failed — parse errors
    const errors = [];
    const errorLines = output.split('\n').filter(line =>
      /\s*:\s*error\s+[A-Z]{2,4}\d+/.test(line) ||
      /Build FAILED/.test(line) ||
      /Failed!\s+- Failed:/.test(line)
    );

    for (const line of errorLines.slice(0, 10)) {
      errors.push(line.trim());
    }

    // Track consecutive failures
    const failCount = incrementFailureCount(cwd);

    let message = `BUILD FAILURE: \`${command.split(' ').slice(0, 3).join(' ')}\` failed (exit ${exitCode}).`;

    if (errors.length > 0) {
      message += '\n\nTop errors:\n' + errors.map(e => `  - ${e}`).join('\n');
    }

    if (failCount >= 3) {
      message += `\n\nWARNING: ${failCount} consecutive build failures. Consider stopping to diagnose the root cause.`;
    }

    if (failCount >= 5) {
      message += '\n\nESCALATION: 5+ consecutive failures. Strongly recommend pausing execution and informing the user.';
    }

    emit(message);
  } catch (e) {
    process.exit(0);
  }
});

function getFailCountPath(cwd) {
  const hash = Buffer.from(cwd).toString('base64').replace(/[/+=]/g, '_').slice(0, 32);
  return path.join(os.tmpdir(), `dnp-build-fail-${hash}.json`);
}

function incrementFailureCount(cwd) {
  const filePath = getFailCountPath(cwd);
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const lastFail = new Date(data.lastFail).getTime();
    // Reset if stale (>1 hour old)
    if (Date.now() - lastFail < 60 * 60 * 1000) {
      count = data.count || 0;
    }
  } catch (e) { /* fresh */ }
  count++;
  fs.writeFileSync(filePath, JSON.stringify({ count, lastFail: new Date().toISOString() }));
  return count;
}

function resetFailureCount(cwd) {
  const filePath = getFailCountPath(cwd);
  try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}
