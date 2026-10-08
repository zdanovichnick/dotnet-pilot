# Changelog

All notable changes to the DotnetPilot plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The Roslyn MCP companion
(`mcp/dotnet-pilot-mcp-roslyn`) is versioned separately in its `.csproj`.

## [3.5.1] - 2026-10-08

### Fixed

- **Statusline effort on Haiku 5.5.** `LEGACY_USER_EFFORT` matched any `claude-haiku*` id, so on
  Haiku 5.5 the line reported a top-level user-file `effortLevel` as configured (`(set: …)`), which
  Claude Code ignores for models released from Opus 5.5 on. The pattern now matches `haiku-4` only.

### Changed

- **Consistency check allows `haiku` with `effort:`.** The `haiku` alias resolves to Haiku 5.5,
  which supports every effort level, on the Anthropic API; it still resolves to Haiku 4.5 (effort
  dropped) on Bedrock, Google Cloud, Foundry and Claude Platform on AWS. `CLAUDE.md` and `README.md`
  state the provider split. Agent models are unchanged.

## [3.5.0] - 2026-10-03

### Fixed

- **Test-integrity guard covers `Write`.** `pressure.ts` hooked only `Edit`, so overwriting a test
  file with `Write` bypassed the toast, the pressure bump and the opt-in block. A `Write` to a test
  file is now compared with the file on disk and judged by the same `integrityReasons`; a new file
  has nothing to loosen and is not flagged. Bash/PowerShell writes are still not inspected.
- **Pressure status is visible from session start.** The mod cleared its status line whenever the
  score was 0, which is every fresh session, so nothing showed until a `dotnet` run moved it. It now
  shows `pressure 0 steady` from `session.start` and after a green run brings the score back to 0.
- **Correction detection** matched `again`, `wrong` and `revert` anywhere ("try again with…",
  "what's wrong with this query?"). It now needs a phrase about a failing result ("still fails",
  "doesn't work", "same error again", "revert that").

### Changed

- **`dnp-post-edit-format` formats at Stop.** It used to run `dotnet format` (an MSBuild project
  load, up to 25 s) after every `.cs` save and could rewrite the file under the model, leaving its
  next `Edit` with a stale `old_string`. The PostToolUse leg now only queues the path; the Stop
  leg runs one `dotnet format --include <files>` per project and reports failures through
  `systemMessage`. The PostToolUse timeout drops from 30 s to 5 s.

## [3.4.0] - 2026-10-02

### Added

- **Pressure meter mod** (`hooks/mods/pressure.ts`). Anthropic's interpretability research on
  Claude Sonnet 4.5 ("Emotion concepts and their function") found a *desperation* representation
  that rises under mounting failure and causally raises reward hacking — editing tests so they pass.
  A mod cannot read activations, so this one scores the observable proxy:
  - **Score 0–100** in the status line (`pressure N steady|strained|high`): red `dotnet build`
    +25, red `dotnet test` +30, a file re-edited after a red run +10, a correction in the prompt
    +10, a loosening test edit +25; a green run −45. Stale after an hour. `/dnp-pressure` lists the
    events behind the score.
  - **Test-integrity guard.** After a red run, an `Edit` to a test file that adds `Skip`/`Ignore`,
    removes an assertion or a test attribute, or comments an assertion out gets a toast. With the
    new `pressure_test_guard_block` option it is denied while the score is ≥ 60; off by default,
    consistent with the advisory-hooks rule.
  - **Prompt section while high.** At ≥ 60 a session-scoped `prompt.compose` section asks the
    model to state the blocker or return `[HALT: …]` rather than retry, and not to alter tests.
    It disappears once a green run brings the score down.
- `userConfig` options `pressure` (default on) and `pressure_test_guard_block` (default off).
- `types/index.d.ts` gains the `pressure` state contract.

## [3.3.0] - 2026-10-02

### Added

- A Claude Code **mod** (`hooks/mods/register.ts`, declared in `hooks/hooks.json` under `modules`)
  with two features. It is additive: the Node hooks stay, so builds without mod support behave as
  before.
  - **Build-failure toasts.** After `dotnet build` / `dotnet test` through the Bash or PowerShell
    tool, the mod classifies the output with the same markers as `dnp-build-verify` and shows a toast
    at the 3rd and 5th consecutive failure. The streak lives in the mod's session state and goes
    stale after an hour. It does not replace the `os.tmpdir()` state file the statusline and
    `dnp-stop-verify` read.
  - **Routing roster in the system prompt.** In a .NET project (a `.sln`/`.slnx`/`.csproj` within
    five parent directories) a `prompt.compose` hook appends the routing guidance once as a
    session-scoped section, instead of nudging on every `Agent` call.
- `userConfig` toggles `build_status` and `routing` (both default on). A mod cannot read the
  user-scoped `.planning/config.json`, so these replace the `hooks.*` keys for the mod only.
- `hooks/_lib/routing.md`: the routing text, read by both `dnp-dotnet-priority` and the routing mod.
- `types/index.d.ts`: the mod's `$.state` contract. `.claude-plugin/types/` (written by the engine)
  is git-ignored.
- `check-consistency.js` asserts that the mod's marker tables equal `dnp-build-verify.js`'s and that
  both routing consumers read `_lib/routing.md`; `claude plugin test` covers the mod in CI.

### Notes

- With the routing mod active, the `Agent`-call nudge is redundant. Set `hooks.dotnet_priority: false`
  in `.planning/config.json` to drop it; this is not done automatically.

## [3.2.0] - 2026-09-22

### Changed

- Judgment work moves to `opus`, which now resolves to Opus 5.5. It performs at Fable 5.1 level on
  most work for 40% of the price, and it raises fewer false positives in code review.
  - `dnp-architect`: `fable`/`xhigh` → `opus`/`high`.
  - `dnp-tdd-developer-hard`: `sonnet`/`high` → `opus`/`medium`. Medium is Opus 5.5's default effort,
    and at that level it already outperforms Opus 5 at `high`.
  - The other seven agents stay on `sonnet`.
  - Fable access is no longer listed under Requirements.
- `quality:review` runs every confirmer on `opus` through the workflow's `agent()` model override,
  including the ones routed to specialist agents; before this, only the architecture route ran above
  `sonnet`. Scouts stay on `haiku`, and the narrator stays on `sonnet`.
- The thin orchestrator commands drop from `effort: high` to `effort: medium`: `project:verify`,
  `quality:check-architecture`, `quality:de-sloppify`, `dotnet:add-migration`, `dotnet:tdd` and
  `dotnet:scaffold`. Their heavy work runs in agents that set their own effort.
  `quality:security-scan` keeps `high` because it does its work in the caller's context.
- `dotnet:create-entity` is now a thin orchestrator at `effort: medium`. It no longer writes the
  migration itself; it hands off to `dotnet:add-migration`.
- `dotnet:add-migration` runs in a safer order: check for pending migrations, `migrations add`
  (always with `--context`), let `dnp-ef-migration-planner` inspect the generated `Up()`,
  `migrations remove` if it is destructive, build, then emit
  `migrations script <prev> <new> --idempotent` for review. It no longer uses the non-existent
  `database update --dry-run`.
- `quality:review` workflow:
  - The haiku triage stage is gone. The command passes the preflight manifest's `shards` and
    `files`, and the workflow validates them in JS. If they are malformed it falls back to per-file
    `shardPath` grouping, then to the whole diff as one unit.
  - The scout count is bounded by depth (6/6/7) and by the agent cap, so confirmers keep their
    slots.
  - Findings on the same file and category within two lines are merged.
  - Lens findings are kept only in their own categories.
  - Confirmers dropped by the cap are labelled "agent cap reached".
- `dotnet:tdd`, `dotnet:scaffold` and `dotnet:add-endpoint` handle `[ROUTING: …]` and `[PARTIAL …]`
  verdicts, not only `[HALT: …]`.
- The TDD agents load `convention-learner`.
- `dnp-security-auditor`, `dnp-performance-analyst` and `dnp-di-wiring-checker` gain a Focused
  Briefs section: given one routed finding, they judge that finding instead of auditing the
  solution.
- `dnp-refactor-cleaner` never runs `git checkout`, `restore`, `reset` or `stash`, and it reports
  through `[HALT:` and `[PARTIAL:`.
- `project:ship` ticks only the checks that actually ran, and passes the PR body through
  `--body-file -`.
- `dotnet:health-check --fix` stays within the current major version.
- `dnp-sync-global-claude-md` runs at SessionStart instead of before every tool call. It replaces
  the rules block only when the plugin version is newer, compared as semver.
- `dnp-di-registration-check`:
  - Skips framework-activated classes: controllers, hubs, middleware,
    `BackgroundService`/`IHostedService`, page models, view components and FastEndpoints endpoints.
  - Recognises nested generics, `AddHostedService`, `AddHttpClient` and `AddDbContext`.
- `dnp-commit-format` also validates the `-am`, `-m"x"` and `--message=` forms.
- `dnp-stop-verify` and the statusline call `git --no-optional-locks status`, so they no longer
  contend with a concurrent git command for `index.lock`.
- **Breaking for `~/.claude/CLAUDE.md`:** the injected rules block drops its `## Git` and `## Jira`
  sections, and cites RFC 9457 instead of RFC 7807. The next sync removes those sections from the
  block, so copy them outside the `DotnetPilot` markers to keep them.
- Skills:
  - Stale or broken samples corrected across `authentication`, `opentelemetry`, `logging`,
    `aspnet-api-patterns`, `caching`, `resilience`, `testing-dotnet`, `ef-core-patterns`,
    `vertical-slice`, `clean-architecture` and `dotnet-project-init`.
  - `modern-csharp` is cut down to C# 12–14 gotchas, adding an async and cancellation section.
  - `error-handling` now holds the single `Result<TValue, TError>` definition. `ddd` and
    `knowledge/common-infrastructure.md` point to it.
  - New reference files: `error-handling/references/controllers-and-jobs.md` and
    `ddd/references/ef-mapping.md`.
- `assets/architecture.svg`: the top agent tier is now Opus, and it holds `dnp-architect` and
  `dnp-tdd-developer-hard`.

### Security

- `dnp-git-autoapprove` now uses a per-subcommand allowlist. Before this, several commands were
  auto-approved when they should have prompted:
  - a heredoc commit that carried a `curl`;
  - an unquoted `-F -` heredoc;
  - `--output` writing into `.git/hooks`;
  - `reset --hard` and `push --force`;
  - `gh auth token` and `gh repo delete`.

  These now fall through to the normal prompt, along with:
  - long-option prefixes (`--outp`, `--forc`), `+ref`/`:ref` refspecs, `-c core.hooksPath` and
    `--exec-path`;
  - `$`, glob, brace and backslash characters, even inside quotes;
  - heredoc messages with unbalanced parentheses;
  - `--no-verify` commits.
- `dnp-sync-global-claude-md` and `dnp-statusline-sync` no longer overwrite `~/.claude/settings.json`
  with a near-empty object when the file fails to parse. Both use `hooks/_lib/json-file.js`, which
  keeps a BOM and writes atomically.

### Fixed

- The statusline's configured-effort lookup now matches Claude Code's rules for Opus 5.5:
  - A `modelSettings[<model id>].effortLevel` entry is read first in each settings file.
  - A top-level `effortLevel` in `~/.claude/settings.json` counts only for models older than
    Opus 5.5. Newer models ignore it, so a global `effortLevel: xhigh` no longer shows a false
    `(set: xhigh)`.
  - Project and local settings files still apply their top-level key to every model.

## [3.1.0] - 2026-09-22

### Added

- `utility:help` prints a `DotnetPilot vX.Y.Z` banner, every command with its argument hint, and the
  agent (model / effort), skill and hook rosters — each hook with its `hooks.*` toggle key — ahead of
  the "Did you mean" table. The consistency check verifies the banner version and that all four
  rosters and their counts match the directories.
- `check-consistency.js` rejects any `model:` in agent/command frontmatter or a workflow literal that
  is not a family alias (`sonnet|opus|haiku|fable|inherit`) — Claude Code's allowlist substitution is
  documented for aliases only, so a dated ID would lose that fallback.
- `dnp-architect` focused-brief mode: given one finding or one question, it judges that item instead
  of auditing the solution. Used by the routed review confirmer and the `dotnet:tdd` HALT consult below.

### Changed

- `dnp-architect` runs on `fable` (was `opus`) at `effort: xhigh` — the one judgment-heavy agent.
  The other eight agents stay on `sonnet`. Where an organization's model allowlist blocks the
  alias, Claude Code runs the agent on the session model and warns, so the pin does not break
  installs without Fable access. README lists Fable access under Requirements.
- `quality:review` routes `architecture` findings to `dnp-architect` on `fable` at `standard`+ depth
  (security / performance / DI keep their `sonnet` specialists). Every routed confirmer is told to
  judge the one finding rather than audit the solution.
- `dotnet:tdd` answers an architectural `[HALT: <question>]` by consulting `dnp-architect` first and
  listing its pick as the recommended option; other HALTs reach the user directly.
- Injected global rules block: `## Comments` now leads with "minimum comments — only critical ones" —
  a comment earns its place only for a non-obvious why, an invariant a caller must honor, or a
  deliberate deviation from the surrounding pattern.
- `hooks/__tests__/README.md` diagrams the harness run loop and the hook event contract.

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
