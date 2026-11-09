# 4. MCP reliability: `mcp-health` mod

> **Implemented** in `hooks/mods/mcp-health.ts` (+ `session-start.ts`, `status-line.ts`). Checked in the real engine (Claude Code 2.1.318, Windows): see **Verified** at the end. That run removed the retry backoff and gated the probe on `$.tool.check`, and this document has been updated to match. A failed `roslyn` tool call re-checks the server through `tool.call`.

## Goal

When `roslyn` (or, later, `debug`) fails to start, the user and the model should both know right
away: which server, why, and what to do. Recovery should be one command. Today a stdio server that
fails in an interactive session stays failed until someone opens `/mcp` and clicks Reconnect. The
agents that whitelist `mcp__roslyn__*` then fail with no explanation.

This happens. A session on this machine on 2026-11-03 reported `plugin:dotnet-pilot:roslyn
(CONNECTION_CLOSED)` at startup.

## What Claude Code gives

- Stdio servers in an interactive session: on failure the server is marked failed, and Reconnect is
  manual (`/mcp`, or `/mcp reconnect all` in v2.1.284+). Under `claude -p` / the Agent SDK, a
  stdio server restarts on the next tool call, and plugin stdio servers skip new `-p` runs for
  15 min after a failure.
- No hook input and no status line field carries MCP state
  ([anthropics/claude-code#101745](https://github.com/anthropics/claude-code/issues/101745), open).
- A plugin cannot revive its own stdio server after a startup failure
  ([anthropics/claude-code#106087](https://github.com/anthropics/claude-code/issues/106087), open);
  see **Verified**.
- A mod can call `$.mcp.connect(server)` for servers **in its own plugin's manifest** only
  (`roslyn`, later `debug`). It resolves to `{ isConnected: true, server }` or
  `{ isConnected: false, reason: 'unlisted' | 'unapproved' | 'disabled' | 'policy' | 'auth' | 'failed' }`.
  `$.mcp.call(server, tool, args)` calls a tool.
- `dnp-roslyn` already has `version` and `doctor` subcommands (`Program.cs`).

## Shape

A mod in `hooks/mods/mcp-health.ts`:

1. **On session start** (from the shared `session-start.ts` dispatcher, not a second unmatched
   `session.start`), for each server in `SERVERS = ['roslyn']` (`'debug'` once feature 1 lands):
   - `const r = await $.mcp.connect(name)`.
   - Connected: run a cheap probe, `$.mcp.call('roslyn', 'detect_circular_dependencies', {})`
     (it walks project references; `get_solution_structure` compiles every project), with a
     timeout, to confirm it answers, not just that the process is up. On success, set status
     `roslyn ✓`. `$.mcp.call` goes through the permission layer, so the probe runs only when
     `$.tool.check` on the model-facing name (`mcp__plugin_dotnet-pilot_roslyn__…`) says `allow`.
     Otherwise it is skipped and the status reads `roslyn ✓ unprobed`. Probing on `ask` would
     open a dialog at session start, and a headless run denies it.
   - `reason: 'failed'`: diagnose at once (step 2). A retry cannot help, because `$.mcp.connect`
     does not respawn a failed server (see Verified). Only Reconnect in `/mcp` does that.
   - Any other reason: no diagnosis. Map it to one line of advice:

     | reason | message |
     |--------|---------|
     | `unapproved` | Approve the plugin's MCP server in `/mcp`. |
     | `disabled` | Enabled = off for `roslyn` in `/mcp`. |
     | `policy` | Blocked by managed policy. Ask an admin. |
     | `auth` | Needs authentication (not expected for stdio). |
     | `unlisted` | Packaging bug: `.mcp.json` lacks the server. |

2. **When the connect fails**, run diagnostics once:
   `$.process.run(['dnp-roslyn', 'doctor'], { cwd: await $.session.cwd(), timeoutMs: 20000 })`. Capture the first
   20 lines and classify the failure:
   - Tool not installed (spawn error / not on PATH): `dotnet tool install -g DotnetPilot.Mcp.Roslyn`.
   - No MSBuild instance: the `doctor` / `Program.cs` error text, so install the .NET SDK.
   - No `.sln`/`.slnx` found: open Claude Code at the solution root, or set `--solution` in
     `.mcp.json` args.
   - Version below the minimum (see below): `dotnet tool update -g DotnetPilot.Mcp.Roslyn`.
3. **Surface it**:
   - `$.ui.status('roslyn ✗ not installed')` (short), plus `$.ui.toast` once with the fix line.
   - Model-facing: add a section builder that `routing.ts` calls (the module's one
     `prompt.compose`). While `roslyn` is down it adds: "Roslyn MCP is unavailable: <reason>. Use
     Grep/Read for C# navigation and say the results are text-based." Then agents degrade on
     purpose instead of failing tool calls.
4. **`/dnp-mcp`**: prints each server's state, last reason, the connect message and the doctor
   excerpt. `/dnp-mcp retry` runs the connect-and-probe check again on demand. After a `failed`
   start it reports the cached failure until the server has been reconnected from `/mcp`.

## Version check

The mod runs `dnp-roslyn version` and compares it with `MIN_ROSLYN_VERSION` in
`hooks/mods/mcp-health.ts` (currently `0.5`). That constant is the only place the minimum
lives; `.mcp.json` carries no version variable. A lower version is reported with
`dotnet tool update -g DotnetPilot.Mcp.Roslyn`.

## State

```ts
export type McpServerHealth = {
  server: string
  state: 'ok' | 'down'
  reason?: string          // McpConnectResult reason, a probe verdict or a doctor classification
  message?: string         // the connect refusal's own sentence
  doctor?: string          // first lines of `doctor` output, no env values
  checkedMs: number
}

export type McpHealth = { servers: McpServerHealth[] }
```

Add `mcpHealth: McpHealth` under `PluginState['dotnet-pilot']`.

## Wiring

- `plugin.json` userConfig: `mcp_health` (boolean, default **on**. It is .NET-specific and silent
  when healthy).
- `register.ts`: `if (options.mcp_health !== false) registerMcpHealth(on)`. Its `onSessionStart`
  goes in the dispatcher, and its compose section goes through `registerCompose`'s options.
- Hooks used: `command.run` `{ command: 'dnp-mcp' }`, plus the dispatcher. `tool.call` on `/^mcp__(?:[A-Za-z0-9-]+_)*roslyn__/` re-checks the server when the call ends in an
  error, and toasts only when it newly went down.

## Tests (`hooks/mods/mcp-health.test.ts`)

- A `failed` result runs `version` then `doctor` at once, sets `down`, and never reconnects.
- `unapproved` / `disabled` / `policy` run no diagnosis and give the right advice line.
- A probe that `$.tool.check` would `ask` or `deny` is never called; the server stays `ok`
  (`unprobed`) with no toast.
- A probe answered with `isError` gives `down`, with reason `probe failed`.
- Connected but the probe times out gives `down`, with reason `unresponsive`.
- The compose section is present only while a server is down, and it's gone after a successful
  `/dnp-mcp retry`.
- Healthy start: no toast, and the status is set once.

## Acceptance

- With `dnp-roslyn` uninstalled, a new session shows `roslyn ✗ not installed` and a toast with the
  install command within a few seconds. An agent asked to find references uses Grep and says so.
- After installing the tool, Reconnect in `/mcp` and then `/dnp-mcp retry` turn it green without
  restarting the session.

## Verified

Checked in Claude Code 2.1.318 on Windows, with headless `--plugin-dir` runs kept alive long
enough for the background check to finish:

- **`$.mcp.connect` does not restart a failed stdio server.** In a folder with a `.csproj` and no
  solution, the debug log shows one `Starting connection`. Each later connect returned the cached
  `failed` in about 1 ms. No call in the plugin API reconnects a server, so the 2/5/15 s backoff
  was removed.
- **`$.process.run` resolves the `dnp-roslyn` shim** from `~/.dotnet/tools` on the Windows PATH.
  `version` exited 0, and `doctor` exited 1 with `Solution: NOT FOUND`, giving `roslyn ✗ no solution`.
- **`$.mcp.call` is permission-gated**, despite its doc comment. Without an allow rule a headless
  run denied the probe (`… refused: …`, a generic `HooksError`), which said nothing about the
  server. That is the reason for the `$.tool.check` gate. With `mcp__plugin_dotnet-pilot_roslyn__*`
  allowed, the probe against `samples/SmokeSolution` answered in 2.6 s and the status was
  `roslyn ✓`.
- **The engine caches a failed connect for 15 minutes, across sessions and folders.** A start in a
  healthy solution shortly after a failure elsewhere got `Skipping connection (recent failure cached;
  retries automatically in 15 min …)` without spawning the server. The mod reports that as
  `failure cached` when doctor finds nothing wrong.
- **`classic.PostToolUseFailure` fires for MCP tool errors.** A `reload_solution` call that the
  server answered with an `McpException` (an `isError` result) dispatched the event with the
  `plugin:dotnet-pilot:roslyn` server (debug log, 2026-11-08). In that profile the organization's
  builtin `cc-plugin-sec-default` is seated outermost and sent both this event and `prompt.compose`
  on past the user tier (`bypassed by cc-plugin-sec-default`), so the dotnet-pilot hooks were
  skipped. That plugin hooks `classic.*` and `prompt.compose` but not `tool.call`, so the re-check
  moved to a `tool.call` hook that reads `isError` from `next(e)`. Re-run in the same profile
  (2026-11-08): the failed `reload_solution` was followed by the mod's `$.mcp.connect` and probe
  call within 200 ms. The compose section is still skipped where such a plugin is seated; the
  status line, toast and `/dnp-mcp` still run.
- **A server started outside a solution** (Codex starts plugin servers in the plugin's own folder)
  stays up from dnp-roslyn 0.5.3 and answers `No solution is loaded …`; the probe reports it as
  `no solution`.
