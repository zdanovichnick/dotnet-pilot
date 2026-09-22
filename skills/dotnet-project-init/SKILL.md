---
name: dotnet-project-init
description: Discovers .NET solution context — projects, frameworks, test runners, EF contexts, architecture style, and package management.
when_to_use: First contact with a solution — building solution-map.json, adding a project, or answering which projects, frameworks, and test runners exist.
---

# .NET Project Initialization Skill

This skill discovers everything about a .NET solution needed for DotnetPilot to operate effectively.

## Discovery Protocol

### 1. Solution File
- Search for `*.slnx` (modern) or `*.sln` (legacy) in current directory
- If multiple solutions: stop and return `[HALT: which solution — <list>?]` so the invoking command asks the user; don't pick one
- Parse project references from solution file

### 2. Per-Project Analysis

For each project in the solution:

```bash
dotnet list <project.csproj> reference    # project references
dotnet list <project.csproj> package      # NuGet packages
```

Parse `.csproj` for:
- `<TargetFramework>` → net8.0, net9.0, net10.0, etc. Multi-targeted projects use
  `<TargetFrameworks>` (plural, `;`-separated) — record every entry, and pass `-f <tfm>` to
  `dotnet ef` / `dotnet test` when a command must target one
- Properties can be inherited: check `Directory.Build.props` up the directory tree for
  `TargetFramework`, `Nullable`, `LangVersion`, and so on
- `<OutputType>` → Exe, Library
- `<Sdk>` → Microsoft.NET.Sdk.Web (web), Microsoft.NET.Sdk (classlib)
- `<IsPackable>` → library intended for NuGet distribution
- `<RootNamespace>` → namespace convention

**Central Package Management:** when `Directory.Packages.props` exists with
`<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>`, `<PackageReference>` items
carry no `Version`. Versions live in `<PackageVersion>` items in that file, and new packages must be
added there, not in the `.csproj`. `dotnet list package` still reports the resolved versions.

### 3. Framework Detection

| Indicator | Detection |
|-----------|----------|
| **Test runner** | xUnit v2 → `xunit`; xUnit v3 → `xunit.v3`; NUnit → `NUnit`; MSTest → `MSTest.TestAdapter` or `<Project Sdk="MSTest.Sdk/…">` (no package reference at all); TUnit → `TUnit` |
| **Mocking** | `Moq`, `NSubstitute`, `FakeItEasy` in test project packages |
| **Assertions** | `FluentAssertions`, `Shouldly` in test project packages |
| **ORM** | `Microsoft.EntityFrameworkCore` → EF Core; `Dapper` → Dapper |
| **Validation** | `FluentValidation` or DataAnnotations (check for `[Required]` attributes) |
| **CQRS** | `MediatR` package presence |
| **Mapping** | `AutoMapper` or `Mapster` package presence |
| **API style** | `[ApiController]` attribute → controllers; `MapGet/MapPost` → minimal API |

### 4. Architecture Style Detection

Analyze project reference graph:

**Clean Architecture:**
- Domain has 0 project references
- Application references only Domain
- Infrastructure references Domain + Application
- Api references Application + Infrastructure

**Vertical Slices:**
- Feature folders within a single project
- No strict layer separation

**Flat:**
- Single project or 2 projects (app + tests)

### 5. EF Core Context Discovery

Search for classes inheriting `DbContext`:
```csharp
class *DbContext : DbContext
class *Context : DbContext
```

For each context, identify:
- Project location
- Database provider (from `Use*` call or package: `Npgsql`, `SqlServer`, `Sqlite`)
- Migrations assembly location
