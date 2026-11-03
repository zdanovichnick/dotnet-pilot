# 1. Native .NET debugging: `dnp-debug` MCP server

## Goal

Claude can set breakpoints, run a .NET app or a single test, stop, and read the stack, locals and
expression values. Today it has to guess from logs. Claude Code has no debugger or DAP support (the
tools reference lists LSP only), so DotnetPilot brings its own.

## Why an MCP server, not a mod

A debug session is a long-lived, interactive stdio conversation with an adapter. A mod can't hold
one: `$.process.run` / `$.process.spawn` take `stdin` as one string up front, not an interactive stream. A
stdio MCP server can, and it follows the pattern `dnp-roslyn` already uses (a .NET global tool,
`ModelContextProtocol` 1.3.0, `WithStdioServerTransport().WithToolsFromAssembly()`).

## Adapter

Use **netcoredbg** (Samsung, MIT licence) in DAP mode: `netcoredbg --interpreter=vscode`, speaking
the Debug Adapter Protocol on stdio.

Do not use `vsdbg`. Its licence limits use to Microsoft's own IDEs. Check that against the current
licence text before anyone proposes it again.

Find the adapter in this order:

1. The `DNP_DEBUG_ADAPTER` env var (absolute path).
2. `netcoredbg` on `PATH`.
3. Neither found: every tool returns a short "adapter not found" result with the install hint. The
   server still starts, so feature 4 can report the reason without the server crash-looping.

v1 does not bundle the binary. It is platform-specific (win-x64, linux-x64/arm64, osx). Bundling is
a later packaging decision.

## Project layout

```
mcp/dotnet-pilot-mcp-debug/
  DotnetPilot.Mcp.Debug.slnx
  global.json                       # same SDK pin as the Roslyn server
  CLAUDE.md                         # server-local rules (copy the Roslyn one's structure)
  src/DotnetPilot.Mcp.Debug/
    DotnetPilot.Mcp.Debug.csproj    # net10.0, PackAsTool, ToolCommandName=dnp-debug, PackageId=DotnetPilot.Mcp.Debug
    Program.cs                      # `version` / `doctor` subcommands, then the MCP host
    Dap/DapClient.cs                # Content-Length framing, seq, request/response correlation, event channel
    Dap/DapMessages.cs              # records for the subset of DAP used (initialize, launch, attach, setBreakpoints, ...)
    Session/DebugSession.cs         # state machine + bounded output ring buffer
    Session/SessionRegistry.cs      # one active session per server process in v1
    Session/BreakpointBook.cs       # per-source breakpoint sets (DAP setBreakpoints replaces a source's whole set)
    Render/ValueRenderer.cs         # depth/size limits, truncation markers
    Tools/*.cs                      # one [McpServerToolType] class per tool group
  tests/DotnetPilot.Mcp.Debug.Tests/
    Fixtures/SampleApp/             # small console app with known locals and a known exception
    Fixtures/SampleTests/           # xUnit project with one failing test
```

Mirror `mcp/dotnet-pilot-mcp-roslyn/.github/workflows/publish-nuget.yml` for publishing.

## Session state machine

`Idle → Initializing → Running ⇄ Stopped → Terminated`. A tool that is invalid in the current
state returns a one-line refusal naming the state, not an exception. The adapter's `stopped`,
`output`, `exited` and `terminated` events are buffered, so a tool call never blocks forever
waiting for an event it missed.

## Tools

MCP tool names show up as `mcp__debug__<name>`, so the names drop a `debug_` prefix.

| Tool | Input | Returns |
|------|-------|---------|
| `launch` | `project` or `dll`, `args[]`, `env{}`, `cwd`, `stopAtEntry=false`, `build=true` | Runs `dotnet build -c Debug` when `build`, then DAP `launch`. Returns session state. |
| `attach` | `pid` | DAP `attach`. |
| `debug_test` | `project`, `filter` | Runs `dotnet test --filter <filter>` with `VSTEST_HOST_DEBUG=1`, reads the testhost PID it prints, attaches, then continues. |
| `set_breakpoints` | `file`, `lines[]`, optional `condition`, `hitCondition`, `logMessage` per line | Merges into `BreakpointBook`, sends the full set for that source, returns each breakpoint's `verified` flag and the **actual** line (adapters move breakpoints off lines with no IL). |
| `set_exception_breakpoints` | `filters[]` | Uses the filter ids from the adapter's `initialize` response (`exceptionBreakpointFilters`). Never hardcode them. |
| `continue` / `pause` | `threadId?` | New state. |
| `step` | `kind: over\|in\|out`, `threadId?` | Waits for the next stop (bounded) and returns it. |
| `wait_for_stop` | `timeoutMs=30000` | Stop reason, thread, top 5 frames and top-frame locals. On timeout, returns `still running` (not an error). |
| `stack_trace` | `threadId?`, `levels=20` | Frames with file:line. |
| `variables` | `frameId` or `variablesReference`, `depth=1`, `maxItems=50` | Rendered tree with truncation markers. |
| `evaluate` | `expression`, `frameId`, `context=watch` | Value. |
| `threads` | none | Thread list. |
| `output` | `tail=200` | Last N lines of debuggee stdout/stderr. |
| `status` | none | State, adapter path and version, breakpoints, last stop. |
| `terminate` | none | `terminate` / `disconnect` (`terminateDebuggee=true` for launch, false for attach). |

Output limits apply to every tool: strings 2 KB, 50 collection items, depth 2. Every truncation says
so in the output. Keep each call well under `MCP_TOOL_TIMEOUT`. `wait_for_stop` is the only call
that waits, and its timeout is capped.

## Safety

- `evaluate` can run code with side effects (property getters, method calls). The skill tells the
  model to use side-effect-free expressions and to say when it runs a call.
- `launch` / `debug_test` run the user's code with the same trust as `dotnet run` / `dotnet test`.
  MCP tool permission prompts apply as usual, so don't add an auto-approve rule.
- When the server shuts down (`IHostApplicationLifetime.ApplicationStopping`), it terminates a
  launched debuggee and detaches from an attached one. No orphan processes.
- Logging uses the structured-logging rules. Debuggee output and evaluated values stay out of the
  server log.

## Plugin wiring

- `.mcp.json`: add `"debug": { "command": "dnp-debug", "args": [], "env": { "DNP_DEBUG_LOG_LEVEL": "Warning" } }`.
- `skills/debugging/SKILL.md`: when to debug and when a test or log line is cheaper; the loop
  (reproduce with a failing test, `debug_test`, break at the suspect line, inspect, state a
  hypothesis, fix under TDD); gotchas: Release builds hide locals, async stacks, moved
  breakpoints, exception filter ids.
- `commands/dotnet/debug.md`: `/dotnet-pilot:dotnet:debug <test filter | project>`, a thin
  orchestrator that loads the skill. It declares `effort:`.
- Add the `mcp__debug__*` tools by name (the whitelists are exact) to `dnp-tdd-developer-hard`.
  Add them to `dnp-performance-analyst` only if a use case shows up.
- Feature 4 health-checks `debug` alongside `roslyn`.

## Tests

- **Unit (pure)**: `DapClient` framing with split and merged frames, seq correlation, an event
  arriving between request and response, `BreakpointBook` merge and replace, `ValueRenderer`
  limits.
- **Integration (real netcoredbg, no fake adapter)**:
  - Launch `SampleApp`, break at a known line, check `wait_for_stop` reports `breakpoint`, check
    `variables` holds the known local and value, `evaluate` an arithmetic expression, `step over`
    changes the line, `terminate` leaves no process.
  - Exception breakpoint stops on the fixture's thrown exception.
  - `debug_test` on `SampleTests` stops inside the failing test.
- CI installs netcoredbg. Locally, integration tests skip with an explicit reason when the adapter
  is missing. A skip is never reported as a pass.

## Acceptance

- `dnp-debug doctor` reports the adapter path and version, or why it's missing.
- From a fresh session: `/dotnet-pilot:dotnet:debug "FullyQualifiedName~OrderTotal"` stops inside
  the failing test and shows the locals that explain the failure, with no manual steps.
- Killing the Claude Code process leaves no `netcoredbg` or debuggee process running.

## UNCONFIRMED

- Debug attach for **Microsoft.Testing.Platform** test projects (`VSTEST_HOST_DEBUG` is VSTest
  only). Check: run an MTP xUnit v3 project and see whether it pauses for attach and how. v1 may
  support VSTest only and say so.
- netcoredbg exception filter ids and their behaviour. The tool reads them at runtime, so the code
  doesn't depend on this. Only the skill text does.
- Whether a `wait_for_stop` near the limit triggers `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`
  backgrounding. Check: call it with a 60 s timeout and watch the transcript.
- netcoredbg on Windows ARM64.
