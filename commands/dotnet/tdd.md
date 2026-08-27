---
description: "Implement a feature using TDD — writes failing tests first, then production code."
argument-hint: "<task-description> [--complexity easy|hard]"
effort: high
---

# TDD

`/dotnet-pilot:dotnet:tdd` implements a feature using strict RED-GREEN-REFACTOR discipline.

> **Delegates to**: `dnp-tdd-developer-easy` (sonnet, effort low) or `dnp-tdd-developer-hard` (sonnet, effort high) based on complexity.

## Difference from `dotnet:write-tests`

`dotnet:write-tests` adds tests to *existing* production code — it never touches production files.
`dotnet:tdd` builds a feature from scratch: writes a failing test, implements the minimum production code to pass it, then refactors. Both tests and production code are created.

## Complexity routing

| Complexity | Agent | When to use |
|------------|-------|-------------|
| **easy** | `dnp-tdd-developer-easy` | Clear requirements, ≤2 files, follows existing patterns |
| **hard** | `dnp-tdd-developer-hard` | Ambiguous requirements, architectural decisions, cross-layer changes, >2 files |

If `--complexity` is omitted, auto-detect:
- Count files likely to change (entities, services, controllers, configs)
- Check if new interfaces or cross-project references are needed
- Check if EF Core migrations are involved
- ≤2 files and no architectural decisions → **easy**; otherwise → **hard**

## Execution

1. Parse the task description and optional `--complexity` flag. If no task description was provided, use `AskUserQuestion` to gather it — never ask via plain text.
2. Auto-detect complexity if not specified (see routing table above).
3. Detect solution conventions: test framework, mocking library, assertion style, architecture pattern.
4. Spawn the selected TDD agent with:
   - Task description
   - Solution structure (from `mcp__roslyn__get_solution_structure` or solution map)
   - Test project path and conventions
   - Architecture style (clean, vertical-slice, etc.)
5. The agent follows RED-GREEN-REFACTOR:
   - **RED**: Write a failing test that specifies the target behavior → `dotnet test` → confirm failure
   - **GREEN**: Write the minimum production code to pass → `dotnet test` → confirm pass
   - **REFACTOR**: Clean up without changing behavior → `dotnet test` → confirm still passing
6. Agent handles DI registration, project references, and build verification as part of the cycle.
7. Report: tests created, production files created/modified, build status, DI status.
