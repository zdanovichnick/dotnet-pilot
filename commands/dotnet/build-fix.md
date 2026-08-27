---
description: "Diagnose and iteratively fix dotnet build errors. Max 5 repair iterations."
argument-hint: "[--project ProjectName]"
effort: medium
---

# Build Fix

`/dotnet-pilot:dotnet:build-fix` attempts to automatically repair build errors.

> **Delegates to**: `dnp-build-error-resolver` (sonnet, effort low); initial build check runs in the caller's context.

## Execution

1. Run `dotnet build` — capture full output
2. If build is clean: report success, nothing to do
3. If errors exist: delegate to `dnp-build-error-resolver` with:
   - Full build output (error lines verbatim — do not summarize)
   - Solution structure from `mcp__roslyn__get_solution_structure`
   - Instruction: max 5 iterations, halt and return structured finding if errors remain

## Output

```
Build Fix — [solution name]

Iterations used: N/5
Errors resolved: <list of error codes fixed>
Files modified: <list>

Build: CLEAN ✅
```

On halt (5 iterations without clean build):

```
Build Fix — HALTED

Iterations used: 5/5
Remaining errors: <count>
Unresolved: <error code> in <file:line>
Likely cause: <diagnosis>
Manual action required: <what the human needs to do>
Files modified: <list>
```

## When to Use

- After a large merge or rebase that broke the build
- After upgrading NuGet packages (type changes, removed APIs)
- After AI-generated code fails to compile
- After adding a new interface member that broke implementations

## Related

- `/dotnet-pilot:quality:check-architecture` — if build errors indicate architecture layer violations
- `/dotnet-pilot:dotnet:add-service` — if build error is caused by a missing DI registration
- `/dotnet-pilot:dotnet:health-check` — full solution health check including build
