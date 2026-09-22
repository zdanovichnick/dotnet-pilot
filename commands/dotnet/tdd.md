---
description: "Implement a feature using TDD — writes failing tests first, then production code. --existing adds tests to code that already exists."
argument-hint: "<task-description> [--complexity easy|hard] [--existing <class|file|project>]"
effort: high
---

# TDD

`/dotnet-pilot:dotnet:tdd` implements a feature using strict RED-GREEN-REFACTOR discipline.

> **Delegates to**: `dnp-tdd-developer-easy` (sonnet, effort low) or `dnp-tdd-developer-hard` (sonnet, effort high) based on complexity.

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

## `--existing <target>`

Adds tests to production code that already exists — a class, a file, or a whole project — and
leaves production files untouched. The agent is briefed with the target, the detected test
conventions, and the constraint that production code is read-only. It writes characterization
tests for the current behavior (unit tests for services and domain types, `WebApplicationFactory`
tests for endpoints), runs them, and reports gaps it could not cover without a production change
instead of making that change. Complexity routes as usual.

## Execution

1. Parse the task description and flags. With no task description (or no `--existing` target),
   stop and ask for one before spawning anything.
2. Auto-detect complexity if not specified (see routing table above).
3. Detect solution conventions: test framework, mocking library, assertion style, architecture pattern.
4. Spawn the selected TDD agent with:
   - Task description (or the `--existing` target and the read-only constraint)
   - Solution structure (from `mcp__roslyn__get_solution_structure` or solution map)
   - Test project path and conventions
   - Architecture style (clean, vertical-slice, etc.)
5. The agent follows RED-GREEN-REFACTOR:
   - **RED**: Write a failing test that specifies the target behavior → `dotnet test` → confirm failure
   - **GREEN**: Write the minimum production code to pass → `dotnet test` → confirm pass
   - **REFACTOR**: Clean up without changing behavior → `dotnet test` → confirm still passing
6. On a `[HALT: <question>]` return, put the question to the user with `AskUserQuestion` — the
   agent has no prompt tool of its own — then re-spawn the same agent with the original brief plus
   the answer. Repeat until it returns a result or the user aborts.
7. Agent handles DI registration, project references, and build verification as part of the cycle.
8. Report: tests created, production files created/modified, build status, DI status.
