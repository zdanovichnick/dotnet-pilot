# DotnetPilot

.NET development assistant for [Claude Code](https://claude.ai/code) — Roslyn-backed DI verification, EF Core migration safety, clean-architecture enforcement, convention-aware scaffolders, and project lifecycle commands.

## Table of Contents

- [Why DotnetPilot](#why-dotnetpilot)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Pipeline commands](#pipeline-commands)
- [.NET Shortcuts](#net-shortcuts)
- [Quality Commands](#quality-commands)
- [Utility Commands](#utility-commands)
- [Agents](#agents)
- [What DotnetPilot does NOT do](#what-dotnetpilot-does-not-do)
- [Hooks](#hooks)
- [Configuration](#configuration)
- [Use Cases](#use-cases)
- [Command Reference](#command-reference)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Author](#author)
- [License](#license)

## Why DotnetPilot

AI coding tools make these .NET mistakes constantly:
- Create services but forget DI registration
- Edit migration files manually (breaking the chain)
- Put domain models in the wrong project
- Skip `dotnet build` verification
- Ignore existing patterns in your codebase

DotnetPilot gives Claude Code **8 specialized .NET agents**, **5 advisory hooks**, and **20 commands** focused on things Claude doesn't do well out of the box: Roslyn-backed DI verification, EF Core migration safety, clean-architecture layer checks, convention-aware scaffolders, and a lightweight project lifecycle (`init` / `next` / `status`).

> **v1.0.0 direction shift:** the previous spec-driven pipeline (`discuss`/`research`/`plan`/`execute`/`verify`) and its 5 supporting agents have been retired. Use **Plan Mode** + `TaskCreate` for multi-step work — they evolve with Claude Code and don't drift. DotnetPilot now stays narrow: `.NET`-specific safety, scaffolding, and lightweight project state.

## Requirements

| Dependency | Purpose |
|------------|---------|
| [Claude Code](https://claude.ai/code) | AI coding assistant (CLI, desktop, or IDE) |
| [.NET SDK 10+](https://dotnet.microsoft.com/) | Your .NET project must build |
| [Node.js](https://nodejs.org/) | Hooks are JS scripts executed by Claude Code |
| [dnp-roslyn](https://github.com/zdanovichnick/dotnet-pilot-mcp-roslyn) **v0.3 or newer** | Roslyn MCP server for semantic C# analysis. DotnetPilot passes `DNP_ROSLYN_MIN_VERSION=0.3` via `.mcp.json` — older servers may not support the architecture-violation / EF-model tools the agents expect. |
| [Context7 MCP server](https://github.com/upstash/context7) | Live documentation for agents |
| [jq](https://jqlang.github.io/jq/) (optional) | Better JSON parsing in commit format hook |
| [GitHub CLI](https://cli.github.com/) (optional) | Required only for `/ship` command (PR creation) |

### Install dependencies

**.NET SDK:**

```bash
# Windows
winget install Microsoft.DotNet.SDK.10

# macOS
brew install dotnet-sdk

# Linux (Ubuntu/Debian)
sudo apt-get install -y dotnet-sdk-10.0
```

**Node.js:**

```bash
# Windows
winget install OpenJS.NodeJS

# macOS
brew install node

# Linux (Ubuntu/Debian)
sudo apt-get install -y nodejs npm
```

**dnp-roslyn** (cross-platform, requires .NET SDK):

```bash
# Install (or upgrade to the latest compatible version)
dotnet tool install -g DotnetPilot.Mcp.Roslyn
dotnet tool update -g DotnetPilot.Mcp.Roslyn   # run this after upgrading dotnet-pilot-core

# Sanity check
dnp-roslyn version
```

`dotnet-pilot-core` expects `dnp-roslyn >= 0.3`. The minimum version is pinned via
`DNP_ROSLYN_MIN_VERSION` in `.mcp.json`; if the server is older than that and reads the
env var, it will log a warning on startup. Otherwise, mismatches surface as missing MCP
tools in the agent runs.

**jq** (optional):

```bash
# Windows
winget install jqlang.jq

# macOS
brew install jq

# Linux (Ubuntu/Debian)
sudo apt-get install -y jq
```

**GitHub CLI** (optional, for `/ship` command):

```bash
# Windows
winget install GitHub.cli

# macOS
brew install gh

# Linux
sudo apt-get install -y gh
```

### What dnp-roslyn provides

The Roslyn MCP server gives DotnetPilot semantic understanding of your C# code:

| Tool | What it does |
|------|-------------|
| `get_solution_structure` | Projects, references, frameworks, document counts |
| `reload_solution` | Invalidate cache and reload from disk |
| `get_class_outline` | Member signatures (no bodies) for classes in a file |
| `get_method_body` | Full source of a specific method/constructor/property |
| `find_references` | Cross-solution symbol references |
| `find_implementations` | Interface/abstract class implementations |
| `find_di_registrations` | All service registrations (AddScoped, AddTransient, etc.) |
| `find_di_consumers` | All constructor-injected types |
| `check_di_completeness` | Missing registrations + captive dependency detection |
| `check_architecture_violations` | Clean architecture layer rule enforcement |
| `get_ef_models` | DbContexts, entities, properties, navigations |

Without dnp-roslyn, DI checking falls back to regex-based hooks (less accurate).

## Installation

### Step 1: Install `dotnet-pilot-core` (required)

Inside Claude Code, run these slash commands:

```
/plugin marketplace add zdanovichnick/dotnet-pilot
/plugin install dotnet-pilot-core@zdanovichnick-dotnet-pilot
/reload-plugins
```

Or install from a local clone:

```
/plugin marketplace add ./dotnet-pilot
/plugin install dotnet-pilot-core@dotnet-pilot
/reload-plugins
```

### Step 2: Install the Roslyn MCP server

```bash
dotnet tool install -g DotnetPilot.Mcp.Roslyn   # requires v0.3+
```

The plugin's `.mcp.json` automatically starts the `dnp-roslyn` server when Claude Code loads.

### Step 3: Enable Context7

In Claude Code, enable the Context7 MCP server at the account level. `dnp-planner`'s `tools:` whitelist references `mcp__context7__*` for live NuGet / ASP.NET Core / EF Core documentation.

### Step 4: Verify setup

Open Claude Code in your .NET project directory and run:

```
/DotnetPilot:utility:help
```

You should see 20 commands. Then run:

```
/DotnetPilot:dotnet:check-solution
```

This validates that your solution builds, tests pass, and the Roslyn server can load your project.

## Getting Started

### Command overview

```
PIPELINE — light-touch lifecycle:
  init, next, ship
  (discuss/research/plan/execute/verify retired in v1.0.0 — use Plan Mode + TaskCreate)

DOTNET — targeted scaffolding & tooling:
  add-migration, scaffold-api, add-service, add-project,
  run-tests, add-endpoint, scaffold-entity, check-solution

QUALITY — checks & reviews:
  pre-commit, review, audit-nuget, audit-architecture

UTILITY — housekeeping:
  settings, help, quick, map-solution, status
```

All commands are invoked as `/DotnetPilot:<category>:<command>`, for example `/DotnetPilot:pipeline:init` or `/DotnetPilot:dotnet:scaffold-entity User`.

### Quick start (5 minutes)

Open Claude Code in your .NET solution directory:

```
/DotnetPilot:pipeline:init
```

This scans your solution and creates a user-scoped `.planning/` directory with:
- Your solution structure (projects, frameworks, EF contexts)
- Architecture style detection (clean, vertical slices, flat)
- Test framework detection (xUnit, NUnit, MSTest)
- A `config.json` with detected settings

It then asks you three questions:
1. **What are you building?** — core value proposition
2. **Who is this for?** — target users
3. **What constraints exist?** — deadlines, existing APIs, backward compatibility

After init, you're ready to use either the full pipeline or the quick shortcuts.

### Approach A: Multi-step features

Use Claude Code's native **Plan Mode** (`EnterPlanMode`) + `TaskCreate`. When you want a .NET-aware task breakdown, spawn the `dnp-planner` agent — it emits a Markdown plan plus a JSON list you can pipe into `TaskCreate`. Then execute the tasks yourself (or with the stock `general-purpose` agent), using `/DotnetPilot:dotnet:*` for individual file scaffolds. Close with `/DotnetPilot:quality:pre-commit` and `/DotnetPilot:pipeline:ship`.

### Approach B: Quick shortcuts (for small, focused tasks)

```
/DotnetPilot:dotnet:scaffold-entity User             # Full entity stack
/DotnetPilot:dotnet:scaffold-api User                # API endpoints + DTOs
/DotnetPilot:dotnet:add-service Email                # Service + interface + DI
/DotnetPilot:dotnet:add-migration AddUsersTable      # Safe EF migration
/DotnetPilot:dotnet:check-solution                   # Full health check
```

### Approach C: One-off bypass

```
/DotnetPilot:utility:quick fix the null reference in UserService.GetById
```

Runs a single task with build verification but skips the full planning pipeline.

## Pipeline commands

### Init

```
/DotnetPilot:pipeline:init [--refresh]
```

Scans your solution and creates a user-scoped `.planning/` directory (at `~/.claude/projects/<flat-repo-path>/.planning/`) with:
- `config.json` — detected .NET settings (framework, architecture style, test framework, EF contexts)
- `solution-map.json` — full project structure cache
- `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` — empty templates

Then asks three questions (via `AskUserQuestion`): what are you building, who is it for, and what constraints exist. Answers are written into `PROJECT.md`.

Use `--refresh` to re-scan the solution without overwriting existing project docs.

### Next

```
/DotnetPilot:pipeline:next
```

Read-only advisory: reads `.planning/STATE.md`, checks git status and build health, then suggests the next logical command. Never executes anything automatically.

### Ship

```
/DotnetPilot:pipeline:ship [--draft]
```

Creates a pull request via `gh pr create`:
- Runs final `dotnet build`, `dotnet test`, DI-completeness (via `dnp-di-wiring-checker`), and architecture checks (via `dnp-architect`)
- Generates a PR body from commits since the base branch with a .NET-specific checklist
- Returns the PR URL

> The former `discuss`/`research`/`plan`/`execute`/`verify` commands were retired — they duplicated Plan Mode + TaskCreate and drifted as Claude evolved. For multi-step work, use Plan Mode directly; for a .NET-aware task breakdown to feed into `TaskCreate`, spawn `dnp-planner`.

## .NET Shortcuts

These commands bypass the full pipeline for focused, single-concern tasks.

### scaffold-entity

```
/DotnetPilot:dotnet:scaffold-entity <name> [--properties 'Name:string, Age:int']
```

Creates the complete vertical slice:
1. Entity class in Domain
2. `IEntityTypeConfiguration<T>` in Infrastructure
3. `DbSet<T>` added to DbContext
4. Repository interface + implementation (if pattern exists)
5. Service interface + implementation in Application
6. DI registration for repository and service
7. EF Core migration via `dotnet ef migrations add`
8. Build verification after each step

### scaffold-api

```
/DotnetPilot:dotnet:scaffold-api <entity> [--minimal]
```

Generates a complete API surface:
- Request/response DTOs
- Validation (FluentValidation or DataAnnotations, matching your existing choice)
- Controller or minimal API endpoints (auto-detects your style)
- Mapping profile (if AutoMapper/Mapster is present)
- DI registration for any new services

### add-service

```
/DotnetPilot:dotnet:add-service <name> [--lifetime scoped|transient|singleton]
```

Creates:
- `I<Name>Service.cs` interface
- `<Name>Service.cs` implementation
- DI registration in `ServiceCollectionExtensions.cs`
- `<Name>ServiceTests.cs` test scaffold with mocked dependencies

### add-endpoint

```
/DotnetPilot:dotnet:add-endpoint <controller> <method> <route> [--with-dto]
```

Adds a single endpoint to an existing controller/group. Detects existing patterns (return types, error handling, attributes) and matches them.

### add-migration

```
/DotnetPilot:dotnet:add-migration <name> [--context <DbContextName>]
```

Safe EF Core migration:
1. If multiple DbContexts: asks which one
2. Detects breaking changes (column drops, type changes)
3. Validates migration chain integrity
4. Runs `dotnet ef migrations add` with correct `--project` and `--startup-project`
5. Verifies with `dotnet build` and dry-run `dotnet ef database update`

### add-project

```
/DotnetPilot:dotnet:add-project <name> <type>
```

Types: `classlib`, `web`, `xunit`, `worker`, `console`. Adds the project to the solution with correct layer references, matching target framework, and Central Package Management integration.

### run-tests

```
/DotnetPilot:dotnet:run-tests [project] [--coverage] [--filter <pattern>]
```

Runs tests with detailed reporting. On failure, spawns `dnp-test-writer` to diagnose and suggest fixes.

### check-solution

```
/DotnetPilot:dotnet:check-solution [--fix]
```

Comprehensive health check:
```
Solution Health: MyApp.slnx
  Build:        PASS (0 errors, 3 warnings)
  Tests:        PASS (47 passed, 0 failed)
  NuGet:        WARN (1 outdated, 0 vulnerable)
  DI Wiring:    PASS (12 services, 0 missing)
  Architecture: PASS (no layer violations)
  References:   PASS (no circular refs)
```

Use `--fix` to auto-fix simple issues (missing usings, outdated packages).

## Quality Commands

### pre-commit

```
/DotnetPilot:quality:pre-commit
```

Runs all quality checks in sequence (fail-fast):
1. `dotnet build --no-restore`
2. `dotnet test --no-build`
3. `dotnet format --verify-no-changes`
4. DI wiring verification
5. Architecture layer scan
6. Code review (if >5 files changed)

### review

```
/DotnetPilot:quality:review [--depth quick|standard|deep]
```

Code review of staged or recent changes with .NET focus:
- **quick** — naming + compilation
- **standard** — + async patterns + DI
- **deep** — + performance + security

### audit-nuget

```
/DotnetPilot:quality:audit-nuget
```

Scans NuGet packages for vulnerabilities, outdated versions, and cross-project version inconsistencies.

### audit-architecture

```
/DotnetPilot:quality:audit-architecture
```

Validates clean architecture rules: forbidden project references, package placement (EF Core not in Domain), circular dependencies.

## Utility Commands

| Command | Usage |
|---------|-------|
| `settings` | `/DotnetPilot:utility:settings [key] [value]` — view/modify config |
| `status` | `/DotnetPilot:utility:status` — show pipeline state (phase, progress, last activity) |
| `help` | `/DotnetPilot:utility:help` — lists all commands |
| `quick` | `/DotnetPilot:utility:quick <task>` — one-off task bypassing the pipeline |
| `map-solution` | `/DotnetPilot:utility:map-solution` — re-scan and update solution-map.json |

## Agents

DotnetPilot delegates work to 8 specialized agents, each with scoped tool access and a pinned model ID. Commands never do heavy work directly — they spawn the right agent with full context. All models are pinned to dated IDs (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) so behavior doesn't drift when Anthropic releases a new model.

### Planning & verification

| Agent | Model | Role |
|-------|-------|------|
| `dnp-planner` | Opus 4.6 | Emits a .NET-aware task list (DI-conscious, migration-safe) that maps 1:1 to Claude Code's `TaskCreate` |
| `dnp-verifier` | Sonnet 4.6 | Goal-backward verification: build, tests, DI completeness, migration state, architecture rules |

### Expert agents

| Agent | Model | Role |
|-------|-------|------|
| `dnp-architect` | Opus 4.6 | Solution architecture, clean-arch layer enforcement, project-reference and package-placement validation |
| `dnp-test-writer` | Sonnet 4.6 | TDD agent — xUnit/NUnit with proper mocking, WebApplicationFactory integration tests, convention-aware assertions |

### Mechanical agents

| Agent | Model | Role |
|-------|-------|------|
| `dnp-api-scaffolder` | Haiku 4.5 | Generates controllers or minimal API endpoints with DTOs, validation, OpenAPI attributes, and DI registration |
| `dnp-ef-migration-planner` | Haiku 4.5 | Plans safe EF Core migrations — detects breaking changes, validates chain integrity, targets correct DbContext |
| `dnp-di-wiring-checker` | Haiku 4.5 | Cross-references constructor injection against DI registrations — finds missing services and captive dependencies |
| `dnp-nuget-auditor` | Haiku 4.5 | Scans for vulnerable, outdated, and version-inconsistent NuGet packages across the solution |

## What DotnetPilot does NOT do

These capabilities live in stock Claude Code — use them directly. DotnetPilot deliberately does not wrap or duplicate them:

| Task | Use instead |
|------|-------------|
| Multi-step planning | **Plan Mode** (`EnterPlanMode`) + `TaskCreate` |
| General code review | Stock `code-reviewer` agent (via `/DotnetPilot:quality:review`, which now delegates to it) |
| Security audit | Stock `/security-review` command |
| Library research | Context7 MCP (`mcp__context7__*`) or `WebSearch` |
| Tracking work within a conversation | `TaskCreate` / `TaskUpdate` |
| Gathering user intent | `AskUserQuestion` |
| Initial CLAUDE.md | Stock `/init` |

DotnetPilot's version wins only for **.NET-specific behavior**: Roslyn semantics, EF migration chains, DI wiring across project boundaries, clean-architecture layer rules, and scaffolders that match your project's existing conventions.

## Hooks

Hooks run automatically during Claude Code sessions. They are **advisory by default** — they warn but don't block.

| Hook | Trigger | What it does |
|------|---------|-------------|
| **DI Registration Check** | After Write/Edit of `.cs` files | Detects new services missing DI registration |
| **Migration Guard** | Before Write/Edit of migration files | Warns when manually editing EF migration files |
| **Project Scope Guard** | After Write/Edit | Warns when editing files outside current phase's focused projects |
| **Build Verify** | After Bash (dotnet build) | Parses build failures, tracks consecutive failures, aborts after 5 |
| **Commit Format** | Before Bash (git commit) | Enforces conventional commit format: `type(scope): message` |

All hooks respect the toggle settings in `.planning/config.json` under the `hooks` section and exit early when no `.planning/` directory exists.

## Configuration

After running `/DotnetPilot:pipeline:init`, configuration lives in `~/.claude/projects/<flat-repo-path>/.planning/config.json`. DotnetPilot reads the `hooks.*` and `dotnet.*` sections (the legacy pipeline keys are ignored):

```json
{
  "dotnet": {
    "solution_path": "MyApp.slnx",
    "target_framework": "net10.0",
    "test_framework": "xunit",
    "ef_contexts": ["ApplicationDbContext"],
    "architecture_style": "clean",
    "use_minimal_api": false,
    "central_package_management": false
  },
  "hooks": {
    "di_check": true,
    "migration_guard": true,
    "project_scope_guard": true,
    "build_verify": true,
    "commit_format": true
  },
  "workflow": {
    "build_after_task": true,
    "test_after_task": true,
    "di_check_on_write": true
  }
}
```

The retired keys (`workflow.research`, `workflow.plan_check`, `workflow.verifier`, `workflow.auto_advance`, `parallelization.*`, `gates.confirm_plan`, `gates.confirm_phases`, `gates.breaking_change_confirm`, `git.phase_branch_template`) are ignored — they belonged to the spec-driven pipeline retired in v1.0.0.

### Common settings to change

| Setting | Default | Change to | Why |
|---------|---------|-----------|-----|
| `hooks.di_check` | `true` | `false` | Disable DI advisory if too noisy |
| `hooks.project_scope_guard` | `true` | `false` | Disable scope-guard if you often edit across projects |
| `hooks.commit_format` | `true` | `false` | Skip conventional-commit nagging |
| `workflow.build_after_task` | `true` | `false` | Skip automatic `dotnet build` after scaffolders |

Use `/DotnetPilot:utility:settings <key> <value>` to change values, or edit the JSON directly.

## Use Cases

### 1. Add a CRUD entity to an existing project in 30 seconds

**Scenario:** You need a `Category` entity with a few properties, wired end-to-end.

```
> /DotnetPilot:dotnet:scaffold-entity Category --properties 'Name:string, Description:string?, SortOrder:int'

Created 9 files:
  src/ECommerce.Domain/Entities/Category.cs
  src/ECommerce.Infrastructure/Configurations/CategoryConfiguration.cs
  src/ECommerce.Infrastructure/Data/ApplicationDbContext.cs  (added DbSet<Category>)
  src/ECommerce.Application/Interfaces/ICategoryRepository.cs
  src/ECommerce.Infrastructure/Repositories/CategoryRepository.cs
  src/ECommerce.Application/Interfaces/ICategoryService.cs
  src/ECommerce.Application/Services/CategoryService.cs
  src/ECommerce.Api/Extensions/ServiceCollectionExtensions.cs  (2 DI registrations added)
  Migration: 20260420_AddCategoryTable

Build: PASS | Tests: PASS | DI: PASS

> /DotnetPilot:dotnet:scaffold-api Category

Created 4 files:
  src/ECommerce.Api/DTOs/CreateCategoryRequest.cs
  src/ECommerce.Api/DTOs/CategoryResponse.cs
  src/ECommerce.Api/Controllers/CategoriesController.cs
  src/ECommerce.Api/Validators/CreateCategoryRequestValidator.cs

Build: PASS
```

**Result:** From nothing to a fully wired CRUD endpoint with validation, matching your existing project conventions.

---

### 2. Safely add an EF Core migration to a project with multiple DbContexts

**Scenario:** Your project has `ApplicationDbContext` and `TenantDbContext`. You need to add a column to the tenant schema.

```
> /DotnetPilot:dotnet:add-migration AddCompanyNameToTenant

DotnetPilot: "Multiple DbContexts detected. Which one?"
  1. ApplicationDbContext (Infrastructure, 12 entities)
  2. TenantDbContext (Infrastructure, 4 entities)
You: "2"

Checking for breaking changes...
  Analysis: Adding nullable column CompanyName to Tenant — safe, no data loss.
  Migration chain: 7 existing migrations, chain valid.

Running: dotnet ef migrations add AddCompanyNameToTenant \
  --project src/ECommerce.Infrastructure \
  --startup-project src/ECommerce.Api \
  --context TenantDbContext

Verifying: dotnet build PASS
Dry run: dotnet ef database update --dry-run PASS

Committed: feat(Infrastructure): add migration AddCompanyNameToTenant
```

**Without DotnetPilot:** Claude picks the wrong DbContext, generates the migration in the wrong project, or skips the dry-run validation.

---

### 3. Catch architecture violations before they ship

**Scenario:** During a refactor, someone added a reference from the Domain project to Infrastructure (to use a helper method). This breaks clean architecture.

```
> /DotnetPilot:quality:audit-architecture

Architecture Audit: ECommerce.slnx
  Style: clean

  Layer Classification:
    ECommerce.Domain          → Domain
    ECommerce.Application     → Application
    ECommerce.Infrastructure  → Infrastructure
    ECommerce.Api             → Api
    ECommerce.Tests           → Tests

  Violations (1):
    [ERROR] ECommerce.Domain → ECommerce.Infrastructure
            Domain should not reference Infrastructure.
            Fix: Move the shared helper to Domain or create an interface
            in Application that Infrastructure implements.
```

The `dnp-architect` agent also catches this in real-time during the pipeline — it won't let you ship a phase with architecture violations.

---

### 4. Find and fix missing DI registrations across the solution

**Scenario:** After a merge, some services were added without DI registration. The app compiles but throws at runtime.

```
> /DotnetPilot:dotnet:check-solution

Solution Health: ECommerce.slnx
  Build:        PASS (0 errors, 2 warnings)
  Tests:        PASS (58 passed, 0 failed)
  NuGet:        PASS (0 vulnerable, 0 outdated)
  DI Wiring:    FAIL (15 services, 2 missing)
  Architecture: PASS (no layer violations)
  References:   PASS (no circular refs)

Missing DI registrations:
  1. IPaymentGateway — consumed by OrderService (Application/Services/OrderService.cs:14)
     No AddScoped/AddTransient/AddSingleton found for IPaymentGateway
  2. INotificationService — consumed by OrderCompletedHandler (Application/Handlers/OrderCompletedHandler.cs:9)
     No registration found for INotificationService

> /DotnetPilot:dotnet:check-solution --fix

Fixed:
  src/ECommerce.Api/Extensions/ServiceCollectionExtensions.cs
    + services.AddScoped<IPaymentGateway, StripePaymentGateway>();
    + services.AddScoped<INotificationService, EmailNotificationService>();

Build: PASS | DI: PASS (17 services, 0 missing)
```

**The Roslyn MCP server** (`check_di_completeness`) cross-references every constructor parameter against every registration call — no regex guessing.

---

### 5. Understand unfamiliar code without reading entire files

**Scenario:** You're new to a codebase and need to understand `OrderProcessingService` before modifying it.

The Roslyn MCP server gives you a structured view without reading 400 lines:

```
Tool: get_class_outline
  → OrderProcessingService: 12 members, implements IOrderProcessingService
    - .ctor(IOrderRepository, IPaymentGateway, IInventoryService, ILogger)
    - ProcessOrderAsync(Guid orderId) : Task<OrderResult>
    - ValidateOrder(Order order) : ValidationResult
    - CalculateTotal(Order order) : decimal
    - ApplyDiscount(Order order, string promoCode) : decimal
    ...

Tool: get_method_body (ProcessOrderAsync)
  → Full source of just that one method (15 lines instead of 400)

Tool: find_references (IOrderProcessingService)
  → Used in: OrdersController.cs:18, OrderCompletedHandler.cs:22, ServiceCollectionExtensions.cs:31

Tool: find_implementations (IOrderProcessingService)
  → OrderProcessingService (Infrastructure/Services/OrderProcessingService.cs:8)
  → MockOrderProcessingService (Tests/Mocks/MockOrderProcessingService.cs:5)
```

Each tool call returns exactly what you need — no scanning, no guessing file paths.

---

### 6. Review code changes with .NET-specific checks

**Scenario:** Before merging a PR, run a deep code review focused on .NET patterns.

```
> /DotnetPilot:quality:review --depth deep

Code Review: 8 files changed

[HIGH] src/ECommerce.Application/Services/UserService.cs:45
  Async method GetUserAsync calls .Result on a Task — this deadlocks under ASP.NET Core.
  Fix: await the call instead of using .Result

[HIGH] src/ECommerce.Api/Controllers/UsersController.cs:28
  SQL injection risk: string interpolation in LINQ query with user input.
  Fix: Use parameterized queries or LINQ expressions

[MEDIUM] src/ECommerce.Infrastructure/Repositories/OrderRepository.cs:62
  N+1 query: calling .Include() inside a loop. Use eager loading outside the loop.

[LOW] src/ECommerce.Application/Services/OrderService.cs:15
  ILogger injected but never used. Remove or add logging to error paths.

4 issues found: 2 high, 1 medium, 1 low
```

---

### 7. Onboard a new team member to the codebase

**Scenario:** A new developer joins and needs to understand the project structure, patterns, and conventions before contributing.

```
> /DotnetPilot:pipeline:init

Solution: ECommerce.slnx with 7 projects
Framework: net10.0 | Architecture: clean | Tests: xunit
Test Framework: xunit + FluentAssertions + NSubstitute
ORM: EF Core (SQL Server)
Validation: FluentValidation
CQRS: No (direct service calls)
API Style: Controllers (not minimal API)
Central Package Management: Yes

Projects:
  src/ECommerce.Domain          classlib  net10.0  [domain]      12 files
  src/ECommerce.Application     classlib  net10.0  [application] 24 files
  src/ECommerce.Infrastructure  classlib  net10.0  [infrastructure] 18 files
  src/ECommerce.Api             web       net10.0  [api]         15 files
  src/ECommerce.Contracts       classlib  net10.0  [domain]       6 files
  tests/ECommerce.UnitTests     xunit     net10.0  [tests]       20 files
  tests/ECommerce.IntTests      xunit     net10.0  [tests]        8 files

EF Contexts:
  ApplicationDbContext (Infrastructure, SqlServer) — 12 entities

> /DotnetPilot:utility:status

DotnetPilot Status
══════════════════
Solution: ECommerce.slnx (net10.0, clean architecture)
Pipeline: Not started

The new developer now has a complete mental model. When they use any DotnetPilot command,
it automatically follows the project's existing conventions.
```

---

### 8. Pre-commit quality gate in daily workflow

**Scenario:** Before every commit, ensure nothing is broken.

```
> /DotnetPilot:quality:pre-commit

Pre-Commit Results
  [PASS] Build: 0 errors
  [PASS] Tests: 72 passed
  [WARN] Format: 2 files need formatting
  [PASS] DI Wiring: all services registered
  [PASS] Architecture: no violations

Ready to commit. Run `dotnet format` to fix formatting issues.
```

This catches: compilation errors, test regressions, missing DI registrations, architecture violations, and formatting issues — all before the code leaves your machine.

---

### 9. Audit NuGet packages before a release

**Scenario:** Before cutting a release, check for vulnerable or outdated packages.

```
> /DotnetPilot:quality:audit-nuget

NuGet Audit: ECommerce.slnx
  Total packages: 34

  Vulnerabilities (1):
    [CRITICAL] System.Text.Json 8.0.0 — CVE-2024-XXXX (denial of service)
    Used by: ECommerce.Api, ECommerce.Infrastructure
    Fix: Update to 8.0.5+

  Outdated (3):
    FluentValidation 11.8.0 → 11.10.0
    Serilog.Sinks.Console 5.0.0 → 6.0.0
    Npgsql.EntityFrameworkCore.PostgreSQL 8.0.0 → 9.0.0

  Version inconsistencies (1):
    Newtonsoft.Json: 13.0.1 in Api, 13.0.3 in Infrastructure
    Fix: Use Central Package Management or align versions

  Recommendation: Enable Central Package Management to prevent version drift.
```

## Command Reference

### Pipeline

| Command | Arguments | Description |
|---------|-----------|-------------|
| `pipeline:init` | `[--refresh]` | Discover solution; create user-scoped `.planning/` with config, solution map, and project docs |
| `pipeline:next` | | Read-only advisory suggesting the next sensible command based on repo state |
| `pipeline:ship` | `[--draft]` | Create pull request (build + tests + DI + architecture check, then `gh pr create`) |

### Dotnet

| Command | Arguments | Description |
|---------|-----------|-------------|
| `dotnet:scaffold-entity` | `<name> [--properties '...']` | Full entity + config + repo + migration |
| `dotnet:scaffold-api` | `<entity> [--minimal]` | Controller/endpoints + DTOs + validation |
| `dotnet:add-service` | `<name> [--lifetime ...]` | Service + interface + DI + test scaffold |
| `dotnet:add-endpoint` | `<controller> <method> <route> [--with-dto]` | Add endpoint to existing controller |
| `dotnet:add-migration` | `<name> [--context ...]` | Safe EF Core migration |
| `dotnet:add-project` | `<name> <type>` | Add project with correct references |
| `dotnet:run-tests` | `[project] [--coverage] [--filter ...]` | Tests with failure diagnosis |
| `dotnet:check-solution` | `[--fix]` | Full health check |

### Quality

| Command | Arguments | Description |
|---------|-----------|-------------|
| `quality:pre-commit` | | Build + test + format + DI + arch check |
| `quality:review` | `[--depth quick\|standard\|deep]` | Code review staged changes |
| `quality:audit-nuget` | | Vulnerability + version scan |
| `quality:audit-architecture` | | Layer violation scan |

### Utility

| Command | Arguments | Description |
|---------|-----------|-------------|
| `utility:settings` | `[key] [value]` | View/modify config |
| `utility:status` | | Show pipeline state (phase, progress, last activity) |
| `utility:help` | | List all commands |
| `utility:quick` | `<task description>` | One-off task bypass |
| `utility:map-solution` | | Re-scan solution structure |

## Troubleshooting

### "DotnetPilot not initialized"

Most commands don't require initialization — just install and go. If `pipeline:next` or `utility:status` reports this, run `/DotnetPilot:pipeline:init` once per .NET solution to create the user-scoped `.planning/` directory.

### "Failed to reconnect to plugin:dotnet-pilot:roslyn"

This means the Roslyn MCP server couldn't find a `.sln` or `.slnx` file in your current directory. **dnp-roslyn only works when Claude Code is opened inside a .NET solution directory.**

To verify, run in your terminal:

```bash
dnp-roslyn doctor
```

If it shows `Solution: NOT FOUND`, you're not in a .NET project directory. Navigate to your solution directory and restart Claude Code there.

This error is harmless when browsing the plugin source or non-.NET projects — the plugin's other features (commands, agents, hooks) still work, only Roslyn-powered tools are unavailable.

### dnp-roslyn not starting

1. Verify it's installed: `dnp-roslyn version`
2. Check it can find your solution: `dnp-roslyn doctor`
3. Try starting manually: `dnp-roslyn --solution path/to/Your.slnx --verbose`
4. Check that `.mcp.json` in the plugin directory has the roslyn server configured

### "Context7 tools not available"

Context7 must be enabled at the account level in Claude Code settings, or registered as a plugin-local MCP server. Research and planning agents need it for live documentation queries.

### Hooks are too noisy

Disable individual hooks in `.planning/config.json`:
```json
{
  "hooks": {
    "di_check": false,
    "project_scope_guard": false
  }
}
```

Or use `/DotnetPilot:utility:settings hooks.di_check false`.

### Build keeps failing after execution

DotnetPilot aborts after 5 consecutive build failures. Check:
1. `dotnet build` works manually in your terminal
2. The solution file path in `.planning/config.json` is correct
3. Run `/DotnetPilot:dotnet:check-solution --fix` for auto-repair

## Roadmap

- **v0.1** — Core pipeline + agents + hooks
- **v0.2** — Roslyn MCP server: DI analysis, solution structure, file-level queries, architecture checker
- **v0.3** — Roslyn: EF Core model introspection, verbose logging to stderr
- **v0.4** — Scope narrowed to load-bearing .NET safety tools. Retired the spec-driven pipeline (`discuss`/`research`/`plan`/`execute`/`verify`) and its 5 supporting agents. Pinned model IDs, hardened hooks (version guard, labeled advisories, C# 12 primary-constructor support), added hook fixture test harness.
- **v1.1.0** — Merged `pipeline:init`, `pipeline:next`, and `utility:status` into core. User-scoped `.planning/` path (no repo pollution). Hooks resolve config from both repo-local and user-scoped locations for backward compatibility (current).
- **v1.2** — Blazor patterns and agents
- **v0.6** — MAUI/mobile support

## Author

**Nick Zdanovych** — [GitHub](https://github.com/zdanovichnick) · [zdanovichnick@gmail.com](mailto:zdanovichnick@gmail.com)

## License

MIT
