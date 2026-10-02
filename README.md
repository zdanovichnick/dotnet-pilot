# 🚀 DotnetPilot

**A .NET development assistant plugin for [Claude Code](https://claude.ai/code)**

Roslyn-backed DI verification · EF Core migration safety · Clean-architecture enforcement · Convention-aware scaffolders

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![.NET 10+](https://img.shields.io/badge/.NET-10%2B-512BD4?logo=dotnet)](https://dotnet.microsoft.com/) [![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-orange?logo=anthropic)](https://claude.ai/code) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](.)

*16 commands · 9 specialized agents · 15 skill packs · 16 Roslyn MCP tools*

---

## Quick Install

```
/plugin marketplace add zdanovichnick/dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

```
dotnet tool install -g DotnetPilot.Mcp.Roslyn   # first install
dotnet tool update  -g DotnetPilot.Mcp.Roslyn   # update to latest
```

**Strongly recommended — enable auto-update** (one-time setup). GitHub-sourced marketplaces have auto-update disabled by default; without this step you'll have to update manually each release. Add to `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "dotnet-pilot-marketplace": { "autoUpdate": true }
  }
}
```

That's it. Open Claude Code in your `.sln` / `.slnx` directory and run `/dotnet-pilot:utility:help`.

---

## Why DotnetPilot?

AI coding tools make these .NET mistakes constantly — DotnetPilot fixes them at the source:

| Without DotnetPilot | With DotnetPilot |
| --- | --- |
| Creates services, forgets DI registration | `dnp-di-wiring-checker` catches it immediately |
| Manually edits EF migration files (breaks the chain) | `add-migration` always uses `dotnet ef migrations add` |
| Puts domain models in the wrong project layer | `dnp-architect` enforces clean architecture in real time |
| Skips `dotnet build` verification | Build hook verifies after every scaffold |
| Ignores existing patterns in your codebase | Every scaffolder reads your conventions before writing code |

![health-check demo](./assets/demo-health-check.svg)

---

## 📦 Installation

### Step 1 — Install the plugin

```
/plugin marketplace add zdanovichnick/dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

![installation steps](./assets/demo-install.svg)

**Verify it worked:**

```
/dotnet-pilot:utility:help            → should list 16 commands
/dotnet-pilot:dotnet:health-check     → validates build, tests, DI, architecture
```

**Keeping it up to date.**

**Easiest:** Open the plugin manager (`/plugin` → Installed tab → `dotnet-pilot`) and click **"Update now"**. Then `/reload-plugins` to activate.

**CLI alternative:**

```
/plugin marketplace update dotnet-pilot-marketplace
/reload-plugins
```

**Auto-update** (GitHub-sourced marketplaces disable it by default). Enable once via the `/plugin` UI (Marketplaces tab → `dotnet-pilot-marketplace` → Enable auto-update), or persist it in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "dotnet-pilot-marketplace": { "autoUpdate": true }
  }
}
```

> Once the plugin lands in `claude-plugins-official`, the install collapses to `/plugin install dotnet-pilot` — auto-update on by default.

**Alternative: install from a local clone**

Use this when you cloned the repo and want to run your own build, or contribute changes.

```
# Windows  (type in Claude Code chat)
/plugin marketplace add C:\path\to\dotnet-pilot

# macOS / Linux
/plugin marketplace add /path/to/dotnet-pilot
```

Then activate:

```
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

Session-only (plugin active only while this Claude Code process is running):

```
# Windows
claude --plugin-dir "C:\path\to\dotnet-pilot"

# macOS / Linux
claude --plugin-dir "/path/to/dotnet-pilot"
```

> After editing plugin source (commands, agents, hooks), run `/reload-plugins` to pick up changes without restarting.

### Step 2 — Install the Roslyn MCP server

```
dotnet tool install -g DotnetPilot.Mcp.Roslyn   # first install
dotnet tool update  -g DotnetPilot.Mcp.Roslyn   # update to the latest release
```

The plugin's `.mcp.json` auto-starts `dnp-roslyn` when Claude Code loads. It requires a `.sln` or `.slnx` file in your working directory.

### Step 3 — Enable Context7 (recommended)

In Claude Code, enable the **Context7** MCP server at the account level — agents use it for live NuGet / ASP.NET Core / EF Core documentation.

### Step 4 — Verify

```
/dotnet-pilot:utility:help            → should list 16 commands
/dotnet-pilot:dotnet:health-check     → validates build, tests, DI, architecture
```

---

## ⚡ Quick Start

### Initialize your project (once per solution)

```
/dotnet-pilot:project:init
```

Scans your solution, detects architecture style / test framework / EF contexts, and writes `config.json` plus `solution-map.json` into a user-scoped `.planning/` directory — nothing lands in the repo.

### Create a full entity in one command

![create-entity demo](./assets/demo-create-entity.svg)

### Or go even faster with the shorthand

```
/dotnet-pilot:dotnet:create-entity Category --properties 'Name:string, SortOrder:int'
/dotnet-pilot:dotnet:scaffold api Category
/dotnet-pilot:dotnet:add-migration AddCategoryTable
```

---

## 🗺️ Architecture

![DotnetPilot architecture diagram](./assets/architecture.svg)

**Flow:** Developer invokes a `/dotnet-pilot:*` command → the command spawns the right agent → the agent calls the Roslyn MCP server for semantic C# analysis (DI completeness, architecture violations, EF Core models, symbol references). Hooks run automatically on file writes and git events, feeding advisory feedback back to the command layer — they never block by default.

> **v2.0.0 breaking change:** Commands were renamed for clarity. `pipeline:*` → `project:*`, `scaffold-*` → `create-*`, `audit-*` → `check-*`, and several others. See the tables below for full mapping.
>
> **v3.0.0 breaking change:** 13 commands and 6 agents were removed or folded into survivors. `/dotnet-pilot:utility:help` prints a "Did you mean" table mapping every old command name to its replacement; `CHANGELOG.md` has the full list.

---

## 📋 Commands

### Project — project lifecycle

| Command | Usage | What it does |
| --- | --- | --- |
| `project:init` | `/dotnet-pilot:project:init [--refresh]` | Initialize for a .NET solution — discover projects, write the user-scoped `.planning/` (`config.json`, `solution-map.json`) |
| `project:verify` | `/dotnet-pilot:project:verify [--quick]` | Verify readiness before shipping — build, tests, DI completeness, architecture check. `--quick` is the pre-commit form: adds the format check, downgrades DI/architecture to warnings |
| `project:ship` | `/dotnet-pilot:project:ship [--draft]` | Create a pull request for completed work — runs final checks and invokes `gh pr create` |

### Dotnet — scaffolding & solution management

| Command | Usage | What it does |
| --- | --- | --- |
| `dotnet:scaffold` | `scaffold [feature\|api\|service\|project] <Name> [--arch vsa\|clean\|ddd]` | Detect the solution's architecture via Roslyn, then scaffold a feature (default), an API surface over an entity (`--minimal` for minimal APIs), a service with interface + DI registration (`--lifetime`), or a new project (`--type`) |
| `dotnet:create-entity` | `create-entity <name> [--properties '...']` | Create a full entity stack: entity class, EF configuration, repository, service, and DI registration, then hand off to `dotnet:add-migration` for the migration |
| `dotnet:add-endpoint` | `add-endpoint <controller> <method> <route> [--with-dto]` | Add an endpoint to an existing controller or endpoint group |
| `dotnet:add-migration` | `add-migration <name> [--context <Name>]` | Generate an EF Core migration safely — checks for pending migrations, runs `migrations add` with `--context`, has `dnp-ef-migration-planner` inspect the generated `Up()` and removes the migration if it is destructive, then builds and emits an idempotent `migrations script` for review |
| `dotnet:tdd` | `tdd <task> [--complexity easy\|hard] [--existing <target>]` | Implement a feature using TDD — failing tests first, then production code. `--existing` adds tests to a class, file, or project that already exists without touching production code |
| `dotnet:run-tests` | `run-tests [project] [--coverage] [--filter ...]` | Run tests with coverage reporting and failure diagnosis |
| `dotnet:health-check` | `health-check [--fix]` | Validate full solution health — build, tests, NuGet, project references, DI completeness |

### Quality — safety checks

| Command | Usage | What it does |
| --- | --- | --- |
| `quality:review` | `review [--base <ref> \| --staged \| --last-commit \| --scope <glob>] [--depth quick\|standard\|deep]` | Sharded, Workflow-backed .NET review — haiku scouts per diff shard (shards validated in JS from the preflight manifest), opus confirmers per finding (routed to the specialist agent for security / performance / DI / architecture), one deterministic digest that names every coverage gap |
| `quality:check-architecture` | `/dotnet-pilot:quality:check-architecture` | Scan for clean architecture layer violations — forbidden project references, DI issues, package placement |
| `quality:security-scan` | `/dotnet-pilot:quality:security-scan` | Three-phase audit: `dotnet list package --vulnerable` → `dnp-security-auditor` OWASP scan → combined CRITICAL findings report |
| `quality:de-sloppify` | `de-sloppify [--scope path]` | Safe refactoring pass — dead code removal, naming normalization, duplication elimination. Requires tests passing first |

> `quality:review` is Workflow-backed. A Node preflight (`scripts/dnp-review-preflight.js`, Node ≥18, no deps) shards the selected diff and the command hands the manifest's shards to the workflow, which validates them in JS (falling back to per-file, then whole-diff units); haiku scouts read each shard, near-duplicate findings are merged, opus confirmers try to refute every finding against the source, and a fixed-format digest reports confirmed, refuted and unconfirmed findings plus every coverage gap — same change set, same report shape, every run. `--depth quick` stops after the scouts (≤6 agents), `standard` adds one confirmer per finding (≤11), `deep` adds four lens sweeps (≤20). Artifacts land in `${CLAUDE_PLUGIN_DATA}/review/<runId>/`; if Claude Code prompts on every run, allow the permission rule `Workflow(dnp-review)`.

### Utility — housekeeping

| Command | Usage | What it does |
| --- | --- | --- |
| `utility:help` | `/dotnet-pilot:utility:help` | Print the version banner, every command with its arguments, the agent / skill / hook rosters (each hook with its `hooks.*` toggle key), and a "Did you mean" table for command names removed in v3.0.0 |
| `utility:statusline` | `statusline [--manual]` | Install the .NET-aware statusline and wire it into `~/.claude/settings.json` (backs up any existing statusLine) |

---

## 🤖 Agents

Commands are thin orchestrators — all heavy work happens in one of these 9 agents, each with scoped tool access, a model tier, and a reasoning-effort level.

**Effort** is the second half of routing. Model tier sets *capability*; `effort:` sets how much reasoning is spent within that tier — so a mechanical check runs cheap on a capable model instead of being pushed onto a weaker one. Levels: `low` → `medium` → `high` → `xhigh` → `max`.

### Implementation

| Agent | Model | Effort | Role |
| --- | --- | --- | --- |
| `dnp-tdd-developer-easy` | Sonnet | low | Fast TDD for routine .NET tasks — writes both tests and production code following RED-GREEN-REFACTOR; also the worker behind `dotnet:scaffold` and `dotnet:add-endpoint` |
| `dnp-tdd-developer-hard` | Opus | medium | Deep TDD for complex .NET tasks — architectural decisions, ambiguous edge cases, cross-layer integration. Returns `[HALT: <question>]` instead of guessing when a design choice is underdetermined |
| `dnp-refactor-cleaner` | Sonnet | high | Dead code removal, naming normalization, duplication elimination — behavior preserved, verified by tests after each step |

### Architecture & data

| Agent | Model | Effort | Role |
| --- | --- | --- | --- |
| `dnp-architect` | Opus | high | Solution architecture, clean-arch layer enforcement, project-reference and package-placement validation; advises on architectural `[HALT` questions from `dotnet:tdd` and confirms architecture findings in `quality:review` (loads the `clean-architecture` skill) |
| `dnp-ef-migration-planner` | Sonnet | low | Plans safe EF Core migrations — detects breaking changes, validates chain integrity, targets correct DbContext (loads the `ef-core-patterns` skill) |

### Review confirmers (fast, focused)

| Agent | Model | Effort | Role |
| --- | --- | --- | --- |
| `dnp-security-auditor` | Sonnet | high | OWASP Top 10 for .NET APIs — injection, secrets exposure, auth config, CORS, dependencies, input validation; judges a single routed finding when given a focused brief |
| `dnp-performance-analyst` | Sonnet | high | Async hotspots, EF Core N+1 queries, missing `CancellationToken`, caching gaps, benchmark design; judges a single routed finding when given a focused brief |
| `dnp-di-wiring-checker` | Sonnet | low | Cross-references constructor injection against DI registrations — finds missing services and captive dependencies; judges a single routed finding when given a focused brief |
| `dnp-nuget-auditor` | Sonnet | low | Scans for vulnerable, outdated, and version-inconsistent NuGet packages across the solution |

> Agents never prompt the user. A decision an agent cannot make comes back as `[HALT: <question>]`, and the command that spawned it asks you, then re-briefs the agent with the answer. For an architectural question, `dotnet:tdd` first asks `dnp-architect` and lists its pick as the recommended option.
>
> Effort is model-gated and **unsupported on Haiku 4.5**, so every agent runs on Sonnet or Opus with an explicit `effort:`; the mechanical ones sit at `effort: low`, which is where the cost/capability trade-off Haiku was reaching for actually lives.
>
> Models are tier aliases (`opus`/`sonnet`), not dated IDs, so frontmatter tracks each tier's current default and needs no bump on a model release; the consistency check rejects anything else, because Claude Code's allowlist substitution covers aliases only.

---

## 🪝 Hooks

Hooks run automatically during Claude Code sessions. Advisory hooks warn but don't block, and they respect per-project toggle settings in `.planning/config.json`. The sync hook keeps the global `CLAUDE.md` up to date with the plugin's rule set. One hook (**Git Auto-Approve**) is non-advisory by design — it speaks the PreToolUse permission protocol to skip prompts on safe git/gh commands.

| Hook | Trigger | What it does |
| --- | --- | --- |
| **Global CLAUDE.md Sync** | On session start/resume/clear/compact | Injects/updates the DotnetPilot rule block in `~/.claude/CLAUDE.md` — replaces an existing block only when the plugin version is newer, and never rewrites an unparseable `settings.json`. Toggle `hooks.sync_global_claude_md: false` to disable |
| **Git Auto-Approve** | Before `git`/`gh` commands from the Bash tool | Returns `permissionDecision: allow` for single git/gh commands that pass a per-subcommand allowlist (status/diff/log/add/commit/branch/switch/push, read-only `gh pr`/`run`/`issue`/`repo` verbs, `gh pr create`, one exact heredoc-commit shape) so commit + PR run without a prompt. Falls through to the normal prompt for chained, multi-line or redirected commands; `$`, globs, braces or backslashes anywhere; force pushes and ref deletion; `--output`, `--ext-diff`, `-c`; `reset`/`restore`/`clean`, `checkout` other than `-b`, `git config`, `gh api`, `--no-verify` commits; and anything from the PowerShell tool. Toggle `hooks.git_autoapprove: false` to disable |
| **DI Registration Check** | After writing/editing `.cs` files | New services missing DI registration |
| **Migration Guard** | Before writing/editing migration files | Warns when manually editing EF migration files |
| **Project Scope Guard** | After writing/editing any file | Warns when editing outside the current phase's focused projects (`<Project>.Tests` counts as inside); at most one advisory per project per hour |
| **Build Verify** | After `dotnet build` / `dotnet test` runs — including ones that exit non-zero | Classifies the output by text markers, so builds piped through `2>&1 \| grep` still count; records consecutive failures in the per-solution state the statusline `BUILD ✗` segment reads; warns at 3, escalates at 5; a green run resets it. Toggle `hooks.build_verify: false` to disable |
| **Stop Verify** | When Claude is about to stop after editing `.cs`/`.csproj`/`.razor` files | If the tree has uncommitted source changes and no green `dotnet build`/`dotnet test` was recorded since the last edit, nudges with the exact commands to run before reporting done. Advisory; set `hooks.stop_verify_block: true` to make it block instead. Toggle `hooks.stop_verify: false` to disable |
| **Subagent Result** | When a `dnp-*` agent finishes | Surfaces `[HALT: …]`, `[PARTIAL …]` and `[ROUTING: …]` verdicts as a system message so a halted or truncated worker is not silently absorbed. Toggle `hooks.subagent_result: false` to disable |
| **Post-Edit Format** | After Write/Edit/MultiEdit on `.cs` files | Runs `dotnet format --include <file>` on the nearest project; skips `obj/`, `bin/`, `Migrations/`, generated files |
| **Commit Format** | Before `git commit` (Bash or PowerShell tool) | Enforces `type(scope): message` conventional commit format |
| **Priority Router** | Before spawning an Agent | Detects .NET projects and injects DotnetPilot agent routing priority over generic equivalents; also steers C# code inspection to `mcp__roslyn__` over `mcp__*code-analyzer__`. Toggle `hooks.dotnet_priority: false` to disable |
| **Code-Analyzer Redirect** | Before a `code-analyzer` MCP tool call | When the call targets C# (a `.cs` file, a .NET `project_path`, or a .NET cwd), nudges toward the C#-aware `mcp__roslyn__` tools — the Python/TS/JS code-analyzer has no C# support. Advisory only; never blocks. Toggle `hooks.code_analyzer_redirect: false` to disable |
| **Build-failure toasts** *(mod)* | After `dotnet build` / `dotnet test` through the Bash or PowerShell tool | Same classification as Build Verify; shows a toast at the 3rd and 5th consecutive failure. Needs a Claude Code build with mod support; additive to the Node hook. Toggle plugin option `build_status` |
| **Routing roster** *(mod)* | Each system-prompt composition | In a .NET project, adds the routing guidance once per session as a session-scoped section. Needs mod support. With it active, set `hooks.dotnet_priority: false` to drop the per-`Agent` nudge. Toggle plugin option `routing` |
| **Statusline Sync** | On session start/resume/clear/compact | Refreshes the installed statusline script at `~/.claude/dnp-statusline.js` when the plugin ships a newer version. Only wires `~/.claude/settings.json` when `statusline.auto_enable: true` (default off) — never clobbers an existing statusLine without opt-in |

---

## 📊 Statusline

A compact, .NET-aware statusline. Install it with `/dotnet-pilot:utility:statusline`:

- **Line 1 (always):** `🤖 <model> │ ⚡ EFF <effort>[ (set: <configured>)] │ 🧠 <bar> <pct>% · <tokens> │ 🌿 <branch> ✚<dirty> ↑<ahead>↓<behind> │ ⏱ <elapsed> │ 💰 $<cost>`
- **Line 2 (only inside a .NET solution):** `📦 SLN <name> │ 🎯 TFM <framework> │ ❌ BUILD <n>x`
- **Line 3 (only inside a .NET solution):** `💡 TIP <rotating DotnetPilot command hint>` — a slowly-rotating pointer to the plugin's commands, for discovery

Every segment carries an emoji icon and a saturated color on its **value** (labels stay dim), so the data reads before the scaffolding. Three segments are threshold-colored rather than fixed: the 🧠 context bar and percentage (green → yellow → red past 50 / 75 / 90%), the ⚡ effort level (dim `low` up to bold red `max`), and the 💰 cost (green → yellow → red past \$2 / \$10). Set `NO_COLOR` for plain text.

`⚡ EFF <effort>` shows the **live per-turn** reasoning-effort level (`low`/`medium`/`high`/`xhigh`/`max`) when Claude Code pipes it — it reflects mid-session `/effort` changes and the resolved level under `auto` (not a static config value), and is color-coded by level (brightest at the top of the scale) so a change is obvious at a glance; omitted when the model doesn't support effort. When the level you configured is not the one in force, a yellow `(set: <configured>)` suffix names it — e.g. `EFF high (set: xhigh)`.

`BUILD ✗ Nx` reflects the same failure state the **Build Verify** hook records (so it also surfaces `dotnet test` failures); absence means "no recent failure recorded", not a guaranteed green build.

Claude Code plugins cannot register a `statusLine` directly, and `${CLAUDE_PLUGIN_ROOT}` is not expanded in statusLine command strings — so the command installs the script to a stable path (`~/.claude/dnp-statusline.js`) and points `settings.json` at it. It detects and backs up any existing statusLine before replacing (or run with `--manual` to print the snippet instead). To activate automatically every session, set `statusline.auto_enable: true` in `.planning/config.json`; it coexists with — never silently replaces — another statusline unless you opt in. Honors `NO_COLOR`.

---

## 📚 Skill Packs

Skills are on-demand knowledge packs loaded by agents when needed — they encode .NET conventions that would otherwise require repeated prompting. Every `SKILL.md` carries a `when_to_use:` line so the right one loads on trigger, and the three largest (`authentication`, `caching`, `resilience`) keep their detail in `references/*.md` files loaded one at a time.

| Skill | What it teaches |
| --- | --- |
| `aspnet-api-patterns` | Minimal APIs, controller patterns, `IExceptionHandler` + `AddProblemDetails`, built-in `AddOpenApi`, Asp.Versioning |
| `ef-core-patterns` | DbContext design, migrations, query optimization, owned entities |
| `testing-dotnet` | xUnit conventions, NSubstitute, `WebApplicationFactory` over Testcontainers, test tiers, mock fidelity |
| `clean-architecture` | Layer rules, project layout, dependency direction, shared kernel |
| `dotnet-project-init` | Solution setup, NuGet config, CI scaffolding |
| `modern-csharp` | C# 12–14 gotchas: `field` keyword, extension members, null-conditional assignment, span conversions, async and cancellation |
| `error-handling` | The single `Result<TValue,TError>` definition, RFC 9457 `ProblemDetails`, `IProblemDetailsService`-backed global handler, exception boundaries |
| `resilience` | Polly v8 `ResiliencePipelineBuilder`, retry, circuit breaker, timeout, hedging, `IHttpClientFactory` |
| `caching` | `HybridCache` (.NET 9+), `IOutputCache`, cache-aside, `IMemoryCache`, typed cache keys |
| `authentication` | JWT bearer, ASP.NET Identity, OIDC, policy-based auth, `IAuthorizationHandler` |
| `vertical-slice` | Feature folders, `IEndpointGroup`, endpoint filters, no shared base classes |
| `ddd` | `AggregateRoot<TId>`, value objects (`ComplexProperty` mapping), strongly-typed IDs, domain events via `TimeProvider`, repository-placement variants |
| `convention-learner` | 6-step protocol: detect naming, folder structure, DI style, test framework, DTO style, error handling before writing any code |
| `logging` | Serilog setup, message templates (not interpolation), `LogContext`, request logging, PII rules |
| `opentelemetry` | `ActivitySource`, `IMeterFactory`, OTLP config, Aspire `AddServiceDefaults()`, Serilog correlation |

---

## 📖 Use Cases

**1. Scaffold a CRUD entity end-to-end in 30 seconds**

```
> /dotnet-pilot:dotnet:create-entity Category --properties 'Name:string, Description:string?, SortOrder:int'

Created 9 files:
  src/ECommerce.Domain/Entities/Category.cs
  src/ECommerce.Infrastructure/Configurations/CategoryConfiguration.cs
  src/ECommerce.Infrastructure/Data/ApplicationDbContext.cs        (added DbSet<Category>)
  src/ECommerce.Application/Interfaces/ICategoryRepository.cs
  src/ECommerce.Infrastructure/Repositories/CategoryRepository.cs
  src/ECommerce.Application/Interfaces/ICategoryService.cs
  src/ECommerce.Application/Services/CategoryService.cs
  src/ECommerce.Api/Extensions/ServiceCollectionExtensions.cs      (2 DI registrations added)
  Migration: 20260420_AddCategoryTable

Build: PASS · Tests: PASS · DI: PASS

> /dotnet-pilot:dotnet:scaffold api Category

Created 4 files:
  src/ECommerce.Api/DTOs/CreateCategoryRequest.cs
  src/ECommerce.Api/DTOs/CategoryResponse.cs
  src/ECommerce.Api/Controllers/CategoriesController.cs
  src/ECommerce.Api/Validators/CreateCategoryRequestValidator.cs

Build: PASS
```

**2. Safely migrate a project with multiple DbContexts**

```
> /dotnet-pilot:dotnet:add-migration AddCompanyNameToTenant


Multiple DbContexts detected. Which one?
  1. ApplicationDbContext (Infrastructure, 12 entities)
  2. TenantDbContext (Infrastructure, 4 entities)
→ 2

Checking for breaking changes...
  Analysis: Adding nullable column CompanyName — safe, no data loss.
  Chain: 7 existing migrations, chain valid.

Running: dotnet ef migrations add AddCompanyNameToTenant
  --project src/ECommerce.Infrastructure
  --startup-project src/ECommerce.Api
  --context TenantDbContext

Build: PASS · Dry run: PASS
Committed: feat(Infrastructure): add migration AddCompanyNameToTenant
```

**3. Catch architecture violations before they ship**

```
> /dotnet-pilot:quality:check-architecture

Architecture Audit: ECommerce.slnx
  Style: clean

  Violations (1):
    [ERROR] ECommerce.Domain → ECommerce.Infrastructure
            Domain should not reference Infrastructure.
            Fix: Move the shared helper to Domain, or create an interface
            in Application that Infrastructure implements.
```

**4. Find and fix missing DI registrations**

```
> /dotnet-pilot:dotnet:health-check

  DI Wiring:    FAIL (15 services, 2 missing)

  Missing:
    IPaymentGateway      → consumed by OrderService (Application/Services/OrderService.cs:14)
    INotificationService → consumed by OrderCompletedHandler (Application/Handlers/...:9)

> /dotnet-pilot:dotnet:health-check --fix

  Fixed ServiceCollectionExtensions.cs:
    + services.AddScoped<IPaymentGateway, StripePaymentGateway>();
    + services.AddScoped<INotificationService, EmailNotificationService>();

  DI Wiring:    PASS (17 services, 0 missing)
```

**5. Pre-commit quality gate**

```
> /dotnet-pilot:project:verify --quick

  [PASS] Build:        0 errors
  [PASS] Tests:        72 passed
  [WARN] Format:       2 files need formatting
  [PASS] DI Wiring:    all services registered
  [PASS] Architecture: no violations

  Ready to commit. Run `dotnet format` to fix formatting issues.
  git status: 3 files modified, 1 untracked
```

**6. Deep code review before a PR merge**

```
> /dotnet-pilot:quality:review --depth deep


  [HIGH]   UserService.cs:45
           Async method calls .Result on a Task — deadlocks under ASP.NET Core.
           Fix: await the call instead.

  [HIGH]   UsersController.cs:28
           SQL injection: string interpolation in LINQ query with user input.
           Fix: use parameterized queries or LINQ expressions.

  [MEDIUM] OrderRepository.cs:62
           N+1 query: .Include() inside a loop. Use eager loading outside.

  [LOW]    OrderService.cs:15
           ILogger injected but never used. Remove or add error-path logging.

  4 issues found: 2 high · 1 medium · 1 low
```

---

## ⚙️ Configuration

After `/dotnet-pilot:project:init`, configuration lives at `~/.claude/projects/<flat-repo-path>/.planning/config.json`.

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
    "post_edit_format": true,
    "commit_format": true
  },
  "statusline": {
    "auto_enable": false
  },
  "workflow": {
    "build_after_task": true,
    "test_after_task": true,
    "di_check_on_write": true
  }
}
```

Edit the file directly; `hooks/_lib/config.js` in the plugin is the authoritative list of keys it reads.

| Setting | Change to | Reason |
| --- | --- | --- |
| `hooks.di_check` | `false` | DI advisory is too noisy for your workflow |
| `hooks.project_scope_guard` | `false` | You routinely edit across multiple projects at once |
| `hooks.commit_format` | `false` | Skip conventional-commit enforcement |
| `statusline.auto_enable` | `true` | Auto-install + wire the .NET statusline every session (backs up any existing statusLine once) |
| `workflow.build_after_task` | `false` | Skip automatic build after every scaffold |

---

## 🔬 What the Roslyn MCP Server provides

`dnp-roslyn` gives DotnetPilot semantic understanding of your C# code — not regex guessing.

| Tool | What it does |
| --- | --- |
| `get_solution_structure` | Projects, references, frameworks, document counts |
| `get_class_outline` | Member signatures (no bodies) for a class |
| `get_method_body` | Full source of a specific method/constructor/property |
| `find_references` | Cross-solution symbol references |
| `find_implementations` | Interface/abstract class implementations |
| `find_di_registrations` | All service registrations (`AddScoped`, `AddTransient`, etc.) |
| `find_di_consumers` | All constructor-injected types |
| `check_di_completeness` | Missing registrations + captive dependency detection |
| `check_architecture_violations` | Clean architecture layer rule enforcement |
| `get_ef_models` | DbContexts, entities, properties, navigations |
| `find_symbol` | Locate any type, method, or property by name across the solution |
| `find_callers` | Find all callers of a specific method (call graph, not text search) |
| `find_dead_code` | Identify unreferenced types and members — confidence-scored by accessibility |
| `detect_antipatterns` | Syntax-level scan: `async void`, `.Result`/`.Wait()`, `new HttpClient()`, log interpolation, `Thread.Sleep`, missing `CancellationToken`, broad `catch (Exception)`, `DateTime.Now` |
| `detect_circular_dependencies` | DFS cycle detection across project reference graph |

> Without dnp-roslyn, DI checking falls back to regex-based hooks (less accurate). Roslyn tools only activate when Claude Code is opened inside a `.sln` / `.slnx` directory.

---

## 🚫 What DotnetPilot does NOT do

DotnetPilot deliberately avoids wrapping stock Claude Code capabilities — use them directly:

| Task | Native Claude Code alternative |
| --- | --- |
| Multi-step planning | **Plan Mode** (`EnterPlanMode`) + `TaskCreate` |
| General code review | Stock `code-reviewer` agent |
| Security audit | Stock `/security-review` command |
| Library research | Context7 MCP or `WebSearch` |
| Tracking work within a conversation | `TaskCreate` / `TaskUpdate` |
| Gathering user intent | Claude Code's built-in question prompt — from the command layer only; agents return `[HALT: <question>]` |
| Initial CLAUDE.md | Stock `/init` |

DotnetPilot wins only for **.NET-specific behavior**: Roslyn semantics, EF migration chains, DI wiring across project boundaries, clean-architecture layer rules, and scaffolders that match your existing project conventions.

---

## 🔍 Troubleshooting

**"Failed to reconnect to plugin:dotnet-pilot:roslyn"**

`dnp-roslyn` couldn't find a `.sln` or `.slnx` file in the current directory. Navigate to your solution directory and restart Claude Code there.

```
dnp-roslyn doctor    # shows solution detection status
```

**"DotnetPilot not initialized"**

Every command works without init. Run `/dotnet-pilot:project:init` once if you want the cached `solution-map.json` and per-project hook toggles.

**Hooks are too noisy**

```json
{ "hooks": { "di_check": false, "project_scope_guard": false } }
```

**Build keeps failing after scaffolding**

DotnetPilot aborts after 5 consecutive build failures. Check that `dotnet build` works manually, then run `/dotnet-pilot:dotnet:health-check --fix` for auto-repair.

**Commands missing after update (e.g. `dotnet:tdd` not found)**

Claude Code caches the plugin at install time. After a major version update, new command files may not appear until the cache is refreshed.

**Option 1 — UI (easiest):** `/plugin` → Installed → `dotnet-pilot` → **"Update now"** → `/reload-plugins`

**Option 2 — short CLI reset:**

```
/plugin uninstall dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

**Option 3 — full reset** (if Options 1 & 2 don't work):

```
/plugin uninstall dotnet-pilot
/plugin marketplace remove dotnet-pilot-marketplace
/plugin marketplace add zdanovichnick/dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

Verify: `/dotnet-pilot:utility:help` — should list 16 commands including `dotnet:tdd`, `dotnet:scaffold`, and `quality:security-scan`.

**"Context7 tools not available"**

Context7 must be enabled at the account level in Claude Code settings.

---

## 📅 Roadmap

| Version | Status | Changes |
| --- | --- | --- |
| v0.1 | ✅ shipped | Core pipeline + agents + hooks |
| v0.2 | ✅ shipped | Roslyn MCP server: DI analysis, solution structure, file-level queries, architecture checker |
| v0.3 | ✅ shipped | Roslyn: EF Core model introspection, verbose stderr logging |
| v1.0.0 | ✅ shipped | Scope narrowed; retired spec-driven pipeline; pinned model IDs; hardened hooks; hook test harness |
| v1.1.0 | ✅ shipped | `pipeline:init/next/status` merged to core; `pipeline:verify` added; user-scoped `.planning/` path; planner & architect upgraded to Opus 4.7; plugin published to Claude Platform as `dotnet-pilot` |
| v2.0.0 | ✅ shipped | **Breaking:** 12 commands renamed for clarity (`pipeline:*` → `project:*`, `scaffold-*` → `create-*`, `audit-*` → `check-*`, and others). New: a test-generation command and `dotnet:tdd` (21 → 23). New: global `CLAUDE.md` sync hook auto-injects .NET code-style rules on plugin install/update (5 → 6 hooks). Marketplace version synced. |
| v2.1.1 | ✅ shipped | New: `.NET priority routing` hook — auto-detects .NET projects and injects DotnetPilot agent routing priority before generic agents are spawned (6 → 7 hooks). |
| v2.2.0 | ✅ shipped | **Major content expansion.** +10 skills (modern C#, error handling, resilience, caching, auth, VSA, DDD, convention learner, logging, OpenTelemetry). +9 knowledge docs (anti-patterns, package recommendations, common infrastructure snippets, breaking changes, 5 ADRs). +4 agents (build-error-resolver, security-auditor, performance-analyst, refactor-cleaner). +5 commands (scaffold, security-scan, de-sloppify, a build-repair loop, a pre-commit gate). +5 templates (web-api, modular-monolith, blazor-app, worker-service, class-library). Post-edit auto-format hook. |
| v2.2.1 | ✅ shipped | **Fix:** ship the 5 Roslyn MCP tools that were referenced by agents but never implemented — `find_symbol`, `find_callers`, `find_dead_code`, `detect_antipatterns`, `detect_circular_dependencies`. Roslyn server bumped to `0.5.0`. Tool count 10 → 15. |
| v2.2.2 | ✅ shipped | **Model routing:** every agent switched from pinned/dated model IDs to tier aliases (`opus`/`sonnet`/`haiku`) so frontmatter auto-tracks each tier's current default and needs no bump on future model releases (e.g. Opus 4.8). Synced the model columns in `README.md` and `CLAUDE.md`, the command delegate-notes, and the architecture diagram. Also adds a Git rule to the injected global `CLAUDE.md` — fetch `CODEOWNERS` reviewers when opening PRs. |
| v2.3.0 | ✅ shipped | New: `Git Auto-Approve` hook — returns `permissionDecision: allow` for safe single `git`/`gh` commands (status/diff/log/add/commit/branch/push, `gh pr create`, heredoc commit) so commit + PR skip the permission prompt (7 → 8 hooks). Plus doc-drift fixes and hook robustness hardening. |
| v2.4.0 | ✅ shipped | **.NET-first tooling priority.** New `Code-Analyzer Redirect` advisory hook + extended `Priority Router` steer C# code inspection to `mcp__roslyn__` over kouhesion's Python `code-analyzer` (which has no C# support); adds a `.NET-First Tooling Priority` rule to the injected global `CLAUDE.md`; shared `_lib/dotnet.js` detection (with parent walk-up); both priority hooks are now config-toggleable (8 → 9 hooks). |
| v2.5.0–2.5.3 | ✅ shipped | **.NET-aware statusline.** New `statusline/dnp-statusline.js` (model, context, git, elapsed, cost + a .NET line with solution / TFM / build-fail count) plus the `dnp-statusline-sync` SessionStart hook and `/dotnet-pilot:utility:statusline` installer (9 → 11 hooks). Added the reasoning-effort segment, colour-coded it by level, and fixed a `sha1(cwd)` build-fail state collision shared with `dnp-build-verify`. |
| v2.6.0 | ✅ shipped | **Effort-aware routing + Fable advisor.** Every agent and command now carries an explicit `effort:` level, so reasoning spend is routed independently of model tier. The 6 Haiku agents moved to **Sonnet + `effort: low`** — effort is unsupported on Haiku 4.5, so the old pairing would have been a silent no-op. New Fable-5 read-only advisor agent (ADVISE / UNBLOCK / ADJUDICATE) for decision-point consults (14 → 15 agents; removed in v3.0.0). Statusline now renders `⚙ <active>≠<configured>` when the configured effort level is not actually in force — the failure mode that made a stale `CLAUDE_CODE_EFFORT_LEVEL` pin look like a statusline bug. |
| v2.7.0 | ✅ shipped | **Statusline restyle.** The effort segment drops the double-width `⚙` glyph for an `EFF` label, and its configured-level mismatch now reads as a spelled-out `(set: <configured>)` instead of a cramped `≠<configured>`. Every segment gained an emoji icon and a saturated **value** color (labels stay dim), context usage renders as a threshold-colored 10-cell bar, and cost/context/effort now ramp green → yellow → red with pressure — following the icon + progress-bar style of the [official statusline docs](https://code.claude.com/docs/en/statusline). **Context-engineering pass for Claude 5.** The two TDD agents shed 680 lines of guardrail scaffolding — anti-rationalization tables, epistemic-gate and predict-first protocols, `LLM-1..6` self-verification checklists, and six pages of few-shot ideal-output transcripts — keeping the .NET gotchas that the model can't infer. Test-tier selection, mock-fidelity rules, and boundary-coverage tables moved into the `testing-dotnet` skill, loaded on demand instead of inlined. The global `CLAUDE.md` rules block lost a live contradiction ("prefer explicit types" vs "always use `var`") and its duplicated .NET style sections. `dnp-dotnet-priority` stopped re-injecting the 16-line agent roster on every `Agent` call — Claude Code already surfaces agent descriptions. Command references corrected from the never-valid `/DotnetPilot:` prefix to `/dotnet-pilot:` (109 occurrences). New **Comments** rule in the injected global block — default to none, and a comment earns its place only where the code cannot say the thing itself; the test-writer agent's example test dropped its `// Arrange` / `// Act` / `// Assert` labels, which had been demonstrating the opposite of the stated convention. |
| v3.0.0 | ✅ shipped | **Breaking: pruned to what gets used, then modernized.** 29 → 16 commands — the project/service/API scaffolders folded into `dotnet:scaffold` modes, test generation into `dotnet:tdd --existing`, the pre-commit gate into `project:verify --quick`; the rest removed, with `utility:help` printing a "Did you mean" table for every old name. 15 → 9 agents (planner, verifier, Fable advisor, API scaffolder, build-error resolver, test writer removed; scaffolding now routes to `dnp-tdd-developer-easy`). Agents no longer prompt — they return `[HALT: <question>]` and the command asks; frontmatter dropped the scoped `Bash` form and permission-mode keys plugin subagents never honored. Side-effect commands (`init`, `ship`, `statusline`, `add-migration`) carry `disable-model-invocation`. Skills: Blazor placeholder removed, `when_to_use:` on all 15, `authentication`/`caching`/`resilience` split into `SKILL.md` + `references/`, `testing-dotnet` moved to NSubstitute + Testcontainers. The injected global rules block was cut to what hooks don't already enforce. Hooks: a shared build-state library, a Stop-time verification hook, a subagent-result hook, hardened git auto-approve, array-shaped `solution-map.json` in the scope guard, and a consistency checker + GitHub Actions CI over the hook harness. `quality:review` became Workflow-backed (triage → scout → confirm → report). `CHANGELOG.md` added; `plugin.json` gained `displayName`. |
| v3.1.0 | ✅ shipped | **Fable for architecture judgment.** `dnp-architect` runs on `fable` at `effort: xhigh`; `quality:review` routes architecture findings to it at `standard`+ depth, and `dotnet:tdd` consults it before surfacing an architectural `[HALT]`, listing its pick as the recommended option. `utility:help` prints the version banner, every command's arguments and the agent / skill / hook rosters. The consistency check rejects any `model:` that is not a family alias. The injected `## Comments` rule leads with minimum, critical-only comments; the hook harness README diagrams its run loop and the hook event contract. |
| v3.2.0 | ✅ shipped | **Opus 5.5 for judgment.** `dnp-architect` moves from `fable`/`xhigh` to `opus`/`high` and `dnp-tdd-developer-hard` from `sonnet`/`high` to `opus`/`medium`; every `quality:review` confirmer runs on `opus`. Opus 5.5 matches Fable 5.1 on most work at 40% of the price, its default `medium` effort beats Opus 5 at `high`, and it reports fewer false positives in code review — so Fable is no longer a requirement. Thin orchestrator commands drop to `effort: medium`. The statusline reads `modelSettings[<model>].effortLevel` and no longer reports a user-level top-level `effortLevel` as configured on Opus 5.5 and later, where Claude Code ignores it. Also hardens `dnp-git-autoapprove` (per-subcommand allowlist; closes heredoc, `--output`, force-push and `gh` bypasses), stops the sync hooks from rewriting an unparseable `settings.json`, drops the review workflow's triage agent, makes `add-migration` inspect before it keeps a migration, and corrects stale samples across the skills. |
| v3.3.0 | ✅ shipped | **First mod.** A Claude Code mod (`hooks/mods/`) adds build-failure toasts at the 3rd/5th consecutive `dotnet build`/`dotnet test` failure and appends the .NET routing guidance to the system prompt once per session. Additive: the Node hooks remain for builds without mod support. Toggle with the `build_status` and `routing` plugin options. |
| v3.4 | 🔜 backlog | MAUI / mobile support |

---

## Requirements

| Dependency | Version | Purpose |
| --- | --- | --- |
| [Claude Code](https://claude.ai/code) | Latest | AI coding assistant (CLI, desktop, or IDE) |
| [.NET SDK](https://dotnet.microsoft.com/) | 10+ | Your .NET project must build |
| [Node.js](https://nodejs.org/) | 18+ | Hooks are JS scripts executed by Claude Code |
| [dnp-roslyn](https://github.com/zdanovichnick/dotnet-pilot-mcp-roslyn) | v0.3+ | Roslyn MCP for semantic C# analysis |
| [Context7](https://github.com/upstash/context7) | latest | Live library docs for the agents (recommended) |
| [jq](https://jqlang.github.io/jq/) | any | Better JSON parsing in commit-format hook (optional) |
| [GitHub CLI](https://cli.github.com/) | any | Required only for `project:ship` (optional) |

**.NET SDK**
```
winget install Microsoft.DotNet.SDK.10   # Windows
brew install dotnet-sdk                  # macOS
sudo apt-get install -y dotnet-sdk-10.0  # Ubuntu/Debian
```

**Node.js**
```
winget install OpenJS.NodeJS   # Windows
brew install node              # macOS
sudo apt-get install -y nodejs # Ubuntu/Debian
```

**dnp-roslyn**
```
dotnet tool install -g DotnetPilot.Mcp.Roslyn
dotnet tool update  -g DotnetPilot.Mcp.Roslyn
dnp-roslyn version
```

**jq (optional)**
```
winget install jqlang.jq   # Windows
brew install jq            # macOS
sudo apt-get install -y jq # Ubuntu/Debian
```

**GitHub CLI (optional)**
```
winget install GitHub.cli  # Windows
brew install gh            # macOS
sudo apt-get install -y gh # Ubuntu/Debian
```

---

**[Nick Zdanovych](https://github.com/zdanovichnick)** · <zdanovichnick@gmail.com>

MIT License · © 2026