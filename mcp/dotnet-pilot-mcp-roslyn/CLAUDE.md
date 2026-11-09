# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`dotnet-pilot-mcp-roslyn` is a Roslyn-powered MCP server that provides semantic C# code intelligence. It runs as a .NET global tool over stdio and is consumed by the [dotnet-pilot](https://github.com/zdanovichnick/dotnet-pilot) Claude Code plugin.

## Build & Test

```bash
dotnet build DotnetPilot.Mcp.Roslyn.slnx
dotnet test DotnetPilot.Mcp.Roslyn.slnx
dotnet run --project src/DotnetPilot.Mcp.Roslyn -- version
dotnet run --project src/DotnetPilot.Mcp.Roslyn -- doctor --solution <path>
```

Integration tests require a .NET solution to load. Set the `DNP_TEST_SOLUTION` environment variable to point at a `.sln` or `.slnx` file. Tests gracefully skip if unset or if the file is absent.

## Architecture

- **Program.cs** — MSBuildLocator init (before any Roslyn type loads), CLI arg parsing, MCP host bootstrap via `ModelContextProtocol` stdio transport. Handles `version` and `doctor` subcommands.
- **Workspace/SolutionLocator.cs** — the one place that finds a solution: `FindUpward(dir)` (`.slnx` before `.sln`) and `Resolve(path)` (file or directory), used by `Program.cs`, `doctor` and `reload_solution`.
- **Workspace/WorkspaceCache.cs** — Loads `MSBuildWorkspace` + `Solution` and reconciles it with disk on every `GetSolutionAsync` via `DiskSnapshot` (stat-only, no `FileSystemWatcher`): `.cs` edits/adds/deletes are applied incrementally, while changes to project, solution or `Directory.*` build inputs trigger a full reload. Thread-safe via semaphore. `ReloadAsync(solutionPath)` forces a reload and, given a path, binds that solution (the server may start unbound: with no solution found it stays up and `GetSolutionAsync` throws an `McpException` naming `reload_solution`). Never call `workspace.TryApplyChanges` — MSBuildWorkspace would write the in-memory edits back to disk.
- **Tools/** — MCP tools organized by category. Each tool class uses `[McpServerToolType]` + `[McpServerTool(Name = "...")]` attributes.
  - `Workspace/` — `get_solution_structure`, `reload_solution`
  - `FileLevel/` — `get_class_outline`, `get_method_body`
  - `SolutionLevel/` — `find_references`, `find_implementations`, `find_symbol`, `find_callers`, `find_dead_code`, `detect_antipatterns`, `detect_circular_dependencies`
  - `Dotnet/DiAnalyzer.cs` + `DiTools.cs` — DI registration/consumer analysis and completeness check
  - `Dotnet/ArchitectureAnalyzer.cs` + `ArchitectureTools.cs` — Clean architecture layer classification and violation detection
  - `Dotnet/EfCoreAnalyzer.cs` + `EfCoreTools.cs` — DbContext/entity introspection
- **Models/** — JSON-serializable result types for tool output

## MCP Tool Naming

Tools are exposed as `mcp__roslyn__<name>` when registered in a consuming project's `.mcp.json`. Names use snake_case.

## Key Conventions

- MSBuildLocator.RegisterInstance MUST be called before any `Microsoft.CodeAnalysis` types are referenced. This is done at the top of Program.cs.
- WorkspaceCache is registered as singleton — one workspace per MCP server process.
- DiAnalyzer uses semantic model (`GetSemanticModel`, `GetDeclaredSymbol`) not syntax-only analysis. This is the whole point vs regex.
- Framework types (ILogger, IConfiguration, IOptions, etc.) are excluded from "missing registration" reports.
- Scrutor `Scan(...)` selectors are evaluated by `ScrutorScanResolver` (no Scrutor reference; matched by name, by selector type, and by the `Scrutor` assembly). Resolved selections add `"Scan"` registrations. Anything else makes the scan `partial`/`unresolved` and flags the `missing` entries it could cover. Test stubs mirror the Scrutor 6.1.0 API, where `Scan` is declared in `Microsoft.Extensions.DependencyInjection`.
- Captive dependency detection: Singleton consuming Scoped/Transient is flagged.
- Optional parameters: most tools take a non-nullable `string` and convert empty to null (the pattern from when the SDK treated every parameter as required); `reload_solution` declares `string? solutionPath = null`. Follow the neighbouring tool.

## Dependencies

| Package | Purpose |
|---------|---------|
| `ModelContextProtocol` 1.3.0 | MCP server SDK (stdio transport) |
| `Microsoft.CodeAnalysis.CSharp.Workspaces` 5.3.0 | Roslyn C# semantic analysis |
| `Microsoft.CodeAnalysis.Workspaces.MSBuild` 5.3.0 | MSBuildWorkspace for loading .sln/.slnx |
| `Microsoft.Build.Locator` 1.11.2 | Finds local MSBuild installation |
| `Microsoft.Extensions.Hosting` 10.0.8 | Generic host for DI + lifetime |
