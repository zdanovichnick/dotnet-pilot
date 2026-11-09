# Proposals: Claude Code gaps DotnetPilot can close

These are implementation instructions for features Claude Code does not ship natively. Each spec
was checked against existing tools on 2026-11-09 (see each spec's prior-art note):

| # | Feature | Status | Shape | Spec |
|---|---------|--------|-------|------|
| 1 | .NET test debugging | Rescoped | Skill + command debugging `dotnet test` through a user-installed DAP MCP server (mcp-debugger or netcoredbg-mcp); no server of our own | [01-debugger-dap.md](01-debugger-dap.md) |
| 2 | Session and context visibility | Dropped | Covered by cc-viewer and claude-agent-flow | [02-session-context.md](02-session-context.md) |
| 3 | Hook tracing and ordering | Open | Mod timing layer + opt-in Node self-trace | [03-hook-trace.md](03-hook-trace.md) |
| 4 | MCP reliability | Shipped (3.9.0) | Mod: health check, status entry, `/dnp-mcp` for `roslyn` | [04-mcp-health.md](04-mcp-health.md) |

Build order: 3 next, then 1 once its attach-by-PID check passes.

## Scope tension

The repo's "What DotnetPilot does NOT do" rule keeps the plugin narrow and .NET-specific. Features 1
and 4 fit that rule. Features 2 and 3 are generic Claude Code tooling. Before merging either one,
pick one of two options:

- Ship it inside dotnet-pilot behind a userConfig flag that defaults to **off**, and say so in the README.
- Ship it as a separate plugin (or a Kouhesion mod). These specs work unchanged in a standalone
  plugin, except the `$.state` key prefix and the `register.ts` wiring.

## What is verified and what is not

These specs only use API surface checked against the Claude Code 2.1.309 mod type file
(`claude-code.d.ts` from the `plugin-authoring` skill) and the official hooks, MCP, statusline,
sessions and plugins-reference docs. Anything not confirmed is marked **UNCONFIRMED**, and each
spec names the check that would settle it. Before writing code, re-grep the type file the engine
lays in `.claude-plugin/types/claude-code/index.d.ts`: the mod API changes between builds.

Claude Code has no documented debugger, DAP or debugging tool (tools reference: LSP only). So
feature 1 cannot use a native API and has to bring its own adapter.

## Shared constraints (from CLAUDE.md)

- Hooks and mods are **advisory**: exit 0 / `next(e)`, and add context. Deny only for a hard
  safety violation.
- `register.ts` is the one hooks module. The engine allows **one `prompt.compose` per module**
  (owned by `routing.ts`) and the module's **one unmatched `session.start`** belongs to
  `pressure.ts`. New features must not add a second of either:
  - Put the new `session.start` work in `hooks/mods/session-start.ts`, a single dispatcher that
    `register.ts` wires once. It calls each enabled feature's `onSessionStart($, e)` and then
    `next(e)`. Move pressure's start logic into it too, so the order stays deterministic.
  - If a feature needs system-prompt text, add a section builder that `routing.ts` calls. Do not
    add a hook.
- Mods read **only userConfig** (`options` in `register`), never `.planning/config.json`. Node
  hooks use `_lib/config.js` `hookEnabled` (default on) / `hookFlag` (opt-in).
- Every new `$.state` key goes in `types/index.d.ts` under `PluginState['dotnet-pilot']`.
  `claude plugin validate .` rejects keys that are not declared.
- State a fact in one place. Docs link to the spec. They do not restate it.
- Comments describe the code, not the process that produced it (no ticket or plan references).

## Release checklist (every feature)

1. Add userConfig keys to `.claude-plugin/plugin.json` (boolean, with a description).
2. Wire them in `hooks/mods/register.ts` using the existing pattern (`options.x !== false` means
   default on, `=== true` means opt-in).
3. Declare `$.state` shapes in `types/index.d.ts`.
4. Write tests: `hooks/mods/<feature>.test.ts` (run with `claude plugin test .`), Node hook cases
   in `hooks/__tests__/run.js`, and xUnit for any .NET server.
5. Run `claude plugin validate .`, `node hooks/__tests__/run.js` and
   `node hooks/__tests__/check-consistency.js`. All must be green.
6. Update the README tables (commands, mods, userConfig), `commands/utility/help.md` and
   `CHANGELOG.md` `[Unreleased]`.
7. Bump the version in `plugin.json`, `marketplace.json`, `STATUSLINE_VERSION` in
   `statusline/dnp-statusline.js` and the `help.md` banner. MCP servers version in their own
   `.csproj`.
8. Codex/Cursor packages (`scripts/build-host-plugins.js`, see `docs/HOST-PLUGINS.md`) exclude
   hooks and mods. Feature 1's skill and command should be included. Features 2 to 4 should not.
