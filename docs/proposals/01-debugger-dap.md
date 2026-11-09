# 1. .NET test debugging on an existing DAP MCP server

> **Rescoped 2026-11-09.** The earlier spec built a `dnp-debug` MCP server (a DAP client over
> netcoredbg). Two maintained MIT servers already do that, so DotnetPilot no longer builds one. It
> ships the .NET-specific part: a skill and a command that debug a failing `dotnet test` run through
> whichever server the user installed.

## Goal

Claude can take a failing test, stop inside it, and read the stack, locals and expression values
instead of guessing from assertion output. Claude Code has no debugger or DAP support (the tools
reference lists LSP only).

## Prior art (checked 2026-11-09)

| Server | .NET support | Notes |
|--------|--------------|-------|
| [debugmcp/mcp-debugger](https://github.com/debugmcp/mcp-debugger) | netcoredbg | Multi-language, MIT. `wait_for_stop`; every stop returns a snapshot of the exception, top frames and locals. One-call failing-test debugging exists for **pytest only**. Recommended default. |
| [thebtf/netcoredbg-mcp](https://github.com/thebtf/netcoredbg-mcp) | netcoredbg | .NET only, MIT, PyPI. `attach_debug`, `configure_exceptions`, `get_exception_context`, snapshots, WPF/WinForms UI automation. |

Neither documents debugging `dotnet test`. That gap is what DotnetPilot fills.

Do not use `vsdbg` in either setup. Its licence limits it to Microsoft's own IDEs.

## Shape

- `skills/debugging/SKILL.md`: when to debug and when a test or a log line is cheaper; the loop
  (reproduce with a failing test, attach, break at the suspect line, inspect, state a hypothesis,
  fix under TDD); gotchas: Release builds hide locals, async stacks, breakpoints moved off lines
  with no IL, exception filter ids read from the adapter rather than hardcoded, and `evaluate`
  running property getters and methods with side effects.
- `commands/dotnet/debug.md`: `/dotnet-pilot:dotnet:debug <test filter>`, a thin orchestrator that
  loads the skill and runs the flow below. It declares `effort:`.
- No `.mcp.json` entry. The user installs one of the servers above. The command finds its tools by
  name (`mcp__*debug*__*`) and, when none is present, prints the install line for both and stops.
  DotnetPilot does not declare a third-party server in its own manifest.

## Test-debug flow

1. `dotnet build -c Debug` for the test project (locals are missing in Release).
2. Start `dotnet test <project> --no-build --filter "<filter>"` in the background with
   `VSTEST_HOST_DEBUG=1`. The testhost prints its PID and waits for a debugger.
3. Read the PID from the output, set breakpoints (the failing test's body, or exception
   breakpoints), then attach by PID with the installed server's attach tool.
4. Continue, wait for the stop, and report the locals that explain the failure.
5. Detach and let the test run finish, so no testhost is left waiting.

## Tests

- Fixture: `samples/SmokeSolution` gains one xUnit (VSTest) test that fails with a known local.
- Manual acceptance per server (no fake adapter): the flow stops inside the failing test and the
  report names the known local and its value.

## Acceptance

- `/dotnet-pilot:dotnet:debug "FullyQualifiedName~OrderTotal"` stops inside the failing test and
  shows the locals that explain the failure, with no manual steps beyond installing a server.
- With no debug server installed, the command says which to install and does nothing else.
- After the command finishes, no `testhost` or `netcoredbg` process is left running.

## UNCONFIRMED

- **`VSTEST_HOST_DEBUG=1` + attach by PID through either server.** Untested. mcp-debugger's README
  lists attach-by-PID for C/C++ and "full DAP support" for .NET without naming attach. Check: run
  the flow against `samples/SmokeSolution` with each server before writing the command.
- Debug attach for **Microsoft.Testing.Platform** projects (`VSTEST_HOST_DEBUG` is VSTest only).
  Check: run an MTP xUnit v3 project and see whether it pauses for attach. v1 may support VSTest
  only and say so.
- Health checks: `mcp-health.ts` can only `$.mcp.connect` servers in DotnetPilot's own manifest, so
  a user-installed debug server gets no `debug ✓/✗` status entry.
