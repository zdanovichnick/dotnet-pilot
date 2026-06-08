# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This repo IS the DotnetPilot plugin source — not a .NET project. There is no `dotnet build` to run here; artifacts are Markdown (agents/commands/skills) and Node/shell scripts (hooks). When editing this repo, you are authoring plugin behavior that runs inside *other* .NET projects.

### Layout

- `.claude-plugin/plugin.json` — plugin manifest (name, version, mcpServers pointer)
- `.claude-plugin/marketplace.json` — marketplace listing for plugin distribution
- `.mcp.json` — MCP server declarations (roslyn server `dnp-roslyn` configured)
- `agents/dnp-*.md` — 14 agents with YAML frontmatter (`name`, `description`, `tools`, `model`, `permissionMode`). The `tools` field uses Claude Code's scoped syntax (e.g. `Bash(dotnet:*)`)
- `commands/<category>/<name>.md` — slash commands invoked as `/DotnetPilot:<category>:<name>`. Categories: `project`, `dotnet`, `quality`, `utility`
- `hooks/hooks.json` — hook registry wiring matchers to scripts via `${CLAUDE_PLUGIN_ROOT}`
- `hooks/dnp-*.js` — 7 advisory hooks (all exit 0; emit `additionalContext` for guidance). Read a JSON event from stdin.
- `hooks/_lib/config.js` — shared module used by every hook. Resolves `.planning/config.json`: repo-local path first, then user-scoped at `~/.claude/projects/<flattened-cwd>/` (where `D:\Projects\Foo` → `D--Projects-Foo`). All hooks default-on when config is absent.
- `rules/global-claude-md.md` — template block injected into `~/.claude/CLAUDE.md` by `dnp-sync-global-claude-md.js` on version change (versioned markers keep it idempotent)
- `skills/<name>/SKILL.md` — skill packs loaded on demand (aspnet-api-patterns, ef-core-patterns, testing-dotnet, clean-architecture, blazor-patterns, dotnet-project-init)

### Authoring Rules

- **Hooks must be advisory by default.** Exit 0 even on findings; emit guidance via `additionalContext`. Only block (non-zero exit) for hard safety violations. All hooks respect `.planning/config.json` `hooks.*` toggles and default-on when the file is absent.
- **Hook paths use `${CLAUDE_PLUGIN_ROOT}`**, never relative paths — the CWD at runtime is the consumer project, not this repo.
- **All hooks share `_lib/config.js`.** When adding a new hook, import `{ hookEnabled }` from there — don't re-implement config resolution.
- **`dnp-commit-format` skips heredoc commits.** Claude Code's default multi-line commit workflow (`-m "$(cat <<'EOF'...)"`) is deliberately excluded — the hook only validates plain `-m "..."` strings.
- **Commands are thin orchestrators.** Heavy logic belongs in agents. A command file is the spec that Claude reads when the slash command fires; it should enumerate steps and which agents to spawn, not re-implement their work.
- **Agent frontmatter `tools:` is a whitelist.** Adding a tool requires justification; prefer narrower scopes (`Bash(dotnet:*)`) over broad ones.
- **Model tier by agent role.** Planning/architecture → opus; implementation/review → sonnet; mechanical checks (DI, NuGet audit, scaffolding) → haiku.

### Validating Plugin Changes

**Hook test harness** (the only automated validation):
```bash
node hooks/__tests__/run.js
```
Runs every hook against fixture JSON payloads and asserts: exit code 0, stdout is empty or valid `hookSpecificOutput` JSON, and expected `[dnp-<name>]` message fragments appear. Run before publishing a new version or after editing any hook.

**Manual end-to-end** from a test .NET project directory:

```bash
# Session-only (no persistent install — for quick iteration):
claude --plugin-dir "C:\path\to\dotnet-pilot"

# Persistent install from local clone:
/plugin marketplace add C:\path\to\dotnet-pilot
/plugin install dotnet-pilot@dotnet-pilot-marketplace
/reload-plugins
```

After editing commands, agents, or hooks: `/reload-plugins` (no restart needed).

**Roslyn MCP companion** (required for semantic analysis tools):
```bash
dotnet tool install -g DotnetPilot.Mcp.Roslyn   # first install
dotnet tool update  -g DotnetPilot.Mcp.Roslyn   # update
```

**Checklist before publishing:**
- Bump version in `plugin.json` and `marketplace.json` (both must match — plugin track)
- Roslyn server has its own version in `mcp/dotnet-pilot-mcp-roslyn/src/DotnetPilot.Mcp.Roslyn/DotnetPilot.Mcp.Roslyn.csproj` (`<Version>` tag) — bump separately before `dotnet pack`
- Keep `README.md` command/agent tables in sync with `commands/` and `agents/` directories

### Companion: dnp-roslyn MCP server

The Roslyn MCP server source lives locally at `mcp/dotnet-pilot-mcp-roslyn/` (also published to GitHub at [dotnet-pilot-mcp-roslyn](https://github.com/zdanovichnick/dotnet-pilot-mcp-roslyn)). It provides 16 semantic C# analysis tools (DI completeness, architecture violations, EF Core introspection, find references/implementations, class outlines). The `.mcp.json` in this repo auto-starts it. dnp-roslyn only works when Claude Code is opened in a directory containing a `.sln`/`.slnx` file — it fails silently otherwise.

**Build & test the Roslyn server locally:**
```bash
dotnet build mcp/dotnet-pilot-mcp-roslyn/DotnetPilot.Mcp.Roslyn.slnx
dotnet test  mcp/dotnet-pilot-mcp-roslyn/DotnetPilot.Mcp.Roslyn.slnx
# Integration tests skip if DNP_TEST_SOLUTION is unset
$env:DNP_TEST_SOLUTION = "C:\path\to\some.slnx"; dotnet test mcp/dotnet-pilot-mcp-roslyn/DotnetPilot.Mcp.Roslyn.slnx
```

See `mcp/dotnet-pilot-mcp-roslyn/CLAUDE.md` for architecture details of the Roslyn server itself.

---

# DotnetPilot — Orchestrator Instructions

When the DotnetPilot plugin is active in a consumer project, these instructions govern how its commands and agents behave.

## Core Principles

1. **Stay narrow.** DotnetPilot only does .NET-specific work that Claude Code cannot do natively: Roslyn semantic checks, DI wiring, EF migration safety, architecture layer rules, and scaffolders that match project conventions. For multi-step feature work, use Claude Code's **Plan Mode** + **TaskCreate**, not DotnetPilot-specific orchestration (which was retired in v1.0.0).
2. **Commands are thin orchestrators, agents are workers.** Commands discover state and spawn the appropriate agent with explicit context. Never do heavy implementation inside a command file.
3. **Fresh context per agent.** Each spawned agent gets a clean context window. Pass explicit file paths and state — never assume agents remember prior conversation.
4. **.NET-first.** Every agent, command, and hook understands .NET conventions: solution structure, project references, DI registration, EF Core migrations, NuGet packages, and test frameworks.

## Agents

As of v1.0.0 the abstraction-heavy spec-driven agents (`dnp-researcher`, `dnp-code-reviewer`, `dnp-security-auditor`, `dnp-plan-checker`, `dnp-executor`) are retired in favor of stock Claude capabilities. The remaining 14 agents focus on things Claude doesn't do well out of the box.

### Planning & verification
| Agent | Model | Role |
|-------|-------|------|
| `dnp-planner` | opus | Emits a .NET-aware, DI-conscious task list that maps 1:1 to `TaskCreate` entries |
| `dnp-verifier` | sonnet | Goal-backward verification: build, tests, DI completeness, migration state, architecture rules |

### Expert domain knowledge
| Agent | Model | Role |
|-------|-------|------|
| `dnp-architect` | opus | Solution architecture, clean-arch layer enforcement, project-reference validation |
| `dnp-test-writer` | sonnet | Test writer — xUnit/NUnit with mocking, WebApplicationFactory, convention-aware assertions |
| `dnp-tdd-developer-easy` | haiku | Fast TDD for routine .NET tasks — writes both tests and production code following RED-GREEN-REFACTOR |
| `dnp-tdd-developer-hard` | sonnet | Deep TDD for complex .NET tasks — architectural decisions, ambiguous edge cases, cross-layer integration |
| `dnp-build-error-resolver` | haiku | Iterative build-error fixing — autonomous repair loop, max 5 iterations |
| `dnp-security-auditor`     | sonnet | OWASP Top 10 audit, secrets exposure, auth config, dependency CVEs |
| `dnp-performance-analyst`  | sonnet | Async hotspots, N+1 queries, caching gaps, benchmark design |
| `dnp-refactor-cleaner`     | sonnet | Dead code removal, naming normalization, duplication elimination |

### Mechanical (fast, focused)
| Agent | Model | Role |
|-------|-------|------|
| `dnp-api-scaffolder` | haiku | Controllers or minimal API endpoints with DTOs, validation, DI registration |
| `dnp-ef-migration-planner` | haiku | EF Core migration safety — chain integrity, data-loss risk, DbContext targeting |
| `dnp-di-wiring-checker` | haiku | Cross-references constructor injections against DI registrations |
| `dnp-nuget-auditor` | haiku | Vulnerability, outdated-version, and version-inconsistency scans |

## Hook Behaviors

| Hook | Trigger | What it does |
|------|---------|--------------|
| `dnp-sync-global-claude-md` | PreToolUse (Read, Write, Edit, MultiEdit, Bash, Grep, Glob) | Injects `rules/global-claude-md.md` block into `~/.claude/CLAUDE.md` with versioned markers; no-ops if current version already present |
| `dnp-dotnet-priority` | PreToolUse (Agent) | When CWD (or a parent) contains `.sln`/`.slnx`/`.csproj`, emits a routing table nudging the orchestrator toward DotnetPilot agents and toward `mcp__roslyn__` over `mcp__*code-analyzer__` for C# inspection; gated by `hooks.dotnet_priority` (default-on) |
| `dnp-code-analyzer-redirect` | PreToolUse (`mcp__.*code-analyzer.*`) | Advisory — when a code-analyzer MCP tool targets C# (a `.cs` file, a .NET `project_path`, or a .NET cwd), nudges toward `mcp__roslyn__*` (the Python/TS/JS code-analyzer has no C# support). Never blocks; gated by `hooks.code_analyzer_redirect` (default-on) |
| `dnp-build-verify` | PostToolUse (Bash) | Parses `dotnet build/test` failures; warns at 3 consecutive failures, escalates at 5; resets counter on success (temp file per CWD) |
| `dnp-di-registration-check` | PostToolUse (Write/Edit) | On `.cs` file save, regex-checks whether the new class has a DI registration in `Program.cs` / `*Extensions.cs`; skips test files, migrations, `Program.cs` itself |
| `dnp-post-edit-format` | PostToolUse (Write/Edit/MultiEdit) | On `.cs` file save, runs `dotnet format --include <file>` on the nearest project; skips `obj/`, `bin/`, `Migrations/`, and generated files |
| `dnp-migration-guard` | PreToolUse (Write/Edit) | Warns before manual edits to files inside a `Migrations/` directory |
| `dnp-project-scope-guard` | PostToolUse (Write/Edit) | When `.planning/STATE.md` has `focus_projects: [...]` frontmatter, warns if an edit touches a project outside that list; uses `solution-map.json` for boundary resolution |
| `dnp-commit-format` | PreToolUse (Bash) | Validates conventional commit format on `git commit -m "..."` invocations; skips heredoc, `--no-edit`, and `--file` forms |
| `dnp-git-autoapprove` | PreToolUse (Bash) | **Non-advisory** — returns `permissionDecision: allow` for safe single `git`/`gh` commands (status/diff/log/add/commit/branch/push, `gh pr create`, plus the heredoc-commit form) so commit + PR skip the permission prompt. Chained/substituted/redirected commands fall through to the normal prompt. Gated by `hooks.git_autoapprove` (default-on) |

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
- 5+ consecutive build failures (tracked by `dnp-build-verify` in `os.tmpdir()`; warning fires at 3)
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

For teams that want lightweight persistent state (a PROJECT.md, a roadmap, a solution map cache) install the optional `dotnet-pilot-workflow` plugin. It owns the `.planning/` directory lifecycle and the `project:init`/`project:ship`/`project:next` commands.

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
    "commit_format": true,
    "git_autoapprove": true,
    "dotnet_priority": true,
    "code_analyzer_redirect": true
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
