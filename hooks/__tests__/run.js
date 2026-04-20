#!/usr/bin/env node
// Hook fixture test harness for DotnetPilot.
//
// Usage: node hooks/__tests__/run.js
//
// Each test case in CASES below:
//   - Spawns the target hook
//   - Pipes a fixture JSON payload to stdin
//   - Asserts exit code == 0 (all DotnetPilot hooks are advisory, never block)
//   - Asserts stdout is either empty OR valid JSON matching the hook event shape
//   - Optionally asserts expected substrings appear in `additionalContext`
//   - Optionally asserts expected substrings do NOT appear (for should-be-silent fixtures)
//
// Exit codes:
//   0 — all tests pass
//   1 — one or more failures

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Build a temp workspace so hooks that read files from disk have something to find.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'dnp-hook-test-'));

function writeWorkspaceFile(relPath, content) {
  const full = path.join(workspace, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// Seed the workspace with a minimal .NET layout used by several fixtures.
const serviceFile = writeWorkspaceFile('src/Demo.Application/Services/FooService.cs',
  'namespace Demo.Application.Services;\n' +
  'public class FooService(IBarService bar) : IFooService { }\n'
);
const partialClassFile = writeWorkspaceFile('src/Demo.Application/Services/PartialService.cs',
  'namespace Demo.Application.Services;\n' +
  'public partial class PartialService\n' +
  '{\n' +
  '    public PartialService(IBarService bar) { }\n' +
  '}\n'
);
const recordClassFile = writeWorkspaceFile('src/Demo.Application/Services/RecordService.cs',
  'namespace Demo.Application.Services;\n' +
  'public record class RecordService(IBarService Bar);\n'
);
const migrationFile = writeWorkspaceFile('src/Demo.Infrastructure/Migrations/20260101000000_InitialCreate.cs',
  '// generated migration\npublic partial class InitialCreate {}\n'
);
// Extension file that does NOT register FooService — triggers advisory.
writeWorkspaceFile('src/Demo.Api/Extensions/ServiceCollectionExtensions.cs',
  'public static class ServiceCollectionExtensions { /* nothing registered */ }\n'
);

const CASES = [
  // --- dnp-di-registration-check ---
  {
    name: 'di-check: primary constructor triggers advisory',
    hook: 'dnp-di-registration-check.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: serviceFile } },
    expectExit: 0,
    expectSubstrings: ['[dnp-di-check]', 'DI ADVISORY', 'FooService'],
  },
  {
    name: 'di-check: partial class is detected',
    hook: 'dnp-di-registration-check.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: partialClassFile } },
    expectExit: 0,
    expectSubstrings: ['[dnp-di-check]', 'PartialService'],
  },
  {
    name: 'di-check: record class with primary constructor is detected',
    hook: 'dnp-di-registration-check.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: recordClassFile } },
    expectExit: 0,
    expectSubstrings: ['[dnp-di-check]', 'RecordService'],
  },
  {
    name: 'di-check: non-.cs file is skipped silently',
    hook: 'dnp-di-registration-check.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: '/tmp/foo.md' } },
    expectExit: 0,
    expectEmpty: true,
  },
  {
    name: 'di-check: empty payload triggers version-mismatch warning',
    hook: 'dnp-di-registration-check.js',
    runtime: 'node',
    input: {},
    expectExit: 0,
    expectSubstrings: ['hook-version-mismatch'],
  },

  // --- dnp-migration-guard ---
  {
    name: 'migration-guard: generated migration file triggers warning',
    hook: 'dnp-migration-guard.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: migrationFile } },
    expectExit: 0,
    expectSubstrings: ['[dnp-migration-guard]', 'MIGRATION WARNING', 'InitialCreate'],
  },
  {
    name: 'migration-guard: ordinary .cs file is ignored',
    hook: 'dnp-migration-guard.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: serviceFile } },
    expectExit: 0,
    expectEmpty: true,
  },

  // --- dnp-build-verify ---
  {
    name: 'build-verify: passing dotnet build is silent',
    hook: 'dnp-build-verify.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: { command: 'dotnet build --no-restore' },
      tool_result: { stdout: 'Build succeeded.', exit_code: 0 },
    },
    expectExit: 0,
    expectEmpty: true,
  },
  {
    name: 'build-verify: failed dotnet build is labeled',
    hook: 'dnp-build-verify.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: { command: 'dotnet build' },
      tool_result: {
        stdout: 'Program.cs(12,5): error CS0103: The name \'Foo\' does not exist in the current context\nBuild FAILED',
        exit_code: 1,
      },
    },
    expectExit: 0,
    expectSubstrings: ['[dnp-build-verify]', 'BUILD FAILURE', 'CS0103'],
  },
  {
    name: 'build-verify: non-dotnet command is ignored',
    hook: 'dnp-build-verify.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: { command: 'ls -la' },
      tool_result: { stdout: '', exit_code: 0 },
    },
    expectExit: 0,
    expectEmpty: true,
  },

  // --- dnp-project-scope-guard ---
  // No .planning/ in workspace → hook should exit silently.
  {
    name: 'scope-guard: no .planning directory = silent',
    hook: 'dnp-project-scope-guard.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { file_path: serviceFile } },
    expectExit: 0,
    expectEmpty: true,
  },

  // --- dnp-commit-format ---
  {
    name: 'commit-format: conventional message is silent',
    hook: 'dnp-commit-format.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: { command: 'git commit -m "feat(Api): add user endpoint"' },
    },
    expectExit: 0,
    expectEmpty: true,
  },
  {
    name: 'commit-format: non-conventional message emits labeled advisory',
    hook: 'dnp-commit-format.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: { command: 'git commit -m "added stuff"' },
    },
    expectExit: 0,
    expectSubstrings: ['[dnp-commit-format]', 'COMMIT FORMAT'],
  },
  {
    name: 'commit-format: heredoc message is skipped (no false positive)',
    hook: 'dnp-commit-format.js',
    runtime: 'node',
    input: {
      cwd: workspace,
      tool_input: {
        command: 'git commit -m "$(cat <<\'EOF\'\nfeat(Api): a thing\n\nBody.\nEOF\n)"',
      },
    },
    expectExit: 0,
    expectEmpty: true,
  },
  {
    name: 'commit-format: non-git command is ignored',
    hook: 'dnp-commit-format.js',
    runtime: 'node',
    input: { cwd: workspace, tool_input: { command: 'ls' } },
    expectExit: 0,
    expectEmpty: true,
  },
];

function runCase(testCase) {
  const hookPath = path.join(HOOKS_DIR, testCase.hook);
  const cmd = testCase.runtime === 'bash' ? 'bash' : 'node';
  const result = spawnSync(cmd, [hookPath], {
    input: JSON.stringify(testCase.input),
    encoding: 'utf8',
    timeout: 15000,
  });

  const problems = [];

  if (result.status !== testCase.expectExit) {
    problems.push(`exit ${result.status} (expected ${testCase.expectExit})`);
  }

  const stdout = (result.stdout || '').trim();

  if (testCase.expectEmpty) {
    if (stdout.length > 0) {
      problems.push(`expected empty stdout, got: ${stdout.slice(0, 200)}`);
    }
  } else if (testCase.expectSubstrings) {
    // Output should be valid JSON matching hook event shape
    let parsed = null;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      problems.push(`stdout is not JSON: ${stdout.slice(0, 200)}`);
    }
    if (parsed) {
      const ctx = parsed.hookSpecificOutput?.additionalContext || '';
      for (const sub of testCase.expectSubstrings) {
        if (!ctx.includes(sub)) {
          problems.push(`missing substring "${sub}" in additionalContext`);
        }
      }
    }
  }

  return { name: testCase.name, problems, stdout, stderr: result.stderr };
}

// --- main ---
let passed = 0;
let failed = 0;

for (const tc of CASES) {
  const r = runCase(tc);
  if (r.problems.length === 0) {
    passed++;
    console.log(`  PASS  ${r.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${r.name}`);
    for (const p of r.problems) console.log(`        - ${p}`);
    if (r.stderr && r.stderr.trim()) console.log(`        stderr: ${r.stderr.trim().slice(0, 300)}`);
  }
}

// Cleanup temp workspace
try { fs.rmSync(workspace, { recursive: true, force: true }); } catch {}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
