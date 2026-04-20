---
description: "Create a full entity stack: entity class, EF configuration, repository, service, and migration."
argument-hint: "<entity-name> [--properties 'Name:string, Age:int, Email:string']"
---

# Scaffold Entity

`/DotnetPilot:dotnet:scaffold-entity` creates the complete vertical slice for a domain entity.

> **Delegates to**: `dnp-ef-migration-planner` (Haiku 4.5) for the migration step; uses `mcp__roslyn__get_solution_structure` to resolve project paths. Other steps run in the caller's context.

## Execution

1. Read `solution-map.json` for project structure and existing patterns
2. Create (in order):
   - **Domain layer:** `<Entity>.cs` entity class with properties
   - **Infrastructure layer:** `<Entity>Configuration.cs` implementing `IEntityTypeConfiguration<Entity>`
   - **Infrastructure layer:** Add `DbSet<Entity>` to DbContext
   - **Application layer:** `I<Entity>Repository.cs` interface (if repository pattern used)
   - **Infrastructure layer:** `<Entity>Repository.cs` implementation
   - **Application layer:** `I<Entity>Service.cs` and `<Entity>Service.cs`
   - **DI registration:** Register repository and service
   - **Migration:** Run `dotnet ef migrations add Add<Entity>Table`
3. Verify each step builds
4. Suggest: `/DotnetPilot:dotnet:scaffold-api <entity>` to add API endpoints
