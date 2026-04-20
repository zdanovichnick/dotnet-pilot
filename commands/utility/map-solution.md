---
description: "Map the .NET solution structure — projects, references, packages, namespaces, layers."
---

# Map Solution

`/DotnetPilot:utility:map-solution` scans the solution and updates `solution-map.json`.

## Execution

1. Run `dotnet sln list` to enumerate projects
2. For each project, parse `.csproj` to extract:
   - Target framework
   - Project type (OutputType, Sdk)
   - Project references
   - NuGet packages with versions
3. Detect layer assignment based on:
   - Project name suffixes (`.Domain`, `.Application`, `.Infrastructure`, `.Api`)
   - Reference graph (if no clear naming convention)
4. Find EF Core DbContext classes
5. Write/update `.planning/solution-map.json`
6. Display summary:

```
Solution: MyApp.slnx

Projects (5):
  src/MyApp.Domain          classlib  net10.0  [domain]
  src/MyApp.Application     classlib  net10.0  [application]
  src/MyApp.Infrastructure  classlib  net10.0  [infrastructure]
  src/MyApp.Api             web       net10.0  [api]
  tests/MyApp.Tests         xunit     net10.0  [tests]

EF Contexts:
  ApplicationDbContext (Infrastructure, Npgsql)

Packages: 23 total, 0 vulnerable, 2 outdated
```
