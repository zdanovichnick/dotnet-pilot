#!/usr/bin/env node
// DotnetPilot Priority Router — PreToolUse hook (Agent)
//
// When Claude Code is opened in a .NET project (solution/project file in CWD)
// and the orchestrator is about to spawn a non-DotnetPilot agent, injects an
// advisory routing table so DotnetPilot agents take precedence.
//
// Advisory only (exit 0 always) — never blocks tool execution.

const fs = require('fs');

const HOOK_NAME = 'dnp-priority-router';

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
  }));
}

function isDotNetProject(dir) {
  try {
    const entries = fs.readdirSync(dir);
    return entries.some(e =>
      e.endsWith('.sln') || e.endsWith('.slnx') || e.endsWith('.csproj')
    );
  } catch {
    return false;
  }
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

    if (!isDotNetProject(cwd)) {
      process.exit(0);
    }

    const toolInput = (data && data.tool_input) || {};
    const subagentType = toolInput.subagent_type || '';

    if (subagentType.startsWith('dotnet-pilot:')) {
      process.exit(0);
    }

    emit(
      `.NET project detected — DotnetPilot has routing priority.\n` +
      `Prefer these DotnetPilot agents over generic equivalents:\n` +
      `  TDD (routine):    dotnet-pilot:dnp-tdd-developer-easy\n` +
      `  TDD (complex):    dotnet-pilot:dnp-tdd-developer-hard\n` +
      `  Test writing:     dotnet-pilot:dnp-test-writer\n` +
      `  Architecture:     dotnet-pilot:dnp-architect\n` +
      `  API scaffolding:  dotnet-pilot:dnp-api-scaffolder\n` +
      `  DI verification:  dotnet-pilot:dnp-di-wiring-checker\n` +
      `  EF migrations:    dotnet-pilot:dnp-ef-migration-planner\n` +
      `  NuGet audit:      dotnet-pilot:dnp-nuget-auditor\n` +
      `  .NET planning:    dotnet-pilot:dnp-planner\n` +
      `  Verification:     dotnet-pilot:dnp-verifier\n` +
      `Also prefer /DotnetPilot:* slash commands for .NET-specific tasks.`
    );
  } catch {
    // Advisory only — never fail
  }
  process.exit(0);
});
