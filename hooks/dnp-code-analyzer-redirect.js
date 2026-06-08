#!/usr/bin/env node
// DotnetPilot Code-Analyzer Redirect — PreToolUse hook
//
// kouhesion's code-analyzer MCP supports Python / TS / JS only — it has no C#
// support and returns `unsupported_language` on `.cs`. When such a tool is
// invoked on a .NET solution (or directly against a C# target), this hook nudges
// toward the C#-aware roslyn MCP (dnp-roslyn).
//
// Advisory only (exit 0 always) — never blocks. Mixed .NET+Python repos keep
// full code-analyzer use on their Python/TS/JS files; the nudge only fires when
// the call looks .NET-targeted.

const { isDotNetProject } = require('./_lib/dotnet');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-code-analyzer-redirect';

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
  }));
}

// Does this code-analyzer call target C#? Either the call points at a `.cs`
// file, or its project_path / the session cwd is a .NET solution.
function targetsDotNet(toolInput, cwd) {
  const filePath = toolInput.file_path || '';
  if (typeof filePath === 'string' && filePath.toLowerCase().endsWith('.cs')) {
    return true;
  }
  const projectPath = toolInput.project_path;
  if (projectPath && isDotNetProject(projectPath)) {
    return true;
  }
  return isDotNetProject(cwd);
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

    if (!hookEnabled(cwd, 'code_analyzer_redirect')) {
      process.exit(0);
    }

    const toolInput = (data && data.tool_input) || {};

    if (targetsDotNet(toolInput, cwd)) {
      emit(
        `.NET target detected — mcp__*code-analyzer__ has no C# support ` +
        `(Python/TS/JS only). Use mcp__roslyn__* instead: get_solution_structure, ` +
        `check_di_completeness, check_architecture_violations, find_references, ` +
        `find_implementations, get_class_outline, get_ef_models.`
      );
    }
  } catch {
    // Advisory only — never fail
  }
  process.exit(0);
});
