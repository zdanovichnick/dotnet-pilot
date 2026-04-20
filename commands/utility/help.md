---
description: "List all DotnetPilot commands grouped by category."
---

# DotnetPilot Help

`/DotnetPilot:utility:help` displays all available commands.

## Output

```
DotnetPilot v0.1.0 — Spec-driven .NET development orchestrator

PIPELINE
  /DotnetPilot:pipeline:init          Initialize for a .NET solution
  /DotnetPilot:pipeline:discuss       Requirements gathering
  /DotnetPilot:pipeline:research      NuGet/pattern research
  /DotnetPilot:pipeline:plan          Create execution plans for a phase
  /DotnetPilot:pipeline:execute       Execute plans with parallel waves
  /DotnetPilot:pipeline:verify        Verify phase goal achievement
  /DotnetPilot:pipeline:ship          Create PR from completed work
  /DotnetPilot:pipeline:next          Auto-advance to next step

DOTNET
  /DotnetPilot:dotnet:add-migration     Generate EF Core migration safely
  /DotnetPilot:dotnet:scaffold-api      Scaffold controller + DTOs + DI
  /DotnetPilot:dotnet:add-service       Create service + interface + DI + tests
  /DotnetPilot:dotnet:add-project       Add project to solution
  /DotnetPilot:dotnet:run-tests         Run tests with coverage
  /DotnetPilot:dotnet:add-endpoint      Add endpoint to controller
  /DotnetPilot:dotnet:scaffold-entity   Create entity + config + repo + migration
  /DotnetPilot:dotnet:check-solution    Validate solution health

QUALITY
  /DotnetPilot:quality:pre-commit       Build + test + format + arch check
  /DotnetPilot:quality:review           Code review current changes
  /DotnetPilot:quality:audit-nuget      NuGet vulnerability scan
  /DotnetPilot:quality:audit-architecture  Clean arch violation scan

UTILITY
  /DotnetPilot:utility:status           Show pipeline state
  /DotnetPilot:utility:settings         Configure plugin options
  /DotnetPilot:utility:help             This help text
  /DotnetPilot:utility:quick            One-off task (bypass pipeline)
  /DotnetPilot:utility:map-solution     Map solution structure
```
