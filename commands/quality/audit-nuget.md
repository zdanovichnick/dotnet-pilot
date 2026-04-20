---
description: "NuGet vulnerability scan, version consistency check, and upgrade recommendations."
---

# Audit NuGet

`/DotnetPilot:quality:audit-nuget` scans NuGet packages across the solution.

> **Delegates to**: `dnp-nuget-auditor` (claude-haiku-4-5-20251001).

## Execution

1. Spawn `dnp-nuget-auditor` to:
   - Run vulnerability scan (`dotnet list package --vulnerable`)
   - Check for outdated packages (`dotnet list package --outdated`)
   - Detect version inconsistencies across projects
   - Recommend Central Package Management if applicable
2. Present report with actionable recommendations
