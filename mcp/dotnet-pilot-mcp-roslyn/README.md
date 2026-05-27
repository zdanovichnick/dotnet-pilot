# DotnetPilot.Mcp.Roslyn

Roslyn-powered MCP server that gives AI coding assistants semantic understanding of your C# codebase.

## Table of Contents

- [What It Does](#what-it-does)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
  - [Standalone](#standalone)
  - [With DotnetPilot Plugin](#with-dotnetpilot-plugin)
  - [With Any MCP Client](#with-any-mcp-client)
- [Tools Reference](#tools-reference)
  - [Workspace Tools](#workspace-tools)
  - [File-Level Tools](#file-level-tools)
  - [Solution-Level Tools](#solution-level-tools)
  - [DI Analysis Tools](#di-analysis-tools)
  - [Architecture Tools](#architecture-tools)
  - [EF Core Tools](#ef-core-tools)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Publishing](#publishing)
- [Author](#author)
- [License](#license)

## What It Does

dnp-roslyn is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that loads your .NET solution via Roslyn's MSBuildWorkspace and exposes **11 tools** for semantic code analysis. Unlike text-based grep/regex approaches, it understands your code at the compiler level — types, symbols, references, inheritance, and DI registration patterns.

| Category | Tool | What it does |
|----------|------|-------------|
| Workspace | `get_solution_structure` | Lists all projects with references, frameworks, and document counts |
| Workspace | `reload_solution` | Invalidates cache and reloads from disk |
| File-level | `get_class_outline` | Member signatures (no bodies) — fast way to understand a class |
| File-level | `get_method_body` | Full source of one method — token-efficient alternative to reading whole files |
| Solution-level | `find_references` | Every usage of a symbol across the entire solution |
| Solution-level | `find_implementations` | All implementations of an interface or overrides of a virtual method |
| DI | `find_di_registrations` | Every `AddScoped`, `AddTransient`, `AddSingleton` call |
| DI | `find_di_consumers` | Every class with constructor injection |
| DI | `check_di_completeness` | Missing registrations + captive dependency detection |
| Architecture | `check_architecture_violations` | Clean architecture layer rule enforcement |
| EF Core | `get_ef_models` | DbContexts, entities, properties, navigations, configuration method |

## How It Works

1. On startup, dnp-roslyn registers the MSBuild SDK via `MSBuildLocator` and opens your solution with Roslyn's `MSBuildWorkspace`
2. The solution is compiled in-memory — this gives full semantic analysis (type resolution, symbol lookup, cross-project references)
3. The workspace is cached after first load — subsequent tool calls are fast
4. Communication uses MCP's stdio transport (newline-delimited JSON-RPC over stdin/stdout)
5. All logging goes to stderr so it never interferes with the MCP protocol

## Requirements

- **.NET 10 SDK** (or later) — both to run dnp-roslyn and to compile your target solution
- A **.NET solution file** (`.sln` or `.slnx`) — the entry point for workspace loading

The solution must build successfully with `dotnet build` — Roslyn loads the same MSBuild projects, so unresolved packages or broken project files will cause load failures.

## Installation

### As a .NET global tool (recommended)

```bash
dotnet tool install -g DotnetPilot.Mcp.Roslyn
```

Verify:

```bash
dnp-roslyn version
# dnp-roslyn 0.4.0
```

### Update to latest

```bash
dotnet tool update -g DotnetPilot.Mcp.Roslyn
dnp-roslyn version    # confirm new version
```

> **Restart Claude Code after updating.** The MCP client spawns `dnp-roslyn` as a subprocess at session start, so a running session keeps the old binary in memory until you reload.

**Other tool-management commands:**

```bash
dotnet tool list -g                                          # see installed version
dotnet tool update -g DotnetPilot.Mcp.Roslyn --version 0.4.0 # pin to a specific version
dotnet tool uninstall -g DotnetPilot.Mcp.Roslyn              # remove
```

### From source

```bash
git clone https://github.com/zdanovichnick/dotnet-pilot-mcp-roslyn.git
cd dotnet-pilot-mcp-roslyn
dotnet build
dotnet pack -o ./nupkg
dotnet tool install -g DotnetPilot.Mcp.Roslyn --add-source ./nupkg
```

## Usage

### Standalone

Run from your solution directory — dnp-roslyn auto-detects `.slnx` (preferred) or `.sln` files:

```bash
# Auto-detect solution in current directory
dnp-roslyn

# Specify solution path explicitly
dnp-roslyn --solution path/to/MyApp.slnx

# Verbose logging (sent to stderr, safe for MCP transport)
dnp-roslyn --verbose

# Check your setup
dnp-roslyn doctor
dnp-roslyn version
```

The `doctor` command validates:
- MSBuild SDK is found and registered
- .NET SDK version
- Solution file is found and loadable
- All projects load successfully (lists each with file count)

```bash
$ dnp-roslyn doctor
dnp-roslyn doctor
=================
MSBuild:     .NET SDK 10.0.100 (C:\Program Files\dotnet\sdk\10.0.100)
.NET SDK:    10.0.0
Solution:    /home/user/projects/MyApp/MyApp.slnx
Projects:    5
  - MyApp.Api (24 files)
  - MyApp.Application (18 files)
  - MyApp.Domain (12 files)
  - MyApp.Infrastructure (15 files)
  - MyApp.Tests (20 files)

All checks passed.
```

### With DotnetPilot Plugin

When you install the DotnetPilot Claude Code plugin, the Roslyn server starts automatically. The plugin's `.mcp.json` is preconfigured:

```json
{
  "mcpServers": {
    "roslyn": {
      "command": "dnp-roslyn",
      "args": [],
      "env": {
        "DNP_ROSLYN_LOG_LEVEL": "Warning"
      }
    }
  }
}
```

Claude Code launches `dnp-roslyn` when the plugin activates. The server auto-detects the solution in your current working directory. No manual startup needed.

### With Any MCP Client

dnp-roslyn speaks standard MCP over stdio — it works with any MCP-compatible client, not just Claude Code.

#### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "roslyn": {
      "command": "dnp-roslyn",
      "args": ["--solution", "path/to/MyApp.slnx"]
    }
  }
}
```

#### Claude Code (standalone, without plugin)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "roslyn": {
      "command": "dnp-roslyn",
      "args": [],
      "env": {
        "DNP_ROSLYN_LOG_LEVEL": "Warning"
      }
    }
  }
}
```

#### Other MCP clients

Any client that supports MCP stdio transport can use dnp-roslyn. Start the process with `dnp-roslyn --solution <path>` and communicate via stdin/stdout using newline-delimited JSON-RPC.

## Tools Reference

### Workspace Tools

#### `get_solution_structure`

Returns the full solution structure as JSON.

**Parameters:** none

**Returns:**
```json
{
  "solutionPath": "/home/user/projects/MyApp/MyApp.slnx",
  "projects": [
    {
      "name": "MyApp.Domain",
      "path": "src/MyApp.Domain/MyApp.Domain.csproj",
      "outputKind": "library",
      "targetFramework": "net10.0+",
      "documentCount": 12,
      "projectReferences": []
    },
    {
      "name": "MyApp.Application",
      "path": "src/MyApp.Application/MyApp.Application.csproj",
      "outputKind": "library",
      "targetFramework": "net10.0+",
      "documentCount": 18,
      "projectReferences": ["MyApp.Domain"]
    },
    {
      "name": "MyApp.Api",
      "path": "src/MyApp.Api/MyApp.Api.csproj",
      "outputKind": "exe",
      "targetFramework": "net10.0+",
      "documentCount": 24,
      "projectReferences": ["MyApp.Application", "MyApp.Infrastructure"]
    }
  ]
}
```

#### `reload_solution`

Invalidates the cached workspace and reloads from disk. Call this after adding/removing projects, changing project references, or making structural `.csproj` changes.

**Parameters:** none

**Returns:** `"Solution reloaded. 5 projects loaded."`

### File-Level Tools

#### `get_class_outline`

Returns member signatures (no method bodies) for classes in a file. Much more token-efficient than reading the entire file when you need to understand a class's API.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | string | yes | Relative path from solution root (e.g. `src/MyApp.Api/Services/UserService.cs`) |
| `className` | string | yes | Class name to filter. Pass empty string `""` for all classes in the file |

**Returns:**
```json
[
  {
    "name": "UserService",
    "kind": "ClassDeclaration",
    "baseType": "object",
    "interfaces": ["IUserService"],
    "line": 8,
    "members": [
      {
        "kind": "Method",
        "name": "GetByIdAsync",
        "signature": "Task<UserDto?> UserService.GetByIdAsync(Guid id)",
        "accessibility": "Public",
        "isStatic": false,
        "line": 18
      },
      {
        "kind": "Constructor",
        "name": ".ctor",
        "signature": "UserService.UserService(IUserRepository repo, ILogger<UserService> logger)",
        "accessibility": "Public",
        "isStatic": false,
        "line": 12
      }
    ]
  }
]
```

#### `get_method_body`

Returns the full source of a specific method, constructor, or property. More token-efficient than reading an entire file when you need one member.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | string | yes | Relative path from solution root |
| `methodName` | string | yes | Method, constructor, or property name |

**Returns:**
```
// src/MyApp.Application/Services/UserService.cs:18
public async Task<UserDto?> GetByIdAsync(Guid id)
{
    var user = await _repo.GetByIdAsync(id);
    if (user is null) return null;
    return new UserDto(user.Id, user.Name, user.Email);
}
```

### Solution-Level Tools

#### `find_references`

Finds every usage of a symbol across the entire solution. Works for classes, interfaces, methods, properties, enums, constructors, events, and delegates.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | string | yes | File where the symbol is defined |
| `symbolName` | string | yes | Name of the symbol |

**Returns:**
```json
{
  "symbol": "IUserService",
  "kind": "NamedType",
  "referenceCount": 4,
  "references": [
    {
      "file": "src/MyApp.Application/Services/UserService.cs",
      "line": 8,
      "column": 35,
      "code": "public sealed class UserService : IUserService"
    },
    {
      "file": "src/MyApp.Api/Controllers/UsersController.cs",
      "line": 12,
      "column": 22,
      "code": "private readonly IUserService _userService;"
    },
    {
      "file": "src/MyApp.Api/Extensions/ServiceCollectionExtensions.cs",
      "line": 15,
      "column": 30,
      "code": "services.AddScoped<IUserService, UserService>();"
    }
  ]
}
```

#### `find_implementations`

Finds all implementations of an interface, derived classes of a base class, or overrides of a virtual/abstract method.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | string | yes | File where the interface/base type is defined |
| `symbolName` | string | yes | Interface, abstract class, or virtual method name |

**Returns:**
```json
{
  "symbol": "IUserRepository",
  "kind": "NamedType",
  "implementationCount": 2,
  "implementations": [
    {
      "name": "UserRepository",
      "kind": "NamedType",
      "containingType": "",
      "file": "src/MyApp.Infrastructure/Repositories/UserRepository.cs",
      "line": 6
    },
    {
      "name": "InMemoryUserRepository",
      "kind": "NamedType",
      "containingType": "",
      "file": "tests/MyApp.Tests/Fakes/InMemoryUserRepository.cs",
      "line": 5
    }
  ]
}
```

### DI Analysis Tools

#### `find_di_registrations`

Finds all dependency injection service registrations across the solution — `AddScoped`, `AddTransient`, `AddSingleton`, `AddDbContext`, `AddHttpClient`, and related methods.

**Parameters:** none

**Returns:** Array of registrations, each with interface type, implementation type, lifetime, registration method, file, and line number.

#### `find_di_consumers`

Finds all classes with constructor injection — any constructor parameter that is an interface or abstract class.

**Parameters:** none

**Returns:** Array of consumers, each with the class name, file, line, and list of injected parameter types.

#### `check_di_completeness`

Cross-references registrations with consumers to find:
- **Missing registrations** — a type is injected but never registered
- **Captive dependencies** — a Scoped service injected into a Singleton (shorter-lived service captured by longer-lived one)

**Parameters:** none

**Returns:**
```json
{
  "registeredServices": 12,
  "consumers": 8,
  "missingRegistrations": [
    {
      "consumer": "OrderService",
      "missingType": "IPaymentGateway",
      "file": "src/MyApp.Application/Services/OrderService.cs",
      "line": 10
    }
  ],
  "captiveDependencies": [
    {
      "singleton": "CacheService",
      "captive": "ApplicationDbContext",
      "captiveLifetime": "Scoped"
    }
  ]
}
```

### Architecture Tools

#### `check_architecture_violations`

Analyzes project references against clean architecture rules and reports violations.

**Layer classification:**
- **Domain** — projects with `Domain`, `Core`, `Contracts`, `Shared`, `BuildingBlocks` in the name
- **Application** — projects with `Application`, `UseCases` in the name
- **Infrastructure** — projects with `Infrastructure`, `Persistence`, `Data`, `Gateway` in the name
- **Api** — projects with `Api`, `Web`, `Host`, `Server` in the name
- **Tests** — projects with `Test`, `Tests`, `Specs` in the name

**Rules enforced:**
| Layer | Allowed references |
|-------|-------------------|
| Domain | (none — no outward dependencies) |
| Application | Domain only |
| Infrastructure | Domain, Application |
| Api | Application, Infrastructure |
| Tests | (all) |

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `style` | string | yes | Architecture style. Currently `clean` is supported. Pass empty string for default. |

**Returns:**
```json
{
  "style": "clean",
  "layers": [
    { "project": "MyApp.Domain", "layer": "Domain" },
    { "project": "MyApp.Application", "layer": "Application" },
    { "project": "MyApp.Infrastructure", "layer": "Infrastructure" },
    { "project": "MyApp.Api", "layer": "Api" }
  ],
  "violations": [
    {
      "project": "MyApp.Domain",
      "layer": "Domain",
      "referencedProject": "MyApp.Infrastructure",
      "referencedLayer": "Infrastructure",
      "severity": "error",
      "message": "Domain should not reference Infrastructure"
    }
  ]
}
```

### EF Core Tools

#### `get_ef_models`

Discovers all EF Core `DbContext` subclasses and their entity models. Supports `DbContext`, `IdentityDbContext`, and `ApiAuthorizationDbContext` base types.

**Parameters:** none

**Returns:**
```json
{
  "contexts": [
    {
      "name": "ApplicationDbContext",
      "project": "MyApp.Infrastructure",
      "file": "src/MyApp.Infrastructure/Data/ApplicationDbContext.cs",
      "line": 8,
      "entities": [
        {
          "name": "User",
          "configuredVia": "fluent",
          "properties": [
            { "name": "Id", "type": "Guid", "isKey": true },
            { "name": "Name", "type": "string", "isKey": false },
            { "name": "Email", "type": "string", "isKey": false }
          ],
          "navigations": [
            { "name": "Orders", "targetType": "Order", "isCollection": true }
          ]
        }
      ]
    }
  ]
}
```

**Configuration detection:**
- `fluent` — entity configured via `OnModelCreating` (`Entity<T>()` calls) or `IEntityTypeConfiguration<T>` implementations
- `data-annotations` — entity has `[Key]`, `[Required]`, `[Table]`, etc. attributes
- `convention` — no explicit configuration found

## Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DNP_ROSLYN_LOG_LEVEL` | `Warning` | Minimum log level: `Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical` |

### CLI flags

| Flag | Description |
|------|-------------|
| `--solution <path>` | Explicit solution file path (skips auto-detection) |
| `--verbose` | Enable debug logging to stderr |

### Auto-detection behavior

When no `--solution` is specified, dnp-roslyn searches the current directory and walks up parent directories looking for:
1. `*.slnx` files (modern format, preferred)
2. `*.sln` files (legacy format, fallback)

The first match wins. If no solution is found, the server exits with an error.

### Workspace caching

The solution is loaded once on first tool call and cached in memory. Subsequent calls reuse the cached compilation. Call `reload_solution` to force a fresh load after structural changes (adding projects, changing references, etc.).

File-level and method-level tools do NOT require a reload for content changes — Roslyn reads the file from disk on each call.

## Examples

### Example 1: Understand a class before modifying it

Instead of reading the entire 300-line file:

```
Tool: get_class_outline
filePath: "src/MyApp.Application/Services/OrderService.cs"
className: ""
```

Get a compact overview of all members, then drill into the specific method:

```
Tool: get_method_body
filePath: "src/MyApp.Application/Services/OrderService.cs"
methodName: "CalculateTotal"
```

### Example 2: Safe refactoring — check all usages first

Before renaming or modifying `IUserRepository`:

```
Tool: find_references
filePath: "src/MyApp.Application/Interfaces/IUserRepository.cs"
symbolName: "IUserRepository"
```

See every file and line that references it across the solution.

### Example 3: Verify DI wiring after adding a service

After creating a new service:

```
Tool: check_di_completeness
```

Immediately shows if the new service is missing its DI registration.

### Example 4: Audit architecture before a PR

```
Tool: check_architecture_violations
style: "clean"
```

Catches violations like Domain referencing Infrastructure before code review.

### Example 5: Understand the data model

```
Tool: get_ef_models
```

See all DbContexts, entities, their properties, navigation relationships, and how each entity is configured.

## Troubleshooting

### "No MSBuild instance found"

The .NET SDK is not installed or not on PATH. Install it:

```bash
# Windows
winget install Microsoft.DotNet.SDK.10

# macOS
brew install dotnet-sdk

# Linux
sudo apt-get install dotnet-sdk-10.0
```

### "No .sln or .slnx file found" / "Failed to reconnect to roslyn"

dnp-roslyn auto-detects the solution by searching the current directory and walking up parent directories. If you see this error (or `Failed to reconnect to plugin:dotnet-pilot:roslyn` in Claude Code), it means **Claude Code is not open in a .NET solution directory**.

Fix: open Claude Code from the directory that contains your `.sln` or `.slnx` file, or specify the path explicitly:

```bash
dnp-roslyn --solution path/to/MyApp.slnx
```

This error is expected and harmless when using Claude Code outside a .NET project — the MCP server simply can't start without a solution to load.

### "Failed to load solution" / project load errors

Your solution must build cleanly with `dotnet build` first. Common issues:
- Missing NuGet packages — run `dotnet restore`
- Broken project references — check `.csproj` files
- SDK version mismatch — verify `global.json` matches your installed SDK

Run the doctor command for diagnostics:

```bash
dnp-roslyn doctor --solution path/to/Your.slnx
```

### Tools return empty results

- **`find_references` / `find_implementations` return nothing:** The symbol name must match exactly (case-sensitive). Use `get_class_outline` first to see exact member names.
- **`get_ef_models` returns no contexts:** Ensure your DbContext class inherits from `DbContext`, `IdentityDbContext`, or `ApiAuthorizationDbContext`. The context must be in a project that's part of the solution.
- **`check_di_completeness` misses registrations:** Only `Add*<T>` method-call patterns are detected. Custom extension methods that wrap DI registration may not be recognized.

### MCP transport issues

dnp-roslyn uses **newline-delimited JSON-RPC** over stdin/stdout (not HTTP Content-Length framing). All logs go to stderr. If you see JSON parse errors in your MCP client:
- Ensure you're not redirecting stderr to stdout
- Check that no other process is writing to the same stdout stream
- Use `--verbose` to see detailed logs on stderr for debugging

### Slow first response

The first tool call loads and compiles the entire solution — this can take 10-30 seconds for large solutions. Subsequent calls use the cached compilation and are fast (typically <1 second). dnp-roslyn eagerly starts loading the workspace on startup to minimize this delay.

## Development

### Build

```bash
cd dotnet-pilot-mcp-roslyn
dotnet build
```

The repository pins the SDK with `global.json`, so CI and local builds use the same .NET 10 feature band.

### Run unit tests

```bash
dotnet test
```

Tests cover file-level tools, architecture analysis (layer classification for Domain, Application, Infrastructure, Api, Tests, Persistence, Web, Shared, Contracts, BuildingBlocks, Gateway), and EF Core analysis.

### Run smoke test

The end-to-end smoke test exercises all 11 tools via MCP JSON-RPC over stdio:

```bash
node tests/smoke-test.js --solution path/to/Your.slnx
```

Requires `dnp-roslyn` to be installed as a global tool and a valid .NET solution.

### Project structure

```
src/DotnetPilot.Mcp.Roslyn/
  Program.cs                              # Entry point, MSBuildLocator, arg parsing, doctor command
  Workspace/
    WorkspaceCache.cs                     # MSBuildWorkspace loader with caching + reload
    WorkspaceOptions.cs                   # Solution path config
  Tools/
    Workspace/
      GetSolutionStructureTool.cs         # Solution-level project enumeration
      ReloadSolutionTool.cs               # Cache invalidation
    FileLevel/
      GetClassOutlineTool.cs              # Class member signatures + FindDocument helper
      GetMethodBodyTool.cs                # Method/constructor/property source extraction
    SolutionLevel/
      FindReferencesTool.cs               # Cross-solution SymbolFinder.FindReferences
      FindImplementationsTool.cs          # Interface/abstract implementation finder
    Dotnet/
      DiAnalyzer.cs                       # DI registration + consumer analysis engine
      DiTools.cs                          # MCP wrappers for DI tools
      ArchitectureAnalyzer.cs             # Layer classification + rule enforcement
      ArchitectureTools.cs                # MCP wrapper for architecture tool
      EfCoreAnalyzer.cs                   # DbContext/entity introspection engine
      EfCoreTools.cs                      # MCP wrapper for EF Core tool
  Models/
    SolutionModels.cs                     # SolutionStructure, ProjectInfo
    DiModels.cs                           # DiRegistration, DiConsumer, DiCompletenessReport
    ArchitectureModels.cs                 # ArchitectureReport, LayerInfo, ArchitectureViolation
    EfCoreModels.cs                       # EfCoreReport, DbContextInfo, EntityInfo, etc.
tests/
  DotnetPilot.Mcp.Roslyn.Tests/          # xUnit unit tests
  smoke-test.js                           # End-to-end MCP protocol test
```

### Tech stack

| Component | Version | Purpose |
|-----------|---------|---------|
| .NET | 10.0 | Runtime and target framework |
| ModelContextProtocol | 1.2.0 | MCP server SDK (stdio transport, tool discovery) |
| Microsoft.CodeAnalysis.CSharp.Workspaces | 5.3.0 | Roslyn C# workspace + semantic analysis |
| Microsoft.CodeAnalysis.Workspaces.MSBuild | 5.3.0 | MSBuild project/solution loader |
| Microsoft.Build.Locator | 1.11.2 | Runtime MSBuild SDK resolution |

## Publishing

### Local pack validation

Before pushing a release, validate the package locally:

```bash
dotnet restore tests/DotnetPilot.Mcp.Roslyn.Tests/DotnetPilot.Mcp.Roslyn.Tests.csproj
dotnet test tests/DotnetPilot.Mcp.Roslyn.Tests/DotnetPilot.Mcp.Roslyn.Tests.csproj -c Release
dotnet pack src/DotnetPilot.Mcp.Roslyn/DotnetPilot.Mcp.Roslyn.csproj -c Release --no-build
```

Packages are written to `artifacts/packages/`:

- `DotnetPilot.Mcp.Roslyn.<version>.nupkg`
- `DotnetPilot.Mcp.Roslyn.<version>.snupkg`

### GitHub Actions publish flow

The repository includes a release workflow at `.github/workflows/publish-nuget.yml`.

1. Add a repository secret named `NUGET_API_KEY`
2. Update the version in `src/DotnetPilot.Mcp.Roslyn/DotnetPilot.Mcp.Roslyn.csproj`
3. Create and push a tag such as `v0.4.1`

The workflow restores, builds, tests, packs, uploads the package artifacts, and pushes both the `.nupkg` and `.snupkg` files to `https://api.nuget.org/v3/index.json`.

## Author

**Nick Zdanovych** — [zdanovichnick@gmail.com](mailto:zdanovichnick@gmail.com)

## License

MIT
