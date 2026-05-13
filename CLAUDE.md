# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This repo IS the DotnetPilot plugin source — not a .NET project. There is no `dotnet build` to run here; artifacts are Markdown (agents/commands/skills) and Node/shell scripts (hooks). When editing this repo, you are authoring plugin behavior that runs inside *other* .NET projects.

### Layout

- `.claude-plugin/plugin.json` — plugin manifest (name, version, mcpServers pointer)
- `.claude-plugin/marketplace.json` — marketplace listing for plugin distribution
- `.mcp.json` — MCP server declarations (roslyn server `dnp-roslyn` configured)
- `agents/dnp-*.md` — 8 subagents with YAML frontmatter (`name`, `description`, `tools`, `model`, `permissionMode`). The `tools` field uses Claude Code's scoped syntax (e.g. `Bash(dotnet:*)`)
- `commands/<category>/<name>.md` — slash commands invoked as `/DotnetPilot:<category>:<name>`. Categories: `pipeline`, `dotnet`, `quality`, `utility`
- `hooks/hooks.json` + `hooks/dnp-*.{js,sh}` — PreToolUse/PostToolUse hooks. JS hooks read a JSON event from stdin, exit 0 with optional `additionalContext` on stdout for advisory feedback, or non-zero to block
- `skills/<name>/SKILL.md` — skill packs loaded on demand (aspnet-api-patterns, ef-core-patterns, testing-dotnet, clean-architecture, blazor-patterns, dotnet-project-init)

### Authoring Rules

- **Hooks must be advisory by default.** Exit 0 even on findings; emit guidance via `additionalContext`. Only block (non-zero exit) for hard safety violations. All hooks respect `.planning/config.json` `hooks.*` toggles and exit early when the planning dir is absent.
- **Hook paths use `${CLAUDE_PLUGIN_ROOT}`**, never relative paths — the CWD at runtime is the consumer project, not this repo.
- **Commands are thin orchestrators.** Heavy logic belongs in agents. A command file is the spec that Claude reads when the slash command fires; it should enumerate steps and which agents to spawn, not re-implement their work.
- **Agent frontmatter `tools:` is a whitelist.** Adding a tool requires justification; prefer narrower scopes (`Bash(dotnet:*)`) over broad ones.
- **Model tier by agent role.** Planning/architecture → opus; implementation/review → sonnet; mechanical checks (DI, NuGet audit, scaffolding) → haiku.

### Validating Plugin Changes

There is no automated test suite. To verify changes:
1. `echo '<json>' | node hooks/<hook>.js` — smoke-test a hook with a crafted event
2. Install the plugin from a test .NET project directory:
   ```
   /install dotnet-pilot
   ```
   Or from a local clone: `/plugin marketplace add ./path-to-dotnet-pilot` then `/plugin install dotnet-pilot@dotnet-pilot-marketplace`
3. Exercise the command/agent in the test project
4. Check `plugin.json` version bump and keep `README.md` tables in sync with `agents/` and `commands/` directories

### Companion: dnp-roslyn MCP server

The Roslyn MCP server lives in a separate repo ([dotnet-pilot-mcp-roslyn](https://github.com/zdanovichnick/dotnet-pilot-mcp-roslyn)). It provides 11 semantic C# analysis tools (DI completeness, architecture violations, EF Core introspection, find references/implementations, class outlines). The `.mcp.json` in this repo auto-starts it. dnp-roslyn only works when Claude Code is opened in a directory containing a `.sln`/`.slnx` file — it fails silently otherwise.

---

# DotnetPilot — Orchestrator Instructions

When the DotnetPilot plugin is active in a consumer project, these instructions govern how its commands and agents behave.

## Core Principles

1. **Stay narrow.** DotnetPilot only does .NET-specific work that Claude Code cannot do natively: Roslyn semantic checks, DI wiring, EF migration safety, architecture layer rules, and scaffolders that match project conventions. For multi-step feature work, use Claude Code's **Plan Mode** + **TaskCreate**, not DotnetPilot-specific orchestration (which was retired in v1.0.0).
2. **Commands are thin orchestrators, agents are workers.** Commands discover state and spawn the appropriate agent with explicit context. Never do heavy implementation inside a command file.
3. **Fresh context per agent.** Each spawned agent gets a clean context window. Pass explicit file paths and state — never assume agents remember prior conversation.
4. **.NET-first.** Every agent, command, and hook understands .NET conventions: solution structure, project references, DI registration, EF Core migrations, NuGet packages, and test frameworks.

## Agents

As of v1.0.0 the abstraction-heavy spec-driven agents (`dnp-researcher`, `dnp-code-reviewer`, `dnp-security-auditor`, `dnp-plan-checker`, `dnp-executor`) are retired in favor of stock Claude capabilities. The remaining 8 agents focus on things Claude doesn't do well out of the box.

### Planning & verification
| Agent | Model | Role |
|-------|-------|------|
| `dnp-planner` | claude-opus-4-7 | Emits a .NET-aware, DI-conscious task list that maps 1:1 to `TaskCreate` entries |
| `dnp-verifier` | claude-sonnet-4-6 | Goal-backward verification: build, tests, DI completeness, migration state, architecture rules |

### Expert domain knowledge
| Agent | Model | Role |
|-------|-------|------|
| `dnp-architect` | claude-opus-4-7 | Solution architecture, clean-arch layer enforcement, project-reference validation |
| `dnp-test-writer` | claude-sonnet-4-6 | xUnit/NUnit TDD agent — mocking, WebApplicationFactory, convention-aware assertions |

### Mechanical (fast, focused)
| Agent | Model | Role |
|-------|-------|------|
| `dnp-api-scaffolder` | claude-haiku-4-5-20251001 | Controllers or minimal API endpoints with DTOs, validation, DI registration |
| `dnp-ef-migration-planner` | claude-haiku-4-5-20251001 | EF Core migration safety — chain integrity, data-loss risk, DbContext targeting |
| `dnp-di-wiring-checker` | claude-haiku-4-5-20251001 | Cross-references constructor injections against DI registrations |
| `dnp-nuget-auditor` | claude-haiku-4-5-20251001 | Vulnerability, outdated-version, and version-inconsistency scans |

## Quality Gates

### Pre-flight (mechanical checks, not blocking unless hooks say so)
- `dotnet build` must succeed before running scaffolders or `/ship`
- `dotnet test` should pass before shipping
- All constructor-injected types should have DI registrations before shipping (`dnp-di-wiring-checker`)

### Escalation (pause and ask developer)
- Architecture violation: Domain project references Infrastructure
- Breaking EF migration: column drop, type change detected
- NuGet critical CVE: vulnerability found in dependency
- Multiple DbContext ambiguity: migration target unclear

### Abort (stop immediately, preserve state)
- 5 consecutive build failures (tracked by `dnp-build-verify` hook)
- Solution file corruption

## What DotnetPilot does NOT do

Use these native Claude Code primitives instead — they evolve with Claude Code and don't drift:

- Multi-step planning → **Plan Mode** (`EnterPlanMode`) + `TaskCreate`
- General code review → stock `code-reviewer` agent (see `/DotnetPilot:quality:review`, which now delegates to it)
- Security audit → stock `/security-review` command
- Research → Context7 MCP (`mcp__context7__*`) or `WebSearch`
- Tracking work within a conversation → `TaskCreate` / `TaskUpdate`
- Gathering user intent → `AskUserQuestion`
- Initial project README → stock `/init`

## State directory (optional — requires `dotnet-pilot-workflow` companion plugin)

For teams that want lightweight persistent state (a PROJECT.md, a roadmap, a solution map cache) install the optional `dotnet-pilot-workflow` plugin. It owns the `.planning/` directory lifecycle and the `pipeline:init`/`pipeline:ship`/`pipeline:next` commands.

`dotnet-pilot` (this plugin) reads `.planning/config.json` if present to respect per-project hook toggles, but does not require it.

## .NET Conventions

When working in a .NET solution, always:

1. **Respect layer boundaries.** Domain has no references to Infrastructure or API. Application depends only on Domain. Infrastructure implements Application interfaces.
2. **Register services.** Every new service class needs `AddScoped`/`AddTransient`/`AddSingleton` in the DI container. Check `Program.cs` or extension methods.
3. **Generate migrations properly.** Use `dotnet ef migrations add` — never manually create migration files. Always specify the correct DbContext if multiple exist.
4. **Follow project conventions.** Detect existing patterns (naming, folder structure, test framework) before creating new files. Match what's already there.
5. **Verify builds.** Run `dotnet build --no-restore` after significant changes. Parse error output and fix issues before committing.
6. **Use the solution map.** Read `.planning/solution-map.json` to understand project structure rather than re-scanning every time.

## Plan format

`dnp-planner` emits a Markdown task list that maps 1:1 to Claude Code's native
`TaskCreate` entries. The legacy `<task type="auto">...</task>` XML DSL was retired
in v1.0.0 — it duplicated `TaskCreate` and required a bespoke executor agent.

See `agents/dnp-planner.md` for the output template. The caller (you, or a
feature-dev skill) is responsible for invoking `TaskCreate` per entry and wiring
`addBlockedBy` relationships.

## Commit Convention

Use conventional commits scoped to the .NET project name:

```
feat(Api): add UserController with CRUD endpoints
fix(Infrastructure): correct EF migration for UserProfile table
test(Tests): add integration tests for authentication flow
refactor(Application): extract validation into pipeline behavior
```

## Configuration Reference

`.planning/config.json` is owned by the optional `dotnet-pilot-workflow` plugin.
`dotnet-pilot` reads the `hooks.*` and `dotnet.*` sections if the file exists.

Minimum schema for core:

```json
{
  "dotnet": {
    "solution_path": null,
    "target_framework": null,
    "test_framework": "xunit",
    "ef_contexts": [],
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

The retired pipeline keys (`workflow.research`, `workflow.plan_check`,
`workflow.verifier`, `workflow.auto_advance`, `parallelization.*`,
`gates.confirm_plan`, `gates.confirm_phases`, `gates.breaking_change_confirm`,
`git.phase_branch_template`) are ignored — they belonged to the spec-driven
pipeline that was retired in v1.0.0.
