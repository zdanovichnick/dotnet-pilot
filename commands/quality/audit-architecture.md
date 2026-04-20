---
description: "Scan for clean architecture layer violations — forbidden project references, DI issues, package placement."
---

# Audit Architecture

`/DotnetPilot:quality:audit-architecture` validates architectural integrity.

> **Delegates to**: `dnp-architect` (claude-opus-4-6).

## Execution

1. Spawn `dnp-architect` to:
   - Parse project reference graph
   - Check for layer boundary violations
   - Verify DI registration completeness
   - Check NuGet package placement (EF Core in Infrastructure, not Domain)
   - Detect circular dependencies
2. Present violation report with fix recommendations
