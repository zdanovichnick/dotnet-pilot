#!/usr/bin/env node
// DotnetPilot Priority Router — PreToolUse hook (Agent)
//
// When Claude Code is opened in a .NET project (solution/project file in CWD)
// and the orchestrator is about to spawn a non-DotnetPilot agent, injects an
// advisory routing table so DotnetPilot agents take precedence.
//
// Advisory only (exit 0 always) — never blocks tool execution.

const { isDotNetProject } = require('./_lib/dotnet');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-priority-router';

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

    emit(
      `.NET solution detected. For .NET work prefer the dotnet-pilot:dnp-* agents over generic ` +
      `equivalents — /dotnet-pilot:utility:help lists the full roster.\n` +
      `Inspect C# with mcp__roslyn__* (semantic); mcp__*code-analyzer__* has no C# support.`
    );
  } catch {
    // Advisory only — never fail
  }
  process.exit(0);
});
