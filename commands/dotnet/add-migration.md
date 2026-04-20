---
description: "Plan and generate an EF Core migration safely — validates chain, detects breaking changes, targets correct DbContext."
argument-hint: "<migration-name> [--context <DbContextName>]"
---

# Add Migration

`/DotnetPilot:dotnet:add-migration` creates an EF Core migration with safety checks.

> **Delegates to**: `dnp-ef-migration-planner` (claude-haiku-4-5-20251001).

## Execution

1. Read `solution-map.json` for EF context details
2. If multiple contexts exist and `--context` not specified: ask which context via AskUserQuestion
3. Spawn `dnp-ef-migration-planner` to:
   - Check for pending model changes
   - Detect breaking changes (column drops, type changes)
   - Validate migration chain integrity
4. If breaking changes found and `config.gates.migration_confirm` is true:
   - Present risks to developer
   - Get explicit confirmation before proceeding
5. Run the migration command:
   ```bash
   dotnet ef migrations add <Name> --project <InfraProject> --startup-project <ApiProject> --context <Context>
   ```
6. Verify the generated migration:
   ```bash
   dotnet build --no-restore
   dotnet ef database update --dry-run --project <InfraProject> --startup-project <ApiProject>
   ```
7. Commit the migration files with: `feat(Infrastructure): add migration <Name>`
