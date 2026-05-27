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
- **Workspace/WorkspaceCache.cs** — Lazy-loads `MSBuildWorkspace` + `Solution`, caches for server lifetime. Thread-safe via semaphore. Supports `ReloadAsync` for invalidation.
- **Tools/** — MCP tools organized by category. Each tool class uses `[McpServerToolType]` + `[McpServerTool(Name = "...")]` attributes.
  - `Workspace/` — `get_solution_structure`, `reload_solution`
  - `FileLevel/` — `get_class_outline`, `get_method_body`
  - `SolutionLevel/` — `find_references`, `find_implementations`
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
- Captive dependency detection: Singleton consuming Scoped/Transient is flagged.
- MCP SDK 1.2.0 treats all method parameters as required — use non-nullable `string` with empty-string-to-null conversion for optional parameters.

## Dependencies

| Package | Purpose |
|---------|---------|
| `ModelContextProtocol` 1.2.0 | MCP server SDK (stdio transport) |
| `Microsoft.CodeAnalysis.CSharp.Workspaces` 5.3.0 | Roslyn C# semantic analysis |
| `Microsoft.CodeAnalysis.Workspaces.MSBuild` 5.3.0 | MSBuildWorkspace for loading .sln/.slnx |
| `Microsoft.Build.Locator` 1.11.2 | Finds local MSBuild installation |
| `Microsoft.Extensions.Hosting` 10.0.0 | Generic host for DI + lifetime |
