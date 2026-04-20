---
description: "Run tests with coverage reporting and failure diagnosis."
argument-hint: "[project-name] [--coverage] [--filter <pattern>]"
---

# Run Tests

`/DotnetPilot:dotnet:run-tests` executes tests with detailed reporting.

> **Delegates to**: `dnp-test-writer` (claude-sonnet-4-6) — only on test failures, to diagnose and suggest fixes.

## Execution

1. Detect test projects from `solution-map.json`
2. Run tests:
   ```bash
   dotnet test [<project>] --verbosity normal [--filter <pattern>]
   ```
3. If `--coverage` and `coverlet` is installed:
   ```bash
   dotnet test --collect:"XPlat Code Coverage"
   ```
4. Parse output:
   - Total tests, passed, failed, skipped
   - For failures: extract test name, error message, stack trace
5. If failures found:
   - Spawn `dnp-test-writer` to diagnose and suggest fixes
   - Present: "N tests failed. Would you like to auto-fix?"
6. Report summary with pass rate
