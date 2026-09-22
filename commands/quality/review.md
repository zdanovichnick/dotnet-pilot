---
description: "Sharded .NET code review of the current changes — haiku scouts per diff shard, sonnet confirmers per finding, one deterministic digest."
argument-hint: "[--base <ref> | --staged | --last-commit | --scope <glob>] [--depth quick|standard|deep]"
effort: medium
allowed-tools: Bash(node:*), Workflow, ToolSearch
---

# Code Review

`/dotnet-pilot:quality:review` runs the `/dotnet-pilot:dnp-review` workflow: a Node preflight shards the diff, haiku scouts read each shard, sonnet confirmers try to refute every finding, and a fixed-format digest reports what was confirmed, refuted and left uncovered. Same change set, same report shape, every run.

## Steps

1. **Parse `$ARGUMENTS`.** At most one selection flag: `--base <ref>` (merge-base of `<ref>` and HEAD up to HEAD), `--staged`, `--last-commit`, or `--scope <glob>` (working tree limited to a git pathspec). No flag means the whole working tree, untracked files included. `--depth quick|standard|deep` defaults to `standard`. Anything else: show the argument hint and stop.

2. **Preflight.** From the repository under review run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/dnp-review-preflight.js" --repo "<cwd>" --out "${CLAUDE_PLUGIN_DATA}/review" <selection flag, if any>
   ```
   It prints one JSON manifest. `ok: false` → print `error` and stop. `fileCount: 0` → say "nothing to review (mode: <mode>)" and stop. Otherwise keep `scriptPath`, `manifestPath`, `diffPath`, `shardsDir`, `repoRoot`, `skillsDir`, `runId` and `fileCount`.

3. **Probe Roslyn.** `ToolSearch` with query `+roslyn`; `roslynAvailable` is `true` when any `mcp__roslyn__*` tool is returned, otherwise `false`.

4. **Run the workflow.**
   ```
   Workflow({ scriptPath: <manifest.scriptPath>,
              args: { manifestPath, diffPath, shardsDir, repoRoot, skillsDir, runId, fileCount, depth, roslynAvailable } })
   ```
   `args` is a JSON object, never a stringified one. If the tool asks for permission on every run, the permission rule `Workflow(dnp-review)` silences it.

5. **Report.** Print `result.markdown` verbatim, then `result.summary` as the closing line. The digest is the deliverable: do not re-summarize or re-rank its findings. `result.ok === false` means the workflow did not start; its `markdown` says why. `result.broken === true` means some shards were never read; say so and point at the Coverage gaps section.

## Depth

| depth | agents | stages |
|---|---|---|
| `quick` | ≤6 | triage + haiku scouts; findings are reported unconfirmed |
| `standard` | ≤11 | + one sonnet confirmer per finding; security / performance / DI / architecture findings are routed to `dnp-security-auditor`, `dnp-performance-analyst`, `dnp-di-wiring-checker` and `dnp-architect` (the last on Fable) |
| `deep` | ≤20 | + four haiku lens sweeps (security, performance, architecture, testing) over the whole diff |

Run artifacts live under `${CLAUDE_PLUGIN_DATA}/review/<runId>/` (`diff.patch`, `shards/`, `manifest.json`). Generated code, `Migrations/`, `bin`/`obj`, lockfiles and non-.NET assets are listed under Coverage gaps rather than reviewed.
