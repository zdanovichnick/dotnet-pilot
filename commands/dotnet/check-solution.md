---
description: "Validate full solution health — build, tests, NuGet, project references, DI completeness."
argument-hint: "[--fix to auto-fix simple issues]"
---

# Check Solution

`/DotnetPilot:dotnet:check-solution` runs a comprehensive health check on the .NET solution.

> **Delegates to**: `dnp-nuget-auditor` (Haiku 4.5) and `dnp-di-wiring-checker` (Haiku 4.5); orchestration runs in the caller's context.

## Execution

1. **Build check:** `dotnet build`
2. **Test check:** `dotnet test`
3. Spawn `dnp-nuget-auditor` for NuGet health
4. Spawn `dnp-di-wiring-checker` for DI completeness
5. Check project references for:
   - Circular references
   - Missing references (compile errors hint at these)
   - Architecture layer violations
6. Check for common issues:
   - Multiple `Program.cs` with conflicting configurations
   - Missing `appsettings.json` sections referenced in code
   - Duplicate service registrations

Report as a health card:
```
Solution Health: MyApp.slnx
  Build:        PASS (0 errors, 3 warnings)
  Tests:        PASS (47 passed, 0 failed)
  NuGet:        WARN (1 outdated, 0 vulnerable)
  DI Wiring:    PASS (12 services, 0 missing)
  Architecture: PASS (no layer violations)
  References:   PASS (no circular refs)
```

If `--fix`: auto-fix simple issues (add missing using statements, update outdated packages).
