---
description: "List all DotnetPilot commands grouped by category."
effort: low
---

# DotnetPilot Help

Print the following block **exactly as-is** — do not summarize, paraphrase, or add any other text:

```
DotnetPilot — .NET development plugin for Claude Code

PROJECT — project lifecycle
  project:init               Initialize for a .NET solution — discover projects, write the
                             user-scoped .planning/ (config.json, solution-map.json)
  project:verify             Verify readiness before shipping — build, tests, DI
                             completeness, architecture check; --quick is the pre-commit form
  project:ship               Create a pull request — runs final checks and invokes
                             gh pr create

DOTNET — scaffolding & solution management
  dotnet:scaffold            Scaffold a feature, API surface, service, or project matching
                             the solution's architecture (feature|api|service|project)
  dotnet:create-entity       Create a full entity stack: entity class, EF configuration,
                             repository, service, DI registration, and migration
  dotnet:add-endpoint        Add an endpoint to an existing controller or endpoint group
  dotnet:add-migration       Plan and generate an EF Core migration safely — validates
                             chain, detects breaking changes, targets correct DbContext
  dotnet:tdd                 Implement a feature using TDD — failing tests first, then
                             production code; --existing <target> adds tests to existing code
  dotnet:run-tests           Run tests with coverage reporting and failure diagnosis
  dotnet:health-check        Validate full solution health — build, tests, NuGet, project
                             references, DI completeness

QUALITY — safety checks
  quality:review             Code review current changes with .NET-specific focus — async
                             patterns, LINQ, naming, DI
  quality:check-architecture Scan for clean architecture layer violations — forbidden
                             project references, DI issues, package placement
  quality:security-scan      OWASP audit — NuGet CVEs, secrets exposure, auth config,
                             CORS, and input validation gaps
  quality:de-sloppify        Safe refactoring pass — dead code removal, naming
                             normalization, duplication elimination

UTILITY — housekeeping
  utility:help               Show this help text
  utility:statusline         Install the .NET-aware statusline

Usage: /dotnet-pilot:<command>   e.g. /dotnet-pilot:dotnet:create-entity Product

Did you mean — commands removed in v3.0.0 and where their job went
  dotnet:add-project         → dotnet:scaffold project <Name> --type <classlib|web|xunit|worker|console>
  dotnet:add-service         → dotnet:scaffold service <Name> [--lifetime ...]
  dotnet:create-api          → dotnet:scaffold api <Entity> [--minimal]
  dotnet:write-tests         → dotnet:tdd --existing <class|file|project>
  dotnet:build-fix           → run dotnet build and fix inline; the dnp-build-verify hook
                               escalates after repeated failures
  project:checkpoint         → project:verify --quick
  quality:commit-check       → project:verify --quick
  quality:check-packages     → dotnet:health-check (NuGet section) or quality:security-scan
  project:next               → Plan Mode + TaskCreate (Claude Code native)
  utility:status             → git status + TaskList (Claude Code native)
  utility:quick-fix          → just ask in the conversation — no command needed
  utility:settings           → edit .planning/config.json (keys: hooks/_lib/config.js)
  utility:show-solution      → mcp__roslyn__get_solution_structure, or .planning/solution-map.json
                               (schema documented in project:init)
```
