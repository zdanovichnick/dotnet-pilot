---
description: "List all DotnetPilot commands grouped by category."
---

# DotnetPilot Help

Print the following block **exactly as-is** — do not summarize, paraphrase, or add any other text:

```
DotnetPilot v1.1.0 — .NET development plugin for Claude Code
21 commands · 8 agents · 5 advisory hooks

PIPELINE — project lifecycle
  pipeline:init              Initialize for a .NET solution — discover projects, create
                             .planning/, generate PROJECT.md and solution map
  pipeline:next              Auto-detect and suggest the next step based on current state
  pipeline:verify            Verify readiness before shipping — build, tests, DI
                             completeness, and architecture check
  pipeline:ship              Create a pull request — runs final checks and invokes
                             gh pr create

DOTNET — scaffolding & solution management
  dotnet:scaffold-entity     Create a full entity stack: entity class, EF configuration,
                             repository, service, DI registration, and migration
  dotnet:scaffold-api        Scaffold API controller or minimal API endpoint with DTOs,
                             validation, DI registration, and OpenAPI attributes
  dotnet:add-service         Create a service with interface, implementation, DI
                             registration, and test scaffold
  dotnet:add-endpoint        Add an endpoint to an existing controller or endpoint group
  dotnet:add-migration       Plan and generate an EF Core migration safely — validates
                             chain, detects breaking changes, targets correct DbContext
  dotnet:add-project         Add a new project to the solution with correct references
                             and layer placement
  dotnet:run-tests           Run tests with coverage reporting and failure diagnosis
  dotnet:check-solution      Validate full solution health — build, tests, NuGet, project
                             references, DI completeness

QUALITY — safety checks
  quality:pre-commit         Pre-commit quality gate — build, test, format check, DI
                             verification, and architecture audit
  quality:review             Code review current changes with .NET-specific focus — async
                             patterns, LINQ, naming, DI
  quality:audit-nuget        NuGet vulnerability scan, version consistency check, and
                             upgrade recommendations
  quality:audit-architecture Scan for clean architecture layer violations — forbidden
                             project references, DI issues, package placement

UTILITY — housekeeping
  utility:help               Show this help text
  utility:quick              Quick one-off task — bypass the full pipeline for small changes
  utility:status             Show current pipeline state — phase, progress, recent activity
  utility:settings           View and modify DotnetPilot configuration
  utility:map-solution       Map the .NET solution structure — projects, references,
                             packages, namespaces, layers

Usage: /DotnetPilot:<command>   e.g. /DotnetPilot:dotnet:scaffold-entity Product
```
