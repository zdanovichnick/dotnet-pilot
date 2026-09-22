---
description: "Create a full entity stack: entity class, EF configuration, repository, service, and migration."
argument-hint: "<entity-name> [--properties 'Name:string, Age:int, Email:string']"
effort: medium
---

# Create Entity

`/dotnet-pilot:dotnet:create-entity` creates the complete vertical slice for a domain entity.

> **Delegates to**: `dnp-tdd-developer-easy` (sonnet, effort low) for the entity stack, and
> `dnp-tdd-developer-hard` (opus, effort medium) when it hands the task back. The migration is a
> separate step through `/dotnet-pilot:dotnet:add-migration`.

## Execution

1. Resolve the project layout from `.planning/solution-map.json` or
   `mcp__roslyn__get_solution_structure`: the Domain, Application and Infrastructure projects, the
   test project, and the `DbContext` the entity belongs to (ask the user when there is more than
   one and the request does not say).
2. Spawn `dnp-tdd-developer-easy` with the entity name, the parsed `--properties`, the resolved
   project paths and the target `DbContext`. The files it creates, tests first, matching the
   solution's conventions through its `convention-learner` skill:
   - **Domain:** `<Entity>.cs`
   - **Infrastructure:** `<Entity>Configuration.cs` implementing `IEntityTypeConfiguration<Entity>`,
     and the `DbSet<Entity>` on the `DbContext`
   - **Application:** `I<Entity>Repository.cs` (when the solution uses repositories),
     `I<Entity>Service.cs` and `<Entity>Service.cs`
   - **Infrastructure:** `<Entity>Repository.cs`
   - **DI registration** for the repository and service

   Tell it not to add a migration; that is the next step.
3. On `[ROUTING: dotnet-pilot:dnp-tdd-developer-hard]`, spawn `dnp-tdd-developer-hard` with the
   same brief plus the reasons given. On `[PARTIAL: …]`, report what was created and what is left,
   and stop before the migration.
4. Report the files created and the build, test and DI results, then name the next steps:
   `/dotnet-pilot:dotnet:add-migration Add<Entity>Table --context <DbContext>` for the migration
   (it checks the generated `Up()` for data-loss operations before anything is applied), and
   `/dotnet-pilot:dotnet:scaffold api <Entity>` for API endpoints.
