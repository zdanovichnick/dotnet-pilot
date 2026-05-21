---
description: "List all DotnetPilot commands grouped by category."
---

# DotnetPilot Help

Print the following block **exactly as-is** — do not summarize, paraphrase, or add any other text:

```
DotnetPilot v2.1.1 — .NET development plugin for Claude Code
23 commands · 10 agents · 7 hooks

PROJECT — project lifecycle
  project:init               Initialize for a .NET solution — discover projects, create
                             .planning/, generate PROJECT.md and solution map
  project:next               Auto-detect and suggest the next step based on current state
  project:verify             Verify readiness before shipping — build, tests, DI
                             completeness, and architecture check
  project:ship               Create a pull request — runs final checks and invokes
                             gh pr create

DOTNET — scaffolding & solution management
  dotnet:create-entity       Create a full entity stack: entity class, EF configuration,
                             repository, service, DI registration, and migration
  dotnet:create-api          Create API controller or minimal API endpoint with DTOs,
                             validation, DI registration, and OpenAPI attributes
  dotnet:add-service         Create a service with interface, implementation, DI
                             registration, and test scaffold
  dotnet:add-endpoint        Add an endpoint to an existing controller or endpoint group
  dotnet:add-migration       Plan and generate an EF Core migration safely — validates
                             chain, detects breaking changes, targets correct DbContext
  dotnet:add-project         Add a new project to the solution with correct references
                             and layer placement
  dotnet:write-tests         Generate tests for existing code — unit, integration, or
                             WebApplicationFactory tests
  dotnet:tdd                 Implement a feature using TDD — writes failing tests first,
                             then production code
  dotnet:run-tests           Run tests with coverage reporting and failure diagnosis
  dotnet:health-check        Validate full solution health — build, tests, NuGet, project
                             references, DI completeness

QUALITY — safety checks
  quality:commit-check       Commit quality gate — build, test, format check, DI
                             verification, and architecture check
  quality:review             Code review current changes with .NET-specific focus — async
                             patterns, LINQ, naming, DI
  quality:check-packages     Package vulnerability scan, version consistency check, and
                             upgrade recommendations
  quality:check-architecture Scan for clean architecture layer violations — forbidden
                             project references, DI issues, package placement

UTILITY — housekeeping
  utility:help               Show this help text
  utility:quick-fix          Quick fix — bypass the full pipeline for small changes
  utility:status             Show current project state — phase, progress, recent activity
  utility:settings           View and modify DotnetPilot configuration
  utility:show-solution      Show the .NET solution structure — projects, references,
                             packages, namespaces, layers

Usage: /DotnetPilot:<command>   e.g. /DotnetPilot:dotnet:create-entity Product
```
