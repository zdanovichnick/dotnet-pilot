---
description: "Clean up code — remove dead code, normalize naming, eliminate duplication."
argument-hint: "[--scope path/to/project]"
---

# De-sloppify

`/DotnetPilot:quality:de-sloppify` performs systematic code cleanup without changing behavior.

> **Delegates to**: `dnp-refactor-cleaner` (sonnet); pre-flight check runs in the caller's context.

## Pre-flight

1. Verify tests pass: `dotnet test`
2. If tests fail: **stop** — do not clean broken code. Run `/DotnetPilot:dotnet:build-fix` first if the build is broken.

## Execution

Delegate to `dnp-refactor-cleaner` with:
- Scope: `--scope` argument if provided, otherwise full solution
- Instruction: run full refactoring protocol in order — dead code → naming normalization → duplication elimination → circular dependency resolution
- Constraint: run `dotnet test` after each atomic change; revert immediately if tests break

## Output

```
Cleanup Report — [solution name]

Removed (dead code): 3 items
  - OrderHelper.FormatCurrency (private, 0 references)
  - UserDto.LegacyField (private, 0 references)
  - CacheHelper.ParseKey (internal, 0 references)

Renamed (naming normalization): 2 items
  - OrderMgr → OrderManager (matches *Service/*Handler naming convention)
  - GetUsrById → GetUserByIdAsync (async suffix missing)

Extracted (duplication): 1 item
  - Repeated null-check + format logic → ValidateAndFormatAddress()

Architecture: 0 circular dependencies, 0 layer violations

Tests: 47/47 passing (unchanged)
Files modified: 5
```

## When to Use

- Before a major feature release to reduce review noise
- After a large merge with many contributors
- When `/DotnetPilot:dotnet:health-check` reports dead code or naming inconsistencies

## Related

- `/DotnetPilot:dotnet:health-check` — identify issues before cleaning
- `/DotnetPilot:quality:check-architecture` — architecture compliance check
- `/DotnetPilot:project:checkpoint` — verify the solution is clean after de-sloppify
