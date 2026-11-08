# DotnetPilot for Codex and Cursor

These packages adapt the shared DotnetPilot skills, specialist checklists, and core workflows
for local Codex and Cursor sessions. They are generated from the Claude plugin sources;
do not maintain separate copies of the .NET guidance.

## Build

From the repository root, with Node.js 18+:

```text
node scripts/build-host-plugins.js
node scripts/build-host-plugins.js --check
node --test scripts/build-host-plugins.test.js
```

With Codex CLI installed, `node scripts/smoke-codex-plugin.js` tests marketplace registration,
installation, listing, and the cached manifest in a disposable profile, then removes it.
It does not start a model session or test the Roslyn tool calls.

Output:

```text
dist/plugins/codex/
  .agents/plugins/marketplace.json
  dotnet-pilot/plugin.json
  dotnet-pilot/mcp.json
  dotnet-pilot/skills/
dist/plugins/cursor/
  .cursor-plugin/marketplace.json
  dotnet-pilot/.cursor-plugin/plugin.json
  dotnet-pilot/mcp.json
  dotnet-pilot/skills/
  dotnet-pilot/agents/
  dotnet-pilot/commands/
```

Both packages include the license, 15 pattern skills, a navigation skill, and 13 workflow
skills. Cursor additionally exposes the workflows as commands and the nine specialists as
native agents. Codex uses specialist reference checklists in the active agent. Workflows
run directly by default, with no dependency on Claude tools or Anthropic model aliases.

## Prerequisites

Install the .NET 10 SDK and the Roslyn global tool:

```text
dotnet tool install -g DotnetPilot.Mcp.Roslyn
```

If already installed, use `dotnet tool update -g DotnetPilot.Mcp.Roslyn`. Ensure `dnp-roslyn`
is on the app's PATH; restart the app after changing PATH. Open the consumer solution's
directory, containing its `.sln` / `.slnx`. The bundled `mcp.json` starts the `roslyn` stdio
server. Codex starts plugin servers in the plugin's own folder and passes no workspace root,
so the server starts unbound (dnp-roslyn 0.5.3+) and every tool answers `No solution is
loaded`; the model then calls `reload_solution` with `solutionPath` set to the solution and
carries on. To skip that step, add `--solution` and the absolute solution path to the server's
arguments. Select a context explicitly when there is more than one. No API key is required for
this local MCP server.

## Install in Codex

Use a recent Codex CLI that supports `codex plugin`. After building, run from this repo:

```text
codex plugin marketplace add ./dist/plugins/codex
codex plugin add dotnet-pilot@dotnet-pilot-marketplace
```

Start a new local chat. Use the navigation skill with `$dotnet-pilot`, or select a workflow
skill such as `$dnp-project-init`, `$dnp-dotnet-health-check`, or `$dnp-dotnet-create-entity`.
If the host namespaces skill names, select the corresponding installed skill in its picker.
In desktop Codex, inspect the configured marketplace in Plugins and enable DotnetPilot.
The IDE extension does not currently support plugins; use the CLI or desktop surface.

After changing sources, rebuild, refresh/reinstall the local marketplace plugin, and start
a new chat. Keep the generated marketplace folder available while using the local source.
These build commands do not modify the user's global Codex installation or settings.

## Install in Cursor

After building, copy the **entire** `dist/plugins/cursor/dotnet-pilot` folder into
`~/.cursor/plugins/local/dotnet-pilot` (`~` means the user's home directory on Windows too).
The destination must contain `.cursor-plugin/plugin.json`, `mcp.json`, and `skills/`.
Restart Cursor and check Customize for the local plugin and its MCP server. Avoid installing
a second copy of DotnetPilot or registering the same Roslyn server twice.

Choose `/dnp-project-init` or `/dnp-dotnet-health-check` from the command picker. Core
commands use `dnp-<category>-<command>` rather than Claude's colon-separated names.
To update a local development installation, replace that plugin folder with a fresh build
and restart Cursor. A published Git repository must contain the generated package content;
Cursor does not run our build script when installing from a repository.

## State and feature coverage

Initialization writes `<solution-root>/.planning/config.json` and `solution-map.json`.
Set `DNP_PLANNING_DIR` in the host process environment to select another directory;
relative paths resolve from the solution root. Workflows resolve the same directory.
They do not touch Claude's user settings. State should be ignored by Git.

| Capability | Codex package | Cursor package |
| --- | --- | --- |
| .NET pattern skills and references | Included | Included |
| 13 core workflows, including init | Skills | Skills and commands |
| Nine specialist roles | Reference checklists | Checklists and native agents |
| Roslyn MCP | Local stdio configuration | Local stdio configuration |
| Build, test, DI, migration verification | Explicit workflow steps | Explicit workflow steps |
| Automatic hooks, mods, statusline, pixel city | Excluded | Excluded |
| Claude sharded review workflow | Excluded | Excluded |

Package generation and content validation are automated. The Codex CLI smoke checks below
were run on Windows on 2026-11-08 in a disposable `CODEX_HOME`, each step as its own
`codex exec` session (see the results table). Cursor was run the same way with
`cursor-agent -p`; its step 11 migration half is inferred from Codex, not run. CLI runs do
not establish desktop or IDE parity.

## Release and public discovery

The `host-plugins` CI workflow builds and validates both packages on Windows and Linux,
then uploads separate marketplace artifacts. Tags also trigger this workflow. Download
and extract the artifact before local installation; retain its hidden manifest folders.
For a single-plugin submission archive, zip the **contents** of the relevant `dotnet-pilot`
folder so its manifest is at the archive root. Do not upload the source checkout as the
Codex package: it includes Claude-specific hooks that would be auto-discovered.

- **Cursor:** publish the generated Cursor package (or marketplace tree) in a distribution
  repository, then submit its repository URL at <https://cursor.com/marketplace/publish>.
- **OpenAI:** submit the generated portable plugin through the plugin submission portal.
  Local MCP submissions currently require an approved partner organization/allowlisting;
  this package also depends on an installed .NET SDK/global tool, so confirm dependency
  packaging requirements with the reviewer. Local builds do not create a public listing.
- Run the smoke checks below before submission. Record the app versions and results.

## Interactive smoke checks

The fixture is [`samples/SmokeSolution`](../samples/SmokeSolution/README.md); its README lists
the findings each Roslyn tool must return. Server behavior is already checked without an app:

```text
dotnet build samples/SmokeSolution/SmokeSolution.slnx
node scripts/smoke-roslyn.js --server dnp-roslyn
```

Run that first with the installed global tool. If it fails, the problem is the server, not the
host. The checks below cover only what needs the host app. Work on a copy so the repository stays
clean: copy `samples/SmokeSolution` to a temporary directory and open that directory.

| # | Step | Pass when |
|---|------|-----------|
| 1 | Install into a clean host profile; open the copy | The plugin is listed and enabled; no second DotnetPilot copy |
| 2 | List skills/commands | All 13 workflows are present (Cursor: as commands too) |
| 3 | Inspect MCP servers | Exactly one `roslyn` server, connected |
| 4 | Ask for the solution structure, then a DI completeness check | The host calls the Roslyn tools (host-prefixed names resolve) and reports `IPaymentGateway` missing and the `OrderCache` captive dependency — nothing else missing |
| 5 | Run init | `.planning/config.json` and `solution-map.json` at the copy's root; no Claude settings changed |
| 6 | Repeat init with `DNP_PLANNING_DIR=state` | State lands in `state/` under the copy |
| 7 | Add a second `.slnx` next to the first; run init | The workflow asks which solution to use |
| 8 | Run health-check and run-tests | Build and tests reported green |
| 9 | Set `SMOKE_FAIL=1` in the host environment; run run-tests | `SmokeFailure_WhenRequested_Fails` reported as failing — not summarized as green |
| 10 | Remove `dnp-roslyn` from PATH (or rename the shim); restart; run health-check | The report says semantic checks were skipped because Roslyn is unavailable, and falls back to text search explicitly |
| 11 | Create an entity; generate a migration | Entity, EF config and DI registration follow the sample's conventions; build and tests pass; `Up()` and the SQL script are shown, not applied |
| 12 | Review the session | No automatic hook, commit, push, or publish happened |

Record each run here. A host counts as verified only with every row passing on a recorded version.

| Date | Host + version | OS | Roslyn version | Failed steps | Notes |
|------|----------------|----|----------------|--------------|-------|
| 2026-11-08 | Codex CLI 0.167.0-alpha.3.2 (`codex exec`) | Windows 11 Pro 10.0.26200 | 0.5.3-dev.2 | none | Step 4 needed `reload_solution` with `solutionPath` (Codex starts the server in the plugin folder). Step 7 asked which solution. Step 10 reported the semantic skip. Step 11 first failed on the sample's in-memory provider and passed after the sample moved to SQLite with a design-time factory. Desktop app not run |
| 2026-11-08 | Cursor CLI 2026.11.05-86047df (`cursor-agent -p`; desktop 3.29.9 installed) | Windows 11 Pro 10.0.26200 | 0.5.3-dev.2 | none (step 11 migration half inferred) | The CLI loads the plugin from `~/.cursor/plugins/local/dotnet-pilot` with 29 skills, 13 commands, 9 agents and one MCP server, `plugin-dotnet-pilot-roslyn`, ready. In `--mode ask` the Roslyn calls are rejected before they run, so steps ran with `--force`. The step 4 calls (`get_solution_structure`, `check_di_completeness`) ran inside step 8's health-check and reported exactly `IPaymentGateway` missing and the `OrderCache` captive. Step 7 asked which solution. Step 10 said Roslyn MCP was unavailable and used the grep fallback. Step 11 wrote a failing `CustomerServiceTests` first, then the entity, repository, service, EF configuration, `DbContext` set and both DI registrations; the copy built and its 3 tests passed. It stopped at Cursor's Free-plan usage limit before generating the migration, so the migration half was not run on Cursor. It is accepted as inferred from the Codex run, which used the same generated workflow text; re-run step 11 to replace the inference. Desktop app not run |

## Official references

Requirements checked against documentation on 2026-10-30:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI local MCP submission requirements](https://developers.openai.com/plugins/deploy/desktop-only)
- [Codex CLI plugin commands](https://learn.chatgpt.com/docs/cli/reference)
- [Codex marketplace format](https://learn.chatgpt.com/docs/enterprise/plugin-management)
- [Cursor plugin reference](https://prod.cursor.com/docs/reference/plugins)
- [Cursor local testing and installation](https://prod.cursor.com/docs/plugins)
