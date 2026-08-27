---
description: "Package vulnerability scan, version consistency check, and upgrade recommendations."
effort: medium
---

# Check Packages

`/dotnet-pilot:quality:check-packages` scans NuGet packages across the solution.

> **Delegates to**: `dnp-nuget-auditor` (sonnet, effort low).

## Execution

1. Spawn `dnp-nuget-auditor` to:
   - Run vulnerability scan (`dotnet list package --vulnerable`)
   - Check for outdated packages (`dotnet list package --outdated`)
   - Detect version inconsistencies across projects
   - Recommend Central Package Management if applicable
2. Present report with actionable recommendations
