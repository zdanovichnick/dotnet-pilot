# DotnetPilot

**.NET workflows for Claude Code, Codex, and Cursor.**

Build features that follow your solution's conventions. Check dependency injection,
review architecture boundaries, and generate EF Core migrations with Roslyn-backed analysis.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![.NET 10+](https://img.shields.io/badge/.NET-10%2B-512BD4?logo=dotnet)](https://dotnet.microsoft.com/download)
[![Plugin packages](https://github.com/zdanovichnick/dotnet-pilot/actions/workflows/host-plugins.yml/badge.svg)](https://github.com/zdanovichnick/dotnet-pilot/actions/workflows/host-plugins.yml)

[Install](#install) · [First steps](#first-steps) · [Compatibility](#compatibility) · [Workflows](#workflows) · [Troubleshooting](#troubleshooting)

## Install

Choose your app below. All three use the same Roslyn companion.

**Jump to:** [Claude Code](#claude-code) · [Codex](#codex) · [Cursor](#cursor)

### 1. Install the Roslyn companion

With the **.NET 10 SDK** installed, run this in your terminal:

```sh
dotnet tool install -g DotnetPilot.Mcp.Roslyn
```

Already installed? Use `dotnet tool update -g DotnetPilot.Mcp.Roslyn` instead.
Restart your coding app if you just installed the SDK or changed PATH.

### 2. Install for your app

#### Claude Code

Run these commands **in Claude Code chat**:

```text
/plugin marketplace add zdanovichnick/dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

Open your .NET solution directory and run:

```text
/dotnet-pilot:project:init
/dotnet-pilot:dotnet:health-check
```

Use `/dotnet-pilot:utility:help` to see all commands. Node.js 18+ is required for hooks.

<details>
<summary>Updates and local development</summary>

In `/plugin`, open the installed DotnetPilot plugin and choose **Update now**, then run
`/reload-plugins`. Enable auto-update for `dotnet-pilot-marketplace` in the marketplace
settings if you want automatic updates.

To refresh the marketplace manually:

```text
/plugin marketplace update dotnet-pilot-marketplace
/reload-plugins
```

For a session using a local clone, run in your terminal:

```sh
claude --plugin-dir "/absolute/path/to/dotnet-pilot"
```

</details>

#### Codex

Use a recent **Codex CLI**, Git, and Node.js 18+. Run in your terminal:

```sh
git clone https://github.com/zdanovichnick/dotnet-pilot.git
cd dotnet-pilot
node scripts/build-host-plugins.js
codex plugin marketplace add ./dist/plugins/codex
codex plugin add dotnet-pilot@dotnet-pilot-marketplace
```

Already cloned this repository? Run the last three commands from its root.

Start a **new local chat in your .NET solution directory**, then invoke:

```text
$dnp-project-init
$dnp-dotnet-health-check
```

Use `$dotnet-pilot` to browse workflows. If skill names are namespaced, select the
corresponding DotnetPilot skill in the picker. Keep the clone and generated marketplace
folder available for updates.

**Verified:** local marketplace registration and installation through Codex CLI on Windows.
Desktop workflow checks are pending. See the [Codex setup guide](docs/HOST-PLUGINS.md#install-in-codex).
Use the CLI or desktop app for plugins; the Codex IDE extension does not support them.

#### Cursor

Use Git and Node.js 18+. Build the package in your terminal:

```sh
git clone https://github.com/zdanovichnick/dotnet-pilot.git
cd dotnet-pilot
node scripts/build-host-plugins.js
```

Already cloned? Run only the build command from its root. Then install the generated
folder using the instructions for your operating system.

<details open>
<summary>Windows — PowerShell</summary>

```powershell
$cursorPlugins = Join-Path $env:USERPROFILE ".cursor/plugins/local"
New-Item -ItemType Directory -Path $cursorPlugins -Force | Out-Null
Copy-Item -LiteralPath "./dist/plugins/cursor/dotnet-pilot" -Destination $cursorPlugins -Recurse
```

</details>

<details>
<summary>macOS / Linux</summary>

```sh
mkdir -p "$HOME/.cursor/plugins/local"
cp -R ./dist/plugins/cursor/dotnet-pilot "$HOME/.cursor/plugins/local/"
```

</details>

Restart Cursor, open your .NET solution directory, and check **Customize** for DotnetPilot
and its Roslyn MCP server. Choose these commands from the command picker:

```text
/dnp-project-init
/dnp-dotnet-health-check
```

**Status:** the package is generated and validated; interactive Cursor verification is pending.
See the [Cursor setup guide](docs/HOST-PLUGINS.md#install-in-cursor) for updates.

<details>
<summary>Codex / Cursor: download a package instead of building</summary>

Open the [plugin package builds](https://github.com/zdanovichnick/dotnet-pilot/actions/workflows/host-plugins.yml),
choose a successful run, and download `dotnet-pilot-codex` or `dotnet-pilot-cursor`
from **Artifacts**. Extract the archive, including its dot-prefixed folders.

For **Codex**, register the extracted marketplace directory, then install:

```sh
codex plugin marketplace add "/absolute/path/to/extracted/dotnet-pilot-codex"
codex plugin add dotnet-pilot@dotnet-pilot-marketplace
```

That directory must contain `.agents/plugins/marketplace.json` and `dotnet-pilot/`.

For **Cursor**, copy the extracted `dotnet-pilot/` folder to
`~/.cursor/plugins/local/dotnet-pilot`, then restart Cursor.

This route skips Git and Node.js for package building. The .NET SDK and Roslyn companion
are still required. These are local packages; public marketplace submissions are pending.

</details>

### 3. Check your solution

The app should open in a directory containing your `.sln` or `.slnx` file. The plugin
starts the Roslyn server automatically; you do not need to launch it separately.

Run the health-check workflow for your app. Confirm the report shows which build, test,
DI, and architecture checks ran. If semantic tools are unavailable, the workflows can use
file inspection and .NET CLI fallbacks and should report skipped semantic checks.

## First steps

Initialize once per solution, then use the workflow that matches your task:

| Task | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| Discover the solution | `/dotnet-pilot:project:init` | `$dnp-project-init` | `/dnp-project-init` |
| Check solution health | `/dotnet-pilot:dotnet:health-check` | `$dnp-dotnet-health-check` | `/dnp-dotnet-health-check` |
| Create an entity | `/dotnet-pilot:dotnet:create-entity` | `$dnp-dotnet-create-entity` | `/dnp-dotnet-create-entity` |
| Generate a migration | `/dotnet-pilot:dotnet:add-migration` | `$dnp-dotnet-add-migration` | `/dnp-dotnet-add-migration` |
| Implement with TDD | `/dotnet-pilot:dotnet:tdd` | `$dnp-dotnet-tdd` | `/dnp-dotnet-tdd` |
| Verify before shipping | `/dotnet-pilot:project:verify` | `$dnp-project-verify` | `/dnp-project-verify` |

Pass your request after the workflow name. For example, in Codex:

```text
$dnp-dotnet-create-entity Category --properties 'Name:string, SortOrder:int'
$dnp-dotnet-scaffold api Category
$dnp-dotnet-add-migration AddCategoryTable --context ApplicationDbContext
```

Entity scaffolding and migration generation are separate steps. Review the generated
migration and SQL before applying a database change.

![Entity scaffolding example in Claude Code](assets/demo-create-entity.svg)

## Compatibility

| Capability | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| 15 .NET pattern skills | Included | Included | Included |
| Core workflows | 13 commands | 13 workflow skills | 13 commands + workflow skills |
| Nine specialist roles | Native agents | Reference checklists | Checklists + native agents |
| Roslyn MCP configuration | Included | Included | Included |
| Build, test, DI, migration checks | Workflow steps + hooks | Explicit workflow steps | Explicit workflow steps |
| Sharded review, help, statusline commands | Included | — | — |
| Automatic hooks and UI mods | Included | — | — |
| Validation status | Existing plugin and hook suite | Package + local CLI install tested | Package validated; app testing pending |

The Codex and Cursor packages use the host's tools and model. They execute specialist
checklists directly by default. Claude-specific tool permissions, model routing, hooks,
and UI features are not installed in those packages.

[Installation details, state configuration, and publication requirements →](docs/HOST-PLUGINS.md)

## Why DotnetPilot?

| When you need to… | DotnetPilot helps you… |
| --- | --- |
| Add an entity, endpoint, or service | Match existing naming, layers, tests, and DI registration |
| Change an EF Core model | Select the right DbContext, generate a migration, and review data-loss risks |
| Diagnose a service that fails at runtime | Compare constructor dependencies with DI registrations |
| Keep project boundaries clean | Find forbidden references and circular dependencies |
| Prepare changes for review | Run build, test, security, and architecture checks |

**15 pattern skills · 9 specialist roles · Roslyn semantic tools**

Claude Code includes 16 commands and automatic hooks. Codex and Cursor packages include
13 core workflows; see [compatibility](#compatibility) for the differences.

![Example solution health check](assets/demo-health-check.svg)

## Workflows

The reference below uses **Claude Code command names**. For the 13 shared workflows,
replace `category:name` with `$dnp-category-name` in Codex or `/dnp-category-name` in Cursor.
For example, `quality:security-scan` becomes `$dnp-quality-security-scan` in Codex.

`quality:review`, `utility:help`, and `utility:statusline` are Claude Code only.

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
| `dotnet:add-migration` | `add-migration <name> [--context <Name>]` | Generate an EF Core migration safely — checks for pending migrations, runs `migrations add` with `--context`, has `dnp-ef-migration-planner` inspect `Up()` and asks whether to keep or remove a destructive migration, then builds and emits an idempotent `migrations script` for review |
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

## Specialist roles

Each role supplies a focused .NET checklist. Claude Code routes work to native agents;
Codex reads checklists in the current agent, and Cursor also includes native definitions.

| Specialist | Focus |
| --- | --- |
| `dnp-tdd-developer-easy` | Routine features and scaffolding with RED → GREEN → REFACTOR |
| `dnp-tdd-developer-hard` | Complex features, cross-layer changes, architectural decisions |
| `dnp-refactor-cleaner` | Behavior-preserving cleanup, naming, and duplication |
| `dnp-architect` | Layer boundaries, project references, architecture decisions |
| `dnp-ef-migration-planner` | Migration chains, DbContext selection, data-loss risks |
| `dnp-di-wiring-checker` | Missing service registrations and captive dependencies |
| `dnp-security-auditor` | Authentication, authorization, secrets, API security |
| `dnp-performance-analyst` | Async code, EF queries, caching, allocations |
| `dnp-nuget-auditor` | Vulnerable, outdated, and inconsistent NuGet packages |

## Pattern skills

All three packages include these 15 skills. Detailed references load only when relevant.

| Skill | What it teaches |
| --- | --- |
| `aspnet-api-patterns` | Minimal APIs, controller patterns, `IExceptionHandler` + `AddProblemDetails`, built-in `AddOpenApi`, Asp.Versioning |
| `ef-core-patterns` | DbContext design, migrations, query optimization, owned entities |
| `testing-dotnet` | xUnit conventions, NSubstitute, `WebApplicationFactory` over Testcontainers, test tiers, mock fidelity |
| `clean-architecture` | Layer rules, project layout, dependency direction, shared kernel |
| `dotnet-project-init` | Discover projects, frameworks, packages, test runners, and EF contexts |
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

## Claude Code extras

Automatic hooks provide feedback during edits, shell commands, and session completion.
Most checks are advisory. The stop-verification block is opt-in; Git Auto-Approve uses
Claude's permission protocol. Configure toggles per solution.

<details>
<summary>Automatic hooks</summary>

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
| **Post-Edit Format** | After Write/Edit/MultiEdit on `.cs` files (formats at Stop) | Queues the saved file; at Stop runs `dotnet format --include <files>` once per project, so the file is not rewritten mid-turn; skips `obj/`, `bin/`, `Migrations/`, generated files |
| **Commit Format** | Before `git commit` (Bash or PowerShell tool) | Enforces `type(scope): message` conventional commit format |
| **Priority Router** | Before spawning an Agent | Detects .NET projects and injects DotnetPilot agent routing priority over generic equivalents; also steers C# code inspection to `mcp__roslyn__` over `mcp__*code-analyzer__`. Toggle `hooks.dotnet_priority: false` to disable |
| **Code-Analyzer Redirect** | Before a `code-analyzer` MCP tool call | When the call targets C# (a `.cs` file, a .NET `project_path`, or a .NET cwd), nudges toward the C#-aware `mcp__roslyn__` tools — the Python/TS/JS code-analyzer has no C# support. Advisory only; never blocks. Toggle `hooks.code_analyzer_redirect: false` to disable |
| **Build-failure toasts** *(mod)* | After `dotnet build` / `dotnet test` through the Bash or PowerShell tool | Same classification as Build Verify; shows a toast at the 3rd and 5th consecutive failure. Needs a Claude Code build with mod support; additive to the Node hook. Toggle plugin option `build_status` |
| **Routing roster** *(mod)* | Each system-prompt composition | In a .NET project, adds the routing guidance once per session as a session-scoped section. Needs mod support. With it active, set `hooks.dotnet_priority: false` to drop the per-`Agent` nudge. Toggle plugin option `routing` |
| **Pressure meter** *(mod)* | After `dotnet build`/`dotnet test`, Edit calls, and prompts | Scores the session 0–100 from red runs (+25/+30), re-edits of the same file after a red run (+10), corrections in your prompt (+10) and loosening test edits (+25); a green run takes 45 off. Shows `pressure N steady/strained/high` in the status line, `/dnp-pressure` lists the events. After a red run, an Edit to a test file that adds `Skip`, removes an assertion or a `[Fact]`, or comments an assertion out gets a toast; with `pressure_test_guard_block: true` it is denied while the score is ≥ 60. While the score is ≥ 60 a short system-prompt section asks for a stated blocker or `[HALT]` instead of another retry. Toggle plugin option `pressure` |
| **Pixel band** *(mod, opt-in)* | Terminal only, above the prompt | Animated pixel-art band in four scenes: **city** (windows light with tool activity), **beach** (sea, palm, sailboat, crab), **dino** (a T-rex that jumps the cacti and runs faster while tools run; meteors in a storm) and **sunset** (a time-lapse day over mountains and a lake). The sky follows the local clock, a failed `dotnet build`/`dotnet test` brings a storm and the next green run a 30-second rainbow, and a comet crosses at the end of each turn. `/city [city\|beach\|dino\|sunset\|next\|show\|hide\|status\|dawn\|day\|dusk\|night\|auto\|storm\|rainbow\|clear\|comet]`. Needs mod support and a terminal with at least 5 free rows. Off by default — enable **Pixel city band** (`pixel_city`) in `/config`; **Pixel band scene** (`pixel_city_scene`) picks the starting scene |
| **Statusline Sync** | On session start/resume/clear/compact | Refreshes the installed statusline script at `~/.claude/dnp-statusline.js` when the plugin ships a newer version. Only wires `~/.claude/settings.json` when `statusline.auto_enable: true` (default off) — never clobbers an existing statusLine without opt-in |

![pixel band scenes: city at night, beach, dino, dino in a meteor storm, sunset](./assets/pixel-band.png)

*The pixel band's scenes, top to bottom: `city` at night, `beach`, `dino`, `dino` in a storm, `sunset` just after sunrise.*

</details>

<details>
<summary>Statusline and UI mods</summary>

Run `/dotnet-pilot:utility:statusline` to install the .NET-aware statusline. It shows
model, reasoning effort, context usage, Git state, elapsed time, cost, solution, framework,
and recent build failures. Use `--manual` to print configuration instead of wiring it.

UI mods add optional build-failure toasts, routing guidance, a pressure meter, and animated
pixel-band scenes. They require a Claude Code build with mod support; enable them through
the plugin's options. They are not part of the Codex or Cursor packages.

</details>

## Roslyn semantic analysis

The local `dnp-roslyn` MCP companion analyzes C# through Roslyn and MSBuild.
It exposes solution structure, symbol navigation, DI checks, architecture checks,
and EF model inspection.

<details>
<summary>Tool reference</summary>

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

</details>

See the [Roslyn companion documentation](mcp/dotnet-pilot-mcp-roslyn/README.md) for setup
and the full tool reference. Hosts may add prefixes to the exposed tool names.

## Configuration

Initialization caches the project graph in `solution-map.json` and solution settings in
`config.json`. Workflows can discover the solution again if the cache is absent.

| App | Default state location |
| --- | --- |
| Claude Code | `~/.claude/projects/<flattened-solution-path>/.planning/` |
| Codex / Cursor | `<solution-root>/.planning/` |

For Codex and Cursor, set `DNP_PLANNING_DIR` to choose another state directory.
Relative paths resolve from the solution root. Keep generated state out of version control.

For Claude Code, hook toggles belong in `config.json`. For example:

```json
{
  "hooks": {
    "di_check": true,
    "project_scope_guard": false,
    "stop_verify_block": false
  },
  "statusline": {
    "auto_enable": false
  }
}
```

The [hook configuration resolver](hooks/_lib/config.js) documents the supported keys.
Claude hooks also support legacy repository-local `.planning/` state.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Roslyn fails to connect | Confirm `dnp-roslyn` is on PATH, open the solution directory, and run `dnp-roslyn doctor` there |
| App cannot find a solution | Open the folder containing `.sln` / `.slnx`; if necessary configure Roslyn with `--solution` and an absolute path |
| New Codex skills are missing | Start a new local chat; check the installed plugin and any namespaced skills in the picker |
| Cursor plugin is missing | Verify `~/.cursor/plugins/local/dotnet-pilot/.cursor-plugin/plugin.json` exists, then restart Cursor |
| Duplicate Roslyn tools | Keep one plugin installation and remove any duplicate manual registration |
| Updating a local package | Update the source, rebuild, then refresh/reinstall Codex or replace the Cursor plugin folder; restart the session |
| Claude hooks are too noisy | Disable the relevant `hooks.*` toggle in the solution's `config.json` |
| Need all Claude commands | Run `/dotnet-pilot:utility:help` |

For Codex/Cursor installation details and an interactive smoke-test checklist, read the
[host setup guide](docs/HOST-PLUGINS.md).

## Development

The .NET guidance is maintained once in `skills/`, `agents/`, and `commands/`.
The host package builder adapts it for Codex and Cursor using templates in `packaging/hosts/`.

```sh
node scripts/build-host-plugins.js
node scripts/build-host-plugins.js --check
node --test scripts/build-host-plugins.test.js
node hooks/__tests__/check-consistency.js
node hooks/__tests__/run.js
```

With Codex CLI installed, `node scripts/smoke-codex-plugin.js` checks local installation
in a disposable profile. Package CI runs on Windows and Linux and uploads separate
Codex and Cursor artifacts.

Read [CLAUDE.md](CLAUDE.md) for repository conventions and [CHANGELOG.md](CHANGELOG.md)
for release history and command migrations.

---

Created by [Nick Zdanovych](https://github.com/zdanovichnick) · [MIT License](LICENSE)
