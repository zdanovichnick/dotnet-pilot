---
description: "Run a full quality gate check and summarize what's ready to commit."
effort: medium
---

# Checkpoint

`/DotnetPilot:project:checkpoint` verifies the current state is clean and summarizes what has changed.

> **Orchestration only** — all checks run in the caller's context using built-in tools and Roslyn MCP.

## Execution (in order — stop on FAIL)

### 1. Build

```bash
dotnet build --no-restore
```

- FAIL: report errors, stop. Run `/DotnetPilot:dotnet:build-fix` to repair.

### 2. Tests

```bash
dotnet test --no-build
```

- FAIL: report failures, stop. Investigate and fix before proceeding.

### 3. Format

```bash
dotnet format --verify-no-changes
```

- If changes needed: run `dotnet format` to fix, then report what was reformatted (auto-fix does not block).

### 4. Architecture (warn, don't block)

Run `mcp__roslyn__check_architecture_violations`.

- WARN if violations found — surface for awareness, do not stop checkpoint.

### 5. DI Completeness (warn, don't block)

Run `mcp__roslyn__check_di_completeness`.

- WARN if unregistered services found — surface with file locations.

### 6. Git Status Summary

```bash
git status --short
git diff --stat
```

Report: files changed, insertions, deletions.

## Output

```
Checkpoint — [timestamp]

✅ Build: clean (0 errors, 2 warnings)
✅ Tests: 47/47 passing
✅ Format: no changes needed
⚠️  Architecture: 1 warning — Application.Handlers references Infrastructure.Persistence (investigate)
✅ DI: all 12 services registered

Git status: 4 files changed, +89 −12

Ready to commit. Suggested message:
  feat(Orders): add CreateOrder endpoint with FluentValidation
```

## Commit Guidelines

- Use conventional commits: `feat|fix|refactor|test|docs|chore(scope): message`
- Scope = project name or feature name (e.g., `Orders`, `Auth`, `Infrastructure`)
- This command only checks — commit via your terminal after reviewing the output

## Related

- `/DotnetPilot:project:ship` — full ship readiness check with additional gates
- `/DotnetPilot:project:verify` — phase verification for planned workflows
- `/DotnetPilot:quality:de-sloppify` — clean up code before committing
