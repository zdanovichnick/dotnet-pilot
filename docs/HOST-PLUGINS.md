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
server. If the host starts servers in another working directory, configure that server's
arguments with `--solution` and the absolute solution path. Select a context explicitly
when there is more than one. No API key is required for this local MCP server.

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

Package generation and content validation are automated. Codex CLI local marketplace
registration, plugin installation, and installed listing were verified on Windows on
2026-10-30 using a disposable profile. Full interactive installation,
tool discovery, and end-to-end workflows must be tested in each target app before claiming
verified runtime support. CLI installation tests, when run, do not establish desktop parity.

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

1. Install into a clean host profile and open a small, buildable .NET solution.
2. Confirm skills/commands appear and only one Roslyn server starts. Invoke solution
   structure and DI checks; ensure host-prefixed tool names resolve.
3. Run init, verify state at the default path, repeat with `DNP_PLANNING_DIR`, and check
   that no Claude settings changed. Test the multiple-solution prompt.
4. Run health-check and run-tests, including an intentional failing test. Confirm failures
   and skipped semantic checks are accurately reported. Repeat without Roslyn available.
5. Create an entity in a disposable solution. Verify conventions, DI registration, build,
   and tests. Generate a migration; inspect `Up()` and SQL without applying it to a database.
6. Confirm no automatic hook, commit, push, or publishing action occurs during these checks.

## Official references

Requirements checked against documentation on 2026-10-30:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI local MCP submission requirements](https://developers.openai.com/plugins/deploy/desktop-only)
- [Codex CLI plugin commands](https://learn.chatgpt.com/docs/cli/reference)
- [Codex marketplace format](https://learn.chatgpt.com/docs/enterprise/plugin-management)
- [Cursor plugin reference](https://prod.cursor.com/docs/reference/plugins)
- [Cursor local testing and installation](https://prod.cursor.com/docs/plugins)
