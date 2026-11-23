# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Context

This repo IS the DotnetPilot plugin source — not a .NET project. There is no `dotnet build` to run here; artifacts are Markdown (agents/commands/skills) and Node/shell scripts (hooks). When editing this repo, you are authoring plugin behavior that runs inside *other* .NET projects.

### Layout

- `.claude-plugin/plugin.json` — plugin manifest (name, version, mcpServers pointer)
- `.claude-plugin/marketplace.json` — marketplace listing for plugin distribution
- `.mcp.json` — MCP server declarations (roslyn server `dnp-roslyn` configured)
- `agents/dnp-*.md` — 10 agents with YAML frontmatter (`name`, `description`, `tools`, `skills`, `model`, `effort`, `color`). `tools:` lists exact tool names (`Bash`, `Read`, `mcp__roslyn__*`); plugin subagents ignore scoped tool forms, permission-mode keys, and the user-question tool, so none of those appear. Every agent sets `memory: project` (notes in the consumer repo's `.claude/agent-memory/`); the read-only agents list `Write`/`Edit` for that folder alone, a limit their prompt states and nothing enforces. The host packages get the same folder from `packaging/hosts/memory.md`, added to specialist checklists only
- `commands/<category>/<name>.md` — 17 slash commands invoked as `/dotnet-pilot:<category>:<name>`. Categories: `project`, `dotnet`, `fullstack`, `quality`, `utility`. Commands with side effects carry `disable-model-invocation: true`
- `hooks/hooks.json` — hook registry wiring matchers to scripts via `${CLAUDE_PLUGIN_ROOT}`
- `hooks/dnp-*.js` — the hooks listed under Hook Behaviors below (advisory unless stated: exit 0; emit `additionalContext` for guidance). Read a JSON event from stdin.
- `hooks/_lib/config.js` — shared module used by every hook. Resolves `.planning/config.json`: repo-local path first, then user-scoped at `~/.claude/projects/<flattened-cwd>/` (where `D:\Projects\Foo` → `D--Projects-Foo`). `hookEnabled(cwd, key)` keys default **on** when config is absent; `hookFlag(cwd, key)` keys are opt-in and default **off**
- `hooks/mods/` — a Claude Code **mod**, declared by `"modules": ["./mods/register.ts"]` in `hooks.json` (one module per plugin; no Node, no DOM, everything through `$`). One file per feature; `*-data.ts` hold the pure logic, `*.test.ts` run with `claude plugin test .`, `types/index.d.ts` is the `$.state` contract. Engine constraints the layout follows:
  - A module gets one `prompt.compose`, one unmatched `session.start` and one `turn.complete`, so `routing.ts`, `session-start.ts` and `turn-complete.ts` call into the features. Any other `session.start` must be matched (`pixel-city.tsx` uses `{ surface: 'terminal' }`).
  - The engine never follows `$` across an import: a function that takes `$` across an import must be a `function` declaration, transitively, and a function given `on` may not return a value the caller keeps.
  - `status-line.ts` owns the single `$.ui.status` line; whichever mod writes rebuilds it whole.
  - `$.mcp.connect` never respawns a failed server (only `/mcp` Reconnect does), and the engine replays a failed connect for 15 min across folders. `$.mcp.call` is permission-gated, so `mcp-health.ts` probes only when `$.tool.check` says `allow`. Roslyn tool errors are caught on `tool.call`, not `classic.PostToolUseFailure`, which an enterprise builtin plugin seated outermost continues past. `MIN_ROSLYN_VERSION` in `mcp-health.ts` is the only minimum-version fact.
  - `fetch()` is refused on `file://`, so the `/dnp-agents` page reloads `dnp-agents-data.js` as a `<script>`. `agents-page.ts` escapes every value because labels and answers are model text. `$.store` rejects writes past 4 MiB.
  - The dashboard's layer rules in `dashboard-data.ts` come from `skills/clean-architecture`.
  - Mods read only `userConfig` (declared in `plugin.json`), never `.planning/config.json`. The pressure mod scores what the session shows (failures, retries, test edits), never the model's internal state; keep its wording to "pressure", not emotions
- `hooks/_lib/routing.md` — the routing text shared by `dnp-dotnet-priority` and the routing mod
- `hooks/_lib/build-state.js` — reader/writer for the build-fail state file shared by `dnp-build-verify`, `dnp-stop-verify` and the statusline (contract under Quality Gates)
- `hooks/_lib/version.js` — semver compare shared by the two sync hooks; `hooks/_lib/json-file.js` — BOM-preserving JSON read (`{exists, ok, value, bom}`) and atomic write for `~/.claude/settings.json`, so an unparseable file is never overwritten
- `hooks/__tests__/run.js`, `hooks/__tests__/check-consistency.js` — hook harness and repo consistency gate (see Validating Plugin Changes); `.github/workflows/hooks.yml` runs both in CI
- `samples/SmokeSolution/` — clean-architecture fixture with planted defects; its README lists the finding each Roslyn tool must return. Don't fix the defects. `scripts/smoke-roslyn.js` drives the server over stdio against it and checks those findings; `.github/workflows/roslyn.yml` runs both, with `DNP_TEST_SOLUTION` pointing at the sample so the integration tests execute instead of returning early
- `workflows/dnp-review.js` — the review Workflow, auto-discovered as `/dotnet-pilot:dnp-review`; started only by `quality:review` (see Review Workflow)
- `scripts/dnp-review-preflight.js` — Node preflight that shards a diff and writes the manifest the review Workflow consumes
- `rules/global-claude-md.md` — template block injected into `~/.claude/CLAUDE.md` by `dnp-sync-global-claude-md.js` when the plugin version is newer than the installed block (versioned markers keep it idempotent)
- `skills/<name>/SKILL.md` — 19 skill packs loaded on demand via an agent's `skills:` list. Every `SKILL.md` carries `when_to_use:`; `authentication`, `caching`, `ddd`, `error-handling`, `resilience`, `react-typescript` and `ui-ux-design` keep their detail in `references/*.md`
- `docs/` — `HOST-PLUGINS.md` (Codex/Cursor packaging and smoke checks) and `proposals/` (specs for candidate features and their status; each spec names what is verified and what is not)
- `packaging/hosts/` — `init.md` (the host version of `project:init`) and `runtime.md` (host runtime notes), both read by `scripts/build-host-plugins.js` when it builds the Codex and Cursor packages; `scripts/smoke-codex-plugin.js` installs the Codex package in a disposable profile
- `knowledge/` (package recommendations, antipatterns, ADRs, breaking changes) and `templates/` (per-archetype `CLAUDE.md` starters) — reference content the host packages copy; `assets/` holds the README images
- `CHANGELOG.md` — Keep-a-Changelog history; the only place that names removed commands and agents

### Authoring Rules

- **Hooks must be advisory by default.** Exit 0 even on findings; emit guidance via `additionalContext`. Only block (non-zero exit) for hard safety violations. All hooks respect `.planning/config.json` `hooks.*` toggles and default-on when the file is absent.
- **Hook paths use `${CLAUDE_PLUGIN_ROOT}`**, never relative paths — the CWD at runtime is the consumer project, not this repo.
- **All hooks share `_lib/config.js`.** When adding a new hook, import `{ hookEnabled }` from there — don't re-implement config resolution.
- **`dnp-commit-format` skips heredoc commits.** Claude Code's default multi-line commit workflow (`-m "$(cat <<'EOF'...)"`) is deliberately excluded — the hook only validates plain `-m "..."` strings.
- **Commands are thin orchestrators.** Heavy logic belongs in agents. A command file is the spec that Claude reads when the slash command fires; it should enumerate steps and which agents to spawn, not re-implement their work.
- **Agent frontmatter `tools:` is a whitelist.** Adding a tool requires justification. Use exact tool names — `Bash`, not a scoped form — because plugin subagents honor only exact names and `mcp__<server>__*`.
- **Model tier by agent role.** Judgment → opus (Opus 5.5): `dnp-architect` at `high`, `dnp-tdd-developer-hard` at `medium` — Opus 5.5's default, which already outperforms Opus 5 at `high`, so raise it only on a measured gain — and every review confirmer. Routine implementation and specialist audits → sonnet; mechanical checks (DI, NuGet audit, migration planning, routine TDD) → sonnet at `effort: low`; haiku only for the review workflow's scouts, which carry no `effort:`.
- **Every agent and command declares `effort:`.** Model tier sets capability, `effort:` (`low|medium|high|xhigh|max`) sets reasoning spend within it. `model: haiku` with `effort:` is allowed but provider-dependent: on the Anthropic API the alias resolves to Haiku 5.5, which takes every effort level (default `medium`); on Bedrock, Google Cloud, Foundry and Claude Platform on AWS it resolves to Haiku 4.5, which has no effort and silently drops the field. The mechanical agents stay on sonnet at `effort: low` until a haiku run is measured against them.
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

**Automated validation:**
```bash
node hooks/__tests__/run.js                # hook harness
node hooks/__tests__/check-consistency.js  # versions, frontmatter, README tables, command/agent references
node --test scripts/build-host-plugins.test.js  # Codex/Cursor packages; pins the shipped SKILL.md count
```
The harness runs every hook against fixture JSON payloads and asserts: exit code 0, stdout is empty or valid `hookSpecificOutput` JSON, and expected `[dnp-<name>]` message fragments appear. The consistency check fails on a version mismatch, a missing `effort:`/`description:`, a `/dotnet-pilot:<cat>:<name>` reference to a command file that does not exist, a backticked `dnp-*` name that is neither an agent nor a hook, or a `utility:help` roster whose banner version, counts, or names disagree with the directories. Run both before publishing or after editing any hook, command, or agent.

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
- Bump the version in `plugin.json`, `marketplace.json`, `STATUSLINE_VERSION` in `statusline/dnp-statusline.js`, and the `DotnetPilot vX.Y.Z` banner in `commands/utility/help.md` (all four must match — the consistency check enforces it)
- Roslyn server has its own version in `mcp/dotnet-pilot-mcp-roslyn/src/DotnetPilot.Mcp.Roslyn/DotnetPilot.Mcp.Roslyn.csproj` (`<Version>` tag) — bump separately before `dotnet pack`
- Add the `CHANGELOG.md` entry; keep `README.md` command/agent/skill tables in sync with the directories

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

1. **Stay narrow.** DotnetPilot only does .NET-specific work that Claude Code cannot do natively: Roslyn semantic checks, DI wiring, EF migration safety, architecture layer rules, and scaffolders that match project conventions. For multi-step feature work, use Claude Code's **Plan Mode** + **TaskCreate**, not DotnetPilot-specific orchestration (which was retired in v1.0.0). One exception: the seam between an ASP.NET API and its React + TypeScript client (`/dotnet-pilot:fullstack:feature`, `dnp-frontend-developer`). Frontend work with no API contract involved stays out of scope.
2. **Commands are thin orchestrators, agents are workers.** Commands discover state and spawn the appropriate agent with explicit context. Never do heavy implementation inside a command file.
3. **Fresh context per agent.** Each spawned agent gets a clean context window. Pass explicit file paths and state — never assume agents remember prior conversation.
4. **.NET-first.** Every agent, command, and hook understands .NET conventions: solution structure, project references, DI registration, EF Core migrations, NuGet packages, and test frameworks.

## Agents

Claude Code surfaces each agent's `description:` in the agent list, so this file doesn't restate
the roster — read `agents/dnp-*.md` for detail. What the descriptions don't tell you:

- **Tier the TDD work.** `dnp-tdd-developer-easy` (sonnet/low) handles routine changes and
  returns a `[ROUTING: …hard]` verdict when the task outgrows it. Escalate to
  `dnp-tdd-developer-hard` (opus/medium) on a named signal — architectural choice, cross-layer
  change, unestablished pattern — not on general uncertainty.
- **Agents never prompt the user.** Plugin subagents have no question tool. An agent that needs a
  decision returns `[HALT: <question>]` with the options and what each commits the design to; the
  invoking command asks the user and re-spawns the agent with the answer (`commands/dotnet/tdd.md`
  is the model; for an architectural question it gets a `dnp-architect` recommendation first and
  shows it as the recommended option). Write new agents the same way.
- **Full-stack work runs two agents at once.** `commands/fullstack/feature.md` writes the API
  contract, then spawns a TDD agent and `dnp-frontend-developer` in the same message. The
  contract is the only thing the two share: an agent that needs it changed returns `[HALT`, and
  when the answer changes the contract the command re-briefs the **other** agent too. The
  frontend root may be another repository (`frontend.path` in `.planning/config.json`, or
  `--ui`), so that brief carries it as an absolute path. The frontend agent has no Roslyn tools;
  its `ui-ux-design` skill applies only when the command's design check says the task designs
  something.
- **Scaffolding is TDD work.** `dotnet:scaffold` and `dotnet:add-endpoint` brief
  `dnp-tdd-developer-easy` with the target files and detected conventions — there is no separate
  scaffolder agent.
- **The spec-driven agents are gone.** `dnp-researcher`, `dnp-code-reviewer`, `dnp-plan-checker`,
  and `dnp-executor` were retired in v1.0.0 in favor of stock Claude capabilities; six more
  (planner, verifier, Fable advisor, API scaffolder, build-error resolver, test writer) were
  removed in v3.0.0 — `CHANGELOG.md` maps each to its replacement.

## Hook Behaviors

Triggers and matchers live in `hooks/hooks.json`; each hook's header comment has its full rules. What follows is the purpose of each hook and the decisions behind it.

| Hook | Event | Purpose and non-obvious rules |
|------|-------|-------------------------------|
| `dnp-sync-global-claude-md` | SessionStart | Injects `rules/global-claude-md.md` into `~/.claude/CLAUDE.md` between versioned markers; replaces the block only when the plugin version is newer. Sets `autoUpdate: true` only on an existing `dotnet-pilot-marketplace` entry; never writes a missing or unparseable settings file |
| `dnp-dotnet-priority` | PreToolUse (Agent) | In a .NET cwd, injects `hooks/_lib/routing.md` toward DotnetPilot agents and `mcp__roslyn__*` |
| `dnp-code-analyzer-redirect` | PreToolUse (code-analyzer MCP) | Nudges a C# target toward `mcp__roslyn__*`; a `file_path` in a language the analyzer supports is never a C# target, whatever the cwd |
| `dnp-build-verify` | PostToolUse + PostToolUseFailure (`Bash\|PowerShell`) | Tracks consecutive `dotnet build`/`dotnet test` failures in the build-state file (warn at 3, escalate at 5). Classifies by output text markers because Bash results carry no exit code and piped `\| grep` forms must still count; a TypeScript `error TS…` line is not a fail marker. A green run writes `count: 0` instead of deleting the file |
| `dnp-di-registration-check` | PostToolUse (Write/Edit) | Regex check that a saved `.cs` class is registered somewhere. Silent when a Scrutor `Scan(...)` is present and for framework-activated classes (controllers, hubs, middleware, hosted services, endpoints) |
| `dnp-post-edit-format` | PostToolUse + Stop | Queues saved `.cs` files and runs `dotnet format` per project at Stop, because formatting inside the turn would rewrite files under the model |
| `dnp-stop-verify` | PostToolUse + Stop | At Stop, when `.cs`/`.csproj`/`.razor` files changed and no green build or test ran since, injects `VERIFY BEFORE STOPPING` with the exact commands. `hooks.stop_verify_block` (opt-in) turns it into `{"decision":"block"}` |
| `dnp-adr-nudge` | Stop | When the repo has an ADR directory (its existence is the opt-in), injects `ARCHITECTURE DECISION?` for an added or removed package or project reference, a new project or a new `DbContext`. A version bump is not a signal; each signal set is raised once |
| `dnp-migration-guard` | PreToolUse (Write/Edit) | Warns before a manual edit inside `Migrations/` |
| `dnp-project-scope-guard` | PostToolUse (Write/Edit) | With `focus_projects` in `.planning/STATE.md`, warns on edits outside those projects (`<Focused>.Tests` counts as in scope); at most one advisory per project per hour |
| `dnp-commit-format` | PreToolUse (`Bash\|PowerShell`) | Checks conventional-commit format on plain `git commit -m "..."`; skips heredoc, `--no-edit` and `--file` forms |
| `dnp-git-autoapprove` | PreToolUse (`Bash` only) | **Non-advisory**: returns `permissionDecision: allow` for single `git`/`gh` commands on its allowlist so commit and PR skip the prompt. Biased to under-approve: anything chained, expanded, force-pushed or destructive falls through to the normal prompt. Silent in the `auto`, `dontAsk` and `bypassPermissions` modes, where an allow would only override the Auto-mode classifier's push/PR block. PowerShell is never approved (its `;`/`&` semantics differ) |
| `dnp-statusline-sync` | SessionStart | Refreshes `~/.claude/dnp-statusline.js` when `STATUSLINE_VERSION` is newer. Wires `statusLine` in settings only when `statusline.auto_enable` is true, backing up any previous one once; manual install is `/dotnet-pilot:utility:statusline` |
| `dnp-subagent-result` | SubagentStop (`dotnet-pilot:dnp-.*`) | Surfaces a `[HALT`, `[PARTIAL` or `[ROUTING:` verdict via `systemMessage`, so a halted or re-routed worker is not silently absorbed |

Hook `timeout` values are seconds (`hooks.json`); no hook uses `async: true`, which would drop `additionalContext`. `hookEnabled` keys default **on**, `hookFlag` keys default **off**; both live in `hooks/_lib/config.js`.

### Code Mode (experimental, `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`, v2.1.323+)

Tool calls made from Claude's JavaScript still reach `PreToolUse`/`PostToolUse` hooks under their usual names (`Bash`, `Edit`), so the hooks above apply unchanged. Three differences matter here:

- A `PreToolUse` hook that fails to start, exits 126/127/>128 or times out **refuses** the call. Every `PreToolUse` entry in `hooks.json` therefore carries `"onFailure": "continue"`, which keeps them advisory.
- Commands can arrive compounded (`cd 'app' && git commit -m "…"`). `dnp-git-autoapprove` already falls through to the normal prompt for chained commands; `dnp-commit-format` parses only a plain `git commit -m` and may skip a compound one.
- To inspect the code itself, match the `REPL` tool and read `tool_input.code`. No hook here does.

Code Mode refuses to start when "an installed mod … checks tool calls" or a plugin it does not yet support is active. The mods in `hooks/mods/` register `tool.call` handlers (`build-status`, `pressure`, `mcp-health`, `pixel-city`); whether that blocks Code Mode is unverified.

## Review Workflow

`/dotnet-pilot:quality:review` is the one Workflow-backed command. `commands/quality/review.md` is a
thin orchestrator: it runs `scripts/dnp-review-preflight.js` (Node ≥18, no deps) to write `diff.patch`,
per-file shards of ≤400 lines and `manifest.json` under `${CLAUDE_PLUGIN_DATA}/review/<runId>/`, probes
for `mcp__roslyn__*`, then starts the `dnp-review` workflow with every path passed via `args`. Workflow
scripts have no filesystem access and cannot expand `${CLAUDE_PLUGIN_ROOT}`, so the manifest carries
`scriptPath` and `skillsDir` as absolute paths.

`workflows/dnp-review.js` is found by the default `workflows/*.js` scan — do **not** add a `workflows`
key to `plugin.json`, it would replace that scan (the consistency check fails on it). The command passes the
manifest's `shards` and `files` in `args`; the workflow validates them in JS (`fileCount` cross-check,
shard shape) and falls back to per-file `shardPath` grouping, then to the whole diff as one unit. Stages:
one haiku scout per shard (at most 6/6/7 by depth, and never more than the cap leaves room for) primed
with the skill packs `PATH_PACKS` maps from the file paths; findings on the same file and category within
two lines are merged, lens findings are kept only in their own categories, then one adversarial opus confirmer per deduplicated finding
(a confirmation without a `file:line` citation is refuted; security / performance / DI / architecture
findings route to `dnp-security-auditor`, `dnp-performance-analyst`, `dnp-di-wiring-checker`,
`dnp-architect` at `standard`+ — every confirmer, routed or not, runs on `opus` via the `agent()`
model override, and a routed confirmer is told to judge the one finding, not audit the solution), and a sonnet
narrator only when three or more findings survive. `renderMarkdown()` builds the digest in JS, so the
same manifest yields the same section order every run; it numbers findings across Confirmed and
Unconfirmed and puts a `Verdict:` line first. The `lean` category (code the codebase or framework
already provides, a package for a few lines, new code with no caller) is confirmed against the
`lean-dotnet` pack, and every scout, lens and confirmer treats a `// shortcut: <limit>, <upgrade>`
line as a recorded decision. Depth caps total agents: `quick` 6 (scouts only),
`standard` 11, `deep` 20 (adds four lens sweeps). The result always carries
`{ok, runId, requested, returned, failed, broken, confirmed, refuted, unconfirmed, markdown, summary}`;
skipped paths (generated code, `Migrations/`, `bin`/`obj`, lockfiles, non-.NET assets), failed scouts
and cap-dropped findings (labelled "agent cap reached") are named under Coverage gaps, never omitted.

Validating a workflow script: `node --check` passes any `export`-leading file trivially. Strip
`export`, wrap the body in `AsyncFunction('agent','pipeline','parallel','phase','log','args','budget','workflow', src)`
and let it throw. `Date.now`, `Math.random`, argless `new Date()`, `require`, `process` and `fs` are
unavailable inside workflow scripts and must not appear.

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

**Shared build-fail state contract:** `hooks/_lib/build-state.js` owns
`os.tmpdir()/dnp-build-fail-<sha1(cwd)>.json` — schema v2 `{v, count, lastFail, lastSuccess, lastCommand, lastKind}`,
covering both `dotnet build` and `dotnet test`. `dnp-build-verify` writes it (a green run writes `count: 0`
rather than unlinking, so `dnp-stop-verify` can tell "green" from "never built"), and the statusline's
`BUILD ✗ Nx` segment reads it. The installed statusline copy in `~/.claude` is standalone, so the `sha1(cwd)`
hex-digest path scheme is duplicated verbatim in `statusline/dnp-statusline.js` and must match
`build-state.js` exactly, or the statusline reads the wrong file. State older than 1h is treated as stale.

## What DotnetPilot does NOT do

Use these native Claude Code primitives instead — they evolve with Claude Code and don't drift:

- Multi-step planning → **Plan Mode** (`EnterPlanMode`) + `TaskCreate`
- General code review → stock `code-reviewer` agent (`/dotnet-pilot:quality:review` is the .NET-specific complement, not a replacement)
- Security audit → stock `/security-review` command
- Research → Context7 MCP (`mcp__context7__*`) or `WebSearch`
- Tracking work within a conversation → `TaskCreate` / `TaskUpdate`
- Gathering user intent → Claude Code's question prompt, from the command layer only (see Agents)
- Initial project README → stock `/init`

## State directory (optional — requires `dotnet-pilot-workflow` companion plugin)

For teams that want lightweight persistent state (a PROJECT.md, a roadmap, phase tracking) install the optional `dotnet-pilot-workflow` plugin. It owns that part of the `.planning/` directory.

`dotnet-pilot` (this plugin) writes only `config.json` and `solution-map.json` there (`/dotnet-pilot:project:init`) and reads `config.json` if present to respect per-project hook toggles; nothing requires it.

## .NET Conventions

The layer rules, DI patterns, and convention detection live in the `clean-architecture` and
`convention-learner` skills — load them rather than duplicating them here. Two things that only
apply inside this plugin's world:

- **Migrations come from the CLI.** `dotnet ef migrations add`, never a hand-written migration
  file, and always `--context` when the solution has more than one `DbContext`.
- **`.planning/solution-map.json` is the cached project graph.** Read it before re-scanning the
  solution; `commands/project/init.md` documents its schema (`projects` is an array).

## Commit Convention

Use conventional commits scoped to the .NET project name:

```
feat(Api): add UserController with CRUD endpoints
```

## Configuration Reference

`.planning/config.json` is owned by the optional `dotnet-pilot-workflow` plugin; this plugin only
reads its `hooks.*`, `dotnet.*`, and `statusline.*` sections and `frontend.path` (the React client root, relative to the cwd or absolute; `frontendRoot` resolves it), and every hook defaults on when the
file is absent. `hooks/_lib/config.js` is the resolver and the authoritative key list.

Three non-obvious defaults:

- `hooks.stop_verify_block` is the one **opt-in** hook key (read via `hookFlag`, default-off): it turns
  the Stop-time verification nudge into a block. Every other `hooks.*` key is default-on and only ever
  switches a hook off.
- `statusline.auto_enable` defaults to **false** because wiring it mutates
  `~/.claude/settings.json`, which may already hold another `statusLine`. The sync hook refreshes
  the installed script regardless; opt in via the key or `/dotnet-pilot:utility:statusline`.
- Keys from the retired spec-driven pipeline (`workflow.research`, `workflow.plan_check`,
  `workflow.verifier`, `workflow.auto_advance`, `parallelization.*`, `gates.*`,
  `git.phase_branch_template`) are silently ignored — finding one in a config file does not mean
  it does anything.
