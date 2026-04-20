#!/usr/bin/env node
// DotnetPilot Commit Format — PreToolUse hook (Bash)
// Enforces conventional commit format for git commit commands.
// Advisory only (exit 0 with additionalContext) — never blocks.
//
// Rewritten from the original bash version for robust JSON parsing (the
// shell fallback couldn't handle escaped quotes when jq wasn't installed)
// and to match the labeled-advisory convention used by the other hooks.

const fs = require('fs');
const path = require('path');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-commit-format';
const EXPECTED_PROTOCOL_VERSION = 1;

const VALID_TYPES = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\([a-zA-Z0-9._/-]+\))?:\s*.+/;

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

    if (!hookEnabled(cwd, 'commit_format')) process.exit(0);

    const command = data.tool_input?.command || '';

    // Only process `git commit` invocations
    if (!/\bgit\s+commit\b/.test(command)) process.exit(0);

    // Skip --amend --no-edit (reuses prior message)
    if (/(?:^|\s)--no-edit(?:\s|$)/.test(command)) process.exit(0);

    // Skip message-from-file variants
    if (/(?:^|\s)(?:-F|--file)(?:\s|$)/.test(command)) process.exit(0);

    // Skip heredoc-delivered messages — the outer -m captures the literal
    // `"$(cat <<'EOF' ... EOF)"` expression, not the rendered string, so
    // we can't validate it by regex. This is how Claude Code delivers
    // multi-line messages per its default commit workflow.
    if (/<<[-~]?['"]?[A-Za-z_]/.test(command)) process.exit(0);

    // Extract -m / --message argument (either "..." or '...')
    let msg = null;
    const dq = command.match(/(?:-m|--message)\s+"([^"]+)"/);
    const sq = command.match(/(?:-m|--message)\s+'([^']+)'/);
    if (dq) msg = dq[1];
    else if (sq) msg = sq[1];

    if (!msg) process.exit(0);

    // Validate against conventional-commit format (first line only)
    const firstLine = msg.split('\n')[0];
    if (VALID_TYPES.test(firstLine)) process.exit(0);

    emit('COMMIT FORMAT: Message does not follow conventional commit format. ' +
      'Expected: type(Scope): description. ' +
      'Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore. ' +
      'Example: feat(Api): add user authentication endpoint');
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
