---
description: "Plan and generate an EF Core migration safely — validates chain, detects breaking changes, targets correct DbContext."
argument-hint: "<migration-name> [--context <DbContextName>]"
effort: medium
disable-model-invocation: true
---

# Add Migration

`/dotnet-pilot:dotnet:add-migration` creates an EF Core migration with safety checks.

> **Delegates to**: `dnp-ef-migration-planner` (sonnet, effort low).

## Execution

Every `dotnet ef` command below carries `--project <InfraProject> --startup-project <ApiProject>`,
plus `--context <Context>` whenever the solution has more than one `DbContext`.

1. Read `solution-map.json` for the EF contexts and the project pair.
2. If multiple contexts exist and `--context` was not given: stop and ask the user which one — never guess.
3. Check there is something to migrate:
   ```bash
   dotnet ef migrations has-pending-model-changes --project <InfraProject> --startup-project <ApiProject> --context <Context>
   ```
   No pending changes: say so and stop.
4. Generate the migration:
   ```bash
   dotnet ef migrations add <Name> --project <InfraProject> --startup-project <ApiProject> --context <Context>
   ```
5. Spawn `dnp-ef-migration-planner` with the generated `Migrations/<timestamp>_<Name>.cs` path, the
   context and the project pair. It validates the chain and inspects `Up()` for `DropColumn`,
   `DropTable`, `AlterColumn` type or nullability changes, and renames EF generated as drop + add.
6. If it reports breaking changes, present each risk and ask the developer to keep the migration
   or remove it. On remove:
   ```bash
   dotnet ef migrations remove --project <InfraProject> --startup-project <ApiProject> --context <Context>
   ```
   then stop, naming the model change to rework (a `RenameColumn`, a default value, a two-step
   column change).
7. Verify:
   ```bash
   dotnet build --no-restore
   dotnet ef migrations script <PreviousMigration> <Name> --idempotent --project <InfraProject> --startup-project <ApiProject> --context <Context>
   ```
   `<PreviousMigration>` is the one before `<Name>` in `dotnet ef migrations list` (`0` for the
   first). Read the SQL for anything the planner's summary did not mention.
8. Commit the migration files with: `feat(Infrastructure): add migration <Name>`
