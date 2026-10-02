#!/usr/bin/env node
// DotnetPilot Priority Router — PreToolUse hook (Agent)
//
// When Claude Code is opened in a .NET project (solution/project file in CWD)
// and the orchestrator is about to spawn a non-DotnetPilot agent, injects an
// advisory routing table so DotnetPilot agents take precedence.
//
// Advisory only (exit 0 always) — never blocks tool execution.

const fs = require('fs');
const path = require('path');
const { isDotNetProject } = require('./_lib/dotnet');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-priority-router';
// The routing text is shared with the prompt.compose mod (hooks/mods/routing.ts).
const ROUTING_FILE = path.join(__dirname, '_lib', 'routing.md');

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
    const cwd = (data && data.cwd) || process.cwd();

    if (!hookEnabled(cwd, 'dotnet_priority')) {
      process.exit(0);
    }

    if (!isDotNetProject(cwd)) {
      process.exit(0);
    }

    const toolInput = (data && data.tool_input) || {};
    const subagentType = toolInput.subagent_type || '';

    if (subagentType.startsWith('dotnet-pilot:')) {
      process.exit(0);
    }

    emit(fs.readFileSync(ROUTING_FILE, 'utf8').trim());
  } catch {
    // Advisory only — never fail
  }
  process.exit(0);
});
