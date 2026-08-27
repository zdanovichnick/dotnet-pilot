# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This repo IS the DotnetPilot plugin source — not a .NET project. There is no `dotnet build` to run here; artifacts are Markdown (agents/commands/skills) and Node/shell scripts (hooks). When editing this repo, you are authoring plugin behavior that runs inside *other* .NET projects.

### Layout

- `.claude-plugin/plugin.json` — plugin manifest (name, version, mcpServers pointer)
- `.claude-plugin/marketplace.json` — marketplace listing for plugin distribution
- `.mcp.json` — MCP server declarations (roslyn server `dnp-roslyn` configured)
- `agents/dnp-*.md` — 15 agents with YAML frontmatter (`name`, `description`, `tools`, `model`, `effort`, `color`, `permissionMode`). The `tools` field uses Claude Code's scoped syntax (e.g. `Bash(dotnet:*)`)
- `commands/<category>/<name>.md` — slash commands invoked as `/dotnet-pilot:<category>:<name>`. Categories: `project`, `dotnet`, `quality`, `utility`
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
- **Model tier by agent role.** Planning/architecture → opus; implementation/review → sonnet; mechanical checks (DI, NuGet audit, scaffolding) → sonnet at `effort: low`; deep read-only consults → fable.
- **Every agent and command declares `effort:`.** Model tier sets capability, `effort:` (`low|medium|high|xhigh|max`) sets reasoning spend within it. Do NOT pair `effort:` with `model: haiku` — effort is unsupported on Haiku 4.5 and the field is silently dropped, which is why the mechanical agents run on sonnet at `effort: low` instead of haiku.
- **Agent prompts carry gotchas, not guardrails.** Write what is specific to .NET and to this
  plugin — missing DI registration throwing at runtime, migrations needing their own step, the
  in-memory EF provider diverging from SQL Server. Do not add anti-rationalization tables,
  epistemic-gate checklists, "predict before you grep" protocols, or few-shot transcripts of
  ideal output: they re-encode judgment the model already has, and every added constraint is
  another chance to contradict a neighbouring one. Domain reference material (test tiers, mock
  fidelity, boundary coverage) belongs in a `skills/` file the agent loads via `skills:`, not
  inlined in the prompt.
- **State a fact in exactly one place.** Tool guidance goes in the tool or agent description;
  routing goes in this file; conventions go in a skill. A hook that re-injects a roster this file
  already carries pays for the same tokens on every call.
- **`shell:` is not used here.** It only governs `!`-blocks in command frontmatter, and no dotnet-pilot command uses one — adding it would be dead config. If you introduce a `!`-block that shells out on Windows, add `shell: powershell` to *that* command.

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

Claude Code surfaces each agent's `description:` in the agent list, so this file doesn't restate
the roster — read `agents/dnp-*.md` for detail. What the descriptions don't tell you:

- **Tier the TDD work.** `dnp-tdd-developer-easy` (sonnet/low) handles routine changes and
  returns a `[ROUTING: …hard]` verdict when the task outgrows it. Escalate to
  `dnp-tdd-developer-hard` (sonnet/high) on a named signal — architectural choice, cross-layer
  change, unestablished pattern — not on general uncertainty.
- **`dnp-fable-advisor` needs Fable 5 access and has no automatic fallback.** If the account
  can't serve `model: fable` the agent won't spawn; route the consult to `dnp-architect` instead.
  It advises and never implements, so it is a decision-point consult, not a worker.
- **The spec-driven agents are gone.** `dnp-researcher`, `dnp-code-reviewer`, `dnp-plan-checker`,
  and `dnp-executor` were retired in v1.0.0 in favor of stock Claude capabilities.

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
| `dnp-statusline-sync` | SessionStart (startup/resume/clear/compact) | Copies `statusline/dnp-statusline.js` to `~/.claude/dnp-statusline.js` when the plugin ships a newer `STATUSLINE_VERSION` (version-stamped, idempotent). Wires `~/.claude/settings.json` `statusLine` **only** when `statusline.auto_enable === true` (default-off), backing up any prior statusLine once to `~/.claude/dnp-statusline.prev.json`. Advisory (exit 0). Install manually via `/dotnet-pilot:utility:statusline` |

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

**Shared build-fail state contract:** `dnp-build-verify` writes the consecutive-failure count to
`os.tmpdir()/dnp-build-fail-<sha1(cwd)>.json` (covering both `dotnet build` and `dotnet test`). The
statusline's `BUILD ✗ Nx` segment reads that same file — the `sha1(cwd)` hex-digest path scheme must
match exactly in both `hooks/dnp-build-verify.js` and `statusline/dnp-statusline.js`, or the statusline
reads the wrong file. State older than 1h is treated as stale.

## What DotnetPilot does NOT do

Use these native Claude Code primitives instead — they evolve with Claude Code and don't drift:

- Multi-step planning → **Plan Mode** (`EnterPlanMode`) + `TaskCreate`
- General code review → stock `code-reviewer` agent (see `/dotnet-pilot:quality:review`, which now delegates to it)
- Security audit → stock `/security-review` command
- Research → Context7 MCP (`mcp__context7__*`) or `WebSearch`
- Tracking work within a conversation → `TaskCreate` / `TaskUpdate`
- Gathering user intent → `AskUserQuestion`
- Initial project README → stock `/init`

## State directory (optional — requires `dotnet-pilot-workflow` companion plugin)

For teams that want lightweight persistent state (a PROJECT.md, a roadmap, a solution map cache) install the optional `dotnet-pilot-workflow` plugin. It owns the `.planning/` directory lifecycle and the `project:init`/`project:ship`/`project:next` commands.

`dotnet-pilot` (this plugin) reads `.planning/config.json` if present to respect per-project hook toggles, but does not require it.

## .NET Conventions

The layer rules, DI patterns, and convention detection live in the `clean-architecture` and
`convention-learner` skills — load them rather than duplicating them here. Two things that only
apply inside this plugin's world:

- **Migrations come from the CLI.** `dotnet ef migrations add`, never a hand-written migration
  file, and always `--context` when the solution has more than one `DbContext`.
- **`.planning/solution-map.json` is the cached project graph.** Read it before re-scanning the
  solution.

## Plan format

`dnp-planner` emits a Markdown task list that maps 1:1 to Claude Code's native
`TaskCreate` entries. See `agents/dnp-planner.md` for the output template. The caller (you, or a
feature-dev skill) is responsible for invoking `TaskCreate` per entry and wiring
`addBlockedBy` relationships.

## Commit Convention

Use conventional commits scoped to the .NET project name:

```
feat(Api): add UserController with CRUD endpoints
```

## Configuration Reference

`.planning/config.json` is owned by the optional `dotnet-pilot-workflow` plugin; this plugin only
reads its `hooks.*`, `dotnet.*`, and `statusline.*` sections, and every hook defaults on when the
file is absent. `hooks/_lib/config.js` is the resolver and the authoritative key list.

Two non-obvious defaults:

- `statusline.auto_enable` defaults to **false** because wiring it mutates
  `~/.claude/settings.json`, which may already hold another `statusLine`. The sync hook refreshes
  the installed script regardless; opt in via the key or `/dotnet-pilot:utility:statusline`.
- Keys from the retired spec-driven pipeline (`workflow.research`, `workflow.plan_check`,
  `workflow.verifier`, `workflow.auto_advance`, `parallelization.*`, `gates.*`,
  `git.phase_branch_template`) are silently ignored — finding one in a config file does not mean
  it does anything.
