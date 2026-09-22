# Changelog

All notable changes to the DotnetPilot plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The Roslyn MCP companion
(`mcp/dotnet-pilot-mcp-roslyn`) is versioned separately in its `.csproj`.

## [3.0.0] - 2026-09-22

### BREAKING

- **13 commands removed.** `/dotnet-pilot:utility:help` prints a "Did you mean" table for each.
  - `dotnet:add-project`, `dotnet:add-service`, `dotnet:create-api` → `dotnet:scaffold project|service|api`
  - `dotnet:write-tests` → `dotnet:tdd --existing <class|file|project>`
  - `project:checkpoint`, `quality:commit-check` → `project:verify --quick`
  - `quality:check-packages` → `dotnet:health-check` (versions) / `quality:security-scan` (vulnerabilities)
  - `utility:show-solution` → `mcp__roslyn__get_solution_structure` or `.planning/solution-map.json`
  - `utility:settings` → edit `.planning/config.json` directly (`hooks/_lib/config.js` lists the keys)
  - `dotnet:build-fix`, `project:next`, `utility:quick-fix`, `utility:status` → no replacement; run
    `dotnet build`, Plan Mode + `TaskCreate`, a plain request, and `git status` + `TaskList` respectively
- **6 agents removed**: `dnp-planner` (Plan Mode + `TaskCreate`), `dnp-verifier` (`project:verify`),
  `dnp-fable-advisor` (consult `dnp-architect`), `dnp-api-scaffolder` and `dnp-test-writer`
  (`dnp-tdd-developer-easy`), `dnp-build-error-resolver` (`dotnet build` inline; the `dnp-build-verify`
  hook escalates after repeated failures).
- **Agents no longer prompt the user.** `AskUserQuestion` left every agent's `tools:`;
  `dnp-tdd-developer-hard` returns `[HALT: <question>]` and the invoking command asks, then
  re-briefs the agent with the answer. `permissionMode` and the scoped `Bash(dotnet:*)` form were
  dropped from agent frontmatter — plugin subagents never honored either.
- **`skills/blazor-patterns` removed** (placeholder content).
- **Injected global rules block trimmed** (`rules/global-claude-md.md`, ~78 → ~47 lines). Rules the
  hooks already enforce — commit format, git auto-approval, format-on-save — and rules the model
  infers were cut. The `## .NET Tooling Priority` section is unchanged.
- **`hooks.json` no longer declares `$hook_protocol_version`**; `dnp-post-edit-format`'s timeout is
  now `30`. Hook timeouts are in seconds, so the previous `15000` amounted to no timeout at all.
- **Build-fail state file is schema v2** (`{v, count, lastFail, lastSuccess, lastCommand, lastKind}`).
  A green build writes `count: 0` instead of deleting the file so the Stop hook can distinguish
  "green" from "never built". The path scheme (`os.tmpdir()/dnp-build-fail-<sha1(cwd)>.json`) is unchanged.
- `dnp-git-autoapprove` no longer approves `git config`, `gh api`, `git rebase --exec`/`-x`,
  `git fetch`/`pull` carrying `-u` or `--upload-pack`, or `git push --receive-pack`, and only reacts to
  the `Bash` tool — the PowerShell tool falls through to the normal prompt. Those forms will prompt again.

### Added

- `dotnet:scaffold` modes: `feature` (default), `api`, `service`, `project`.
- `dotnet:tdd --existing <target>` writes characterization tests against existing code without
  touching production files.
- `project:verify --quick` — the pre-commit form: build and tests stop on failure, then
  `dotnet format --verify-no-changes`, DI and architecture as warnings, `git status --porcelain` summary.
- `disable-model-invocation: true` on `project:init`, `project:ship`, `utility:statusline`, and
  `dotnet:add-migration` so side-effect commands run only when typed.
- `when_to_use:` on every `SKILL.md`; `argument-hint` on `testing-dotnet`.
- `skills/authentication`, `skills/caching`, `skills/resilience` split into a short `SKILL.md`
  (decision tables, Do/Don't, index) plus `references/*.md` loaded one at a time.
- `hooks/_lib/build-state.js` — shared reader/writer for the build-fail state consumed by
  `dnp-build-verify`, `dnp-stop-verify`, and the statusline.
- `dnp-stop-verify` hook (`Stop` + `PostToolUse` on `Write|Edit|MultiEdit`): when a `.cs`/`.csproj`/`.razor`
  file was edited, the tree has uncommitted source changes, and no green `dotnet build`/`dotnet test` has
  been recorded since, nudges with the exact commands for the nearest solution. Silent on
  `stop_hook_active`, outside .NET projects, and once the edit marker is older than 2 h. Advisory;
  `hooks.stop_verify_block: true` in `.planning/config.json` makes it block (once — `stop_hook_active`
  ends the loop). Toggle `hooks.stop_verify`.
- `dnp-subagent-result` hook (`SubagentStop`, matcher `dotnet-pilot:dnp-.*`): surfaces `[HALT`,
  `[PARTIAL`, and `[ROUTING:` verdicts from workers as a `systemMessage`. Toggle `hooks.subagent_result`.
- `hookFlag(cwd, key)` in `hooks/_lib/config.js` for default-off opt-in booleans; `hooks.sync_global_claude_md`
  joins the default-on `hookEnabled` keys so the global-rules sync can be switched off per project.
- `hooks/__tests__/check-consistency.js` — version parity across `plugin.json`, `marketplace.json`,
  and `STATUSLINE_VERSION`; hook registration; agent/command/skill frontmatter; every
  `/dotnet-pilot:<cat>:<name>` reference and backticked `dnp-*` name resolves; README lists every
  command and agent.
- `.github/workflows/hooks.yml` — runs the hook harness and consistency check on Ubuntu and Windows,
  plus `claude plugin validate --strict` over `agents/`, `commands/`, and `skills/`; the manifest
  validation is advisory (`continue-on-error`) because `--strict` warns that the repo's root `CLAUDE.md`
  is not loaded as plugin context, which is expected for a development guide.
- Hook harness fixtures use the real payload shapes: `tool_response` objects on `PostToolUse`, the
  `Error: Exit code N` string on `PostToolUseFailure`, PowerShell-tool payloads, an array-shaped
  `solution-map.json`, and `Stop` / `SubagentStop` events (74 cases).
- `quality:review` is Workflow-backed: `scripts/dnp-review-preflight.js` shards the diff,
  `workflows/dnp-review.js` runs triage → haiku scouts per shard → sonnet confirmers per finding
  (security/performance/DI findings routed to `dnp-security-auditor`, `dnp-performance-analyst`,
  `dnp-di-wiring-checker` at `standard`+ depth) → deterministic digest. Selection flags `--base`,
  `--staged`, `--last-commit`, `--scope`; depths `quick|standard|deep` (`quick` reports scout findings
  unconfirmed). Generated code, `Migrations/`, `bin`/`obj`, lockfiles and non-.NET assets (TypeScript,
  CSS, Markdown, images) are listed under Coverage gaps rather than reviewed, as is every shard a scout
  failed to read; the result always carries `{requested, returned, failed, broken}` so partial coverage
  is reported, never implied.
- `CHANGELOG.md` (this file); `displayName: "DotnetPilot"` in `plugin.json`; a top-level
  `description` in `marketplace.json`.
- `dnp-architect` loads the `clean-architecture` skill and `dnp-ef-migration-planner` loads
  `ef-core-patterns` via `skills:`.

### Changed

- `testing-dotnet` skill: examples use NSubstitute instead of Moq and `WebApplicationFactory` over a
  Testcontainers SQL Server instead of the in-memory EF provider; a mocking-library comparison table
  covers Moq and FakeItEasy for existing projects.
- `project:init` is ~48 lines and the single place that documents `.planning/solution-map.json`
  (`projects` is an array of `{name, path, type, layer, framework, references, notes?}`) and the
  `config.json` keys; it writes files and asks nothing.
- `dotnet:add-endpoint` and `dotnet:scaffold` brief `dnp-tdd-developer-easy` with the target files
  and detected conventions.
- `dotnet:run-tests` runs in the caller's context and hands production fixes to `dotnet:tdd`.
- `dotnet:add-migration` asks which `DbContext` to target when more than one exists and requires
  explicit confirmation on breaking changes (no longer gated by a config key).
- `dnp-build-verify` is registered on both `PostToolUse` and `PostToolUseFailure` with matcher
  `Bash|PowerShell`, classifies by output text (so piped `2>&1 | grep` builds still count), and
  ignores `dotnet run`. `dnp-commit-format` matcher widened to `Bash|PowerShell`.
- `dnp-project-scope-guard` reads `solution-map.json` as an array of projects, treats
  `<Focused>.Tests` as in scope, and rate-limits identical advisories to one per project per hour.
- `dnp-git-autoapprove` rejects `&` and multi-line commands.
- Statusline hides the `BUILD ✗` segment for a green v2 state file.
- `plugin.json` / `marketplace.json` descriptions no longer embed counts.
- `assets/architecture.svg` reflects the surviving commands and agents.

### Fixed

- Scope guard named the array index (`3`) instead of the project when `solution-map.json` used the
  array shape `project:init` writes.
- `dnp-build-verify` read `data.tool_result`, but the `PostToolUse` payload field is `tool_response`, so
  the hook never saw build output (it fired once in ~1,700 recorded hook runs) and the statusline
  `BUILD ✗` counter never lit. The harness fed the same wrong key, so its tests were green against
  fiction. Failures now also register on `PostToolUseFailure` and on builds piped through `grep`.
- `dnp-post-edit-format` internal timeout raised to 25 s to match the hook budget.
- A second line after an approved `git status` was auto-approved along with it.

## [2.7.0] - 2026-08-27

### Changed

- Statusline restyle: `EFF` label replaces the `⚙` glyph, configured-level mismatch reads
  `(set: <configured>)`, every segment has an emoji icon and a saturated value color, context usage
  renders as a threshold-colored 10-cell bar, and cost/context/effort ramp green → yellow → red.
- Context-engineering pass for Claude 5: the two TDD agents shed ~680 lines of guardrail scaffolding;
  test-tier selection, mock-fidelity rules, and boundary-coverage tables moved into the
  `testing-dotnet` skill.
- Injected global rules block lost a live contradiction ("prefer explicit types" vs "always use
  `var`") and duplicated .NET style sections; new Comments rule (default to none).
- `dnp-dotnet-priority` stopped re-injecting the agent roster on every `Agent` call.

### Fixed

- Command references corrected from the never-valid `/DotnetPilot:` prefix to `/dotnet-pilot:`
  (109 occurrences).

## [2.6.0] - 2026-08-25

### Added

- Explicit `effort:` on every agent and command; the six Haiku agents moved to Sonnet + `effort: low`
  because effort is unsupported on Haiku 4.5.
- Fable-5 read-only advisor agent (ADVISE / UNBLOCK / ADJUDICATE) for decision-point consults.
- Statusline renders a mismatch marker when the configured effort level is not in force.

## [2.5.0] – [2.5.3] - 2026-07-02 / 2026-07-03

### Added

- `.NET-aware statusline` (`statusline/dnp-statusline.js`): model, context, git, elapsed, cost, plus a
  .NET line with solution / TFM / build-fail count; `dnp-statusline-sync` SessionStart hook and the
  `/dotnet-pilot:utility:statusline` installer. Reasoning-effort segment, color-coded by level.

### Fixed

- `sha1(cwd)` build-fail state path collision shared with `dnp-build-verify`.

## [2.4.0] - 2026-06-08

### Added

- `.NET-first tooling priority`: `dnp-code-analyzer-redirect` advisory hook and an extended
  `dnp-dotnet-priority` steer C# inspection to `mcp__roslyn__*` over the Python/TS/JS code-analyzer;
  `.NET Tooling Priority` rule in the injected global block; shared `_lib/dotnet.js` detection with
  parent walk-up; both priority hooks config-toggleable.

## [2.3.0] - 2026-06-04

### Added

- `dnp-git-autoapprove` hook: `permissionDecision: allow` for safe single `git`/`gh` commands
  (status/diff/log/add/commit/branch/push, `gh pr create`, heredoc commit).

### Fixed

- Documentation drift and hook robustness hardening.

## [2.2.2] - 2026-05-29

### Changed

- Every agent switched from pinned model IDs to tier aliases (`opus`/`sonnet`/`haiku`).
- Injected global block gained a Git rule: fetch `CODEOWNERS` reviewers when opening PRs.

## [2.2.1] - 2026-05-27

### Fixed

- Shipped the five Roslyn MCP tools agents referenced but the server never implemented:
  `find_symbol`, `find_callers`, `find_dead_code`, `detect_antipatterns`,
  `detect_circular_dependencies`. Roslyn server `0.5.0`; tool count 10 → 15.

## [2.2.0] - 2026-05-27

### Added

- 10 skills (modern C#, error handling, resilience, caching, auth, VSA, DDD, convention learner,
  logging, OpenTelemetry), 9 knowledge docs, 4 agents (build-error resolver, security auditor,
  performance analyst, refactor cleaner), 5 commands (scaffold, security-scan, de-sloppify, a
  build-repair loop, a pre-commit gate), 5 project templates, and the post-edit auto-format hook.

## [2.1.1] - 2026-05-21

### Added

- `dnp-dotnet-priority` hook: detects .NET projects and injects DotnetPilot agent routing before
  generic agents are spawned.

## [2.0.0] - 2026-05-19

### BREAKING

- 12 commands renamed: `pipeline:*` → `project:*`, `scaffold-*` → `create-*`, `audit-*` → `check-*`.

### Added

- A test-generation command and `dotnet:tdd`.
- `dnp-sync-global-claude-md` hook injects .NET code-style rules into `~/.claude/CLAUDE.md` on
  install/update.

## [1.1.0]

### Added

- `pipeline:init/next/status` merged to core; `pipeline:verify`; user-scoped `.planning/` path;
  plugin published to Claude Platform as `dotnet-pilot`.

## [1.0.0]

### BREAKING

- Scope narrowed; the spec-driven pipeline (`dnp-researcher`, `dnp-code-reviewer`, `dnp-plan-checker`,
  `dnp-executor`) retired in favor of stock Claude Code capabilities.

### Added

- Pinned model IDs, hardened hooks, hook test harness.

## [0.3]

### Added

- Roslyn: EF Core model introspection, verbose stderr logging.

## [0.2]

### Added

- Roslyn MCP server: DI analysis, solution structure, file-level queries, architecture checker.

## [0.1]

### Added

- Core pipeline, agents, and hooks.
