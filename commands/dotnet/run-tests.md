---
description: "Run tests with coverage reporting and failure diagnosis."
argument-hint: "[project-name] [--coverage] [--filter <pattern>]"
effort: medium
---

# Run Tests

`/dotnet-pilot:dotnet:run-tests` executes tests with detailed reporting.

> Runs in the caller's context; spawns no agent. Fixes that need production code go through `/dotnet-pilot:dotnet:tdd`.

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
   - Read each failing test and the code under test; name the likely cause per failure
   - When the fix is a production change, offer `/dotnet-pilot:dotnet:tdd <behavior>` rather than
     editing here; when the test itself is stale, say so and cite the assertion
6. Report summary with pass rate
