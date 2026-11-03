# 4. MCP reliability: `mcp-health` mod

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
- No hook input and no status line field carries MCP state.
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
   - Connected: run a cheap probe, `$.mcp.call('roslyn', 'get_solution_structure', {})`, with a
     timeout, to confirm it answers, not just that the process is up. On success, set status
     `roslyn ✓`.
   - `reason: 'failed'`: retry with backoff via `$.clock.after` at 2 s, 5 s, then 15 s (three
     tries). Each try is a new `$.mcp.connect`. Stop at the first success.
   - Any other reason: no retry. Map it to one line of advice:

     | reason | message |
     |--------|---------|
     | `unapproved` | Approve the plugin's MCP server in `/mcp`. |
     | `disabled` | Enabled = off for `roslyn` in `/mcp`. |
     | `policy` | Blocked by managed policy. Ask an admin. |
     | `auth` | Needs authentication (not expected for stdio). |
     | `unlisted` | Packaging bug: `.mcp.json` lacks the server. |

2. **When all retries fail**, run diagnostics once:
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
4. **`/dnp-mcp`**: prints each server's state, last reason, retries and the doctor excerpt.
   `/dnp-mcp retry` runs the connect-and-probe loop again on demand.

## Version check

`.mcp.json` sets `DNP_ROSLYN_MIN_VERSION=0.3`, but nothing in the repo reads it. A grep of
`mcp/dotnet-pilot-mcp-roslyn/src` and `hooks/_lib` finds no reader. Choose one:

- **Enforce it in the server**: `Program.cs` reads the variable and exits with a clear stderr line
  when its own version is lower. Then `doctor` reports it as well.
- **Or enforce it in the mod**: run `dnp-roslyn version`, compare it with a constant in
  `mcp-health.ts`, and delete the env var from `.mcp.json`. This keeps the fact in one place.

The second option is simpler, and the minimum moves with plugin releases, so recommend it.

## State

```ts
export type McpServerHealth = {
  server: string
  state: 'ok' | 'retrying' | 'down'
  reason?: string          // McpConnectResult reason or a doctor classification
  attempts: number
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
- Hooks used: `command.run` `{ command: 'dnp-mcp' }`, plus the dispatcher. Optionally
  `classic.PostToolUseFailure` for `mcp__roslyn__*` (does it fire for MCP tool failures? See
  UNCONFIRMED) to trigger a re-check mid-session.

## Tests (`hooks/mods/mcp-health.test.ts`)

- A `failed` result retries 3 times with the 2/5/15 s schedule (fake clock), then runs `doctor`
  and sets `down`.
- `unapproved` / `disabled` / `policy` produce no retry and the right advice line.
- Connected but the probe times out gives `down`, with reason `unresponsive`.
- The compose section is present only while a server is down, and it's gone after a successful
  `/dnp-mcp retry`.
- Healthy start: no toast, and the status is set once.

## Acceptance

- With `dnp-roslyn` uninstalled, a new session shows `roslyn ✗ not installed` and a toast with the
  install command within ~25 s. An agent asked to find references uses Grep and says so.
- After installing the tool, `/dnp-mcp retry` turns it green without restarting the session.

## UNCONFIRMED

- Whether `$.mcp.connect` on a **failed** stdio server restarts the process (a real reconnect) or
  only reports the cached state. This decides whether retry can fix a transient failure or only
  re-check it. Check: start a session with `dnp-roslyn` renamed, restore it, and call
  `/dnp-mcp retry`.
- Whether `classic.PostToolUseFailure` fires for MCP tool errors (the docs exclude unknown tools,
  schema failures and permission denials, and are silent on MCP).
- Whether `$.process.run` resolves global tool shims on `PATH` the same way the MCP launcher does
  on Windows (`dnp-roslyn.exe` under `%USERPROFILE%\.dotnet\tools`).
