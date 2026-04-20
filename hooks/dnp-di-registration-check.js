#!/usr/bin/env node
// DotnetPilot DI Registration Check — PostToolUse hook (Write/Edit)
// When a .cs file is written that contains constructor injection,
// checks whether corresponding DI registration exists.
// Advisory only (exit 0 with additionalContext) — never blocks.

const fs = require('fs');
const path = require('path');
const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-di-check';
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

    // Protocol-shape sanity check — make drift visible
    if (!data || typeof data !== 'object' || !('tool_input' in data)) {
      emit(`[hook-version-mismatch] Expected tool_input in event payload (protocol v${EXPECTED_PROTOCOL_VERSION}). Hook author may need to update.`);
      process.exit(0);
    }

    const cwd = data.cwd || process.cwd();

    // Check if DI check is enabled (repo-local config first, then user-scoped)
    if (!hookEnabled(cwd, 'di_check')) process.exit(0);

    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    if (!filePath.endsWith('.cs')) process.exit(0);

    // Skip test files, migrations, and Program.cs
    const fileName = path.basename(filePath);
    if (fileName === 'Program.cs' ||
        filePath.includes('/Migrations/') || filePath.includes('\\Migrations\\') ||
        filePath.includes('/Tests/') || filePath.includes('\\Tests\\') ||
        filePath.includes('.Tests/') || filePath.includes('.Tests\\') ||
        fileName.endsWith('Tests.cs') || fileName.endsWith('Test.cs')) {
      process.exit(0);
    }

    // Read the file that was just written
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      process.exit(0);
    }

    // Hardened class-name detection: handles
    //   - class / record class / record struct / record
    //   - modifiers: public, internal, partial, abstract, sealed, static
    //   - generics: Foo<T>
    //   - primary constructors (C# 12+): Foo(IBar bar)
    //   - multi-line signatures with `where T : ...` constraints
    const classPattern = /(?:^|\s)(?:partial\s+|abstract\s+|sealed\s+|static\s+|public\s+|internal\s+|private\s+|protected\s+)*(?:class|record(?:\s+class|\s+struct)?)\s+(\w+)(?:<[^>]*>)?(?:\s*\([^)]*\))?\s*(?::|where\s|{|;|\n|\r)/m;
    const classMatch = content.match(classPattern);
    if (!classMatch) process.exit(0);

    const className = classMatch[1];

    // Look for constructor with injected parameters.
    // Two shapes: (a) primary constructor `ClassName(... params ...)`
    //             (b) classic constructor `public ClassName(... params ...)`
    const ctorPattern = new RegExp(`(?:public\\s+|internal\\s+|private\\s+|protected\\s+)?${className}\\s*\\(([^)]*)\\)`);
    const ctorMatch = content.match(ctorPattern);
    if (!ctorMatch) process.exit(0);

    // Extract injected type names (PascalCase types, strip generics and nullables)
    const params = ctorMatch[1];
    const paramPattern = /(?:^|,)\s*((?:[A-Z]\w*)(?:<[^>]+>)?)\s*\??\s+(\w+)/g;
    const types = new Set();
    for (const m of params.matchAll(paramPattern)) {
      types.add(m[1].replace(/<.*>$/, ''));
    }

    if (types.size === 0) process.exit(0);

    // Check if this class itself needs DI registration
    // Look for it in common registration patterns across the solution
    const registrationPatterns = [
      `(?:TryAdd|Add)(?:Keyed)?(?:Scoped|Transient|Singleton)<[^>]*${className}>`,
      `(?:TryAdd|Add)(?:Keyed)?(?:Scoped|Transient|Singleton)\\(typeof\\([^)]*${className}`,
      `AddHttpClient<[^>]*${className}>`,
      `AddDbContext<[^>]*${className}>`,
      `TryAddEnumerable[^;]*${className}`,
    ];

    // Quick scan: check Program.cs and extension files in the same solution
    const searchDirs = [cwd];
    let found = false;

    for (const dir of searchDirs) {
      try {
        const programCs = findFilesByName(dir, n => n === 'Program.cs', 6);
        const extensionFiles = findFilesByName(dir, n => n.includes('Extensions') && n.endsWith('.cs'), 6);
        const filesToCheck = [...programCs, ...extensionFiles];

        for (const f of filesToCheck) {
          try {
            const c = fs.readFileSync(f, 'utf8');
            for (const pattern of registrationPatterns) {
              if (new RegExp(pattern).test(c)) {
                found = true;
                break;
              }
            }
            if (found) break;
          } catch (e) { /* skip unreadable */ }
        }
        if (found) break;
      } catch (e) { /* skip */ }
    }

    if (!found) {
      const interfaceName = `I${className}`;
      emit(`DI ADVISORY: Class \`${className}\` has constructor injection but no DI registration was found. ` +
        `Remember to register it (e.g., \`services.AddScoped<${interfaceName}, ${className}>()\`) ` +
        `in Program.cs or a ServiceCollectionExtensions class. ` +
        `(Detection is regex-based; for semantic accuracy use \`mcp__roslyn__check_di_completeness\` via dnp-di-wiring-checker.)`);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});

function findFilesByName(dir, matcher, maxDepth, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'bin', 'obj'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && matcher(entry.name)) results.push(full);
      else if (entry.isDirectory()) results.push(...findFilesByName(full, matcher, maxDepth, depth + 1));
    }
  } catch {}
  return results;
}
