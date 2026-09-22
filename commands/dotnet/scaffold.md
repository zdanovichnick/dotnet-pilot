---
description: "Scaffold a feature, API surface, service, or project matching the solution's existing architecture style."
argument-hint: "[feature|api|service|project] <Name> [--arch vsa|clean|ddd] [--minimal] [--lifetime scoped|transient|singleton] [--type classlib|web|xunit|worker|console]"
effort: medium
---

# Scaffold

`/dotnet-pilot:dotnet:scaffold [mode] <Name>` generates code that matches the current solution's
conventions. The mode defaults to `feature`.

> **Delegates to**: `dnp-tdd-developer-easy` (sonnet, effort low) for `feature`, `api`, and
> `service`, and `dnp-tdd-developer-hard` (opus, effort medium) when it hands the task back. `project` and architecture detection run in the caller's context.

## Architecture detection

1. Run `mcp__roslyn__get_solution_structure` to identify the project layout
2. Detect the architecture from the solution structure:
   - `Features/` folder with `IEndpointGroup` or vertical slice pattern → **VSA**
   - `*.Domain` + `*.Application` + `*.Infrastructure` projects → **Clean Architecture**
   - Aggregates + domain events + value objects → **DDD**
3. Override with `--arch vsa|clean|ddd` if auto-detection is wrong or ambiguous

## Modes

| Mode | Generates | Pattern source for the brief |
|------|-----------|------------------------------|
| `feature <Name>` (default) | **VSA**: `Features/<Name>/` with `<Name>Endpoint.cs` (minimal API group), `<Name>Request.cs`, `<Name>Response.cs`, `<Name>Validator.cs` (FluentValidation), tests under `Features/<Name>/` in the test project. **Clean**: `Application/<Name>/<Name>Command.cs` (or Query) with handler, `<Name>Dto.cs`, `Api/Controllers/<Name>Controller.cs`, handler tests | `vertical-slice` or `clean-architecture` skill |
| `api <Entity>` | Controller — or endpoint group with `--minimal` — over an existing entity/service: `Create<Entity>Request`, `Update<Entity>Request`, `<Entity>Response`, validators, `ProducesResponseType` attributes, mapping, DI registration | `aspnet-api-patterns` skill |
| `service <Name>` | `I<Name>Service` + `<Name>Service` in the Application layer, DI registration with `--lifetime` (default `scoped`), a test class | the solution's existing `*Service` pairs |
| `project <Name> --type <t>` | `dotnet new <t> -n <Name> -o src/<Name>` (test types under `tests/`), `dotnet sln add`, a `Directory.Packages.props` entry when the solution uses Central Package Management, a new `solution-map.json` entry | `dotnet-project-init` skill |

## Execution

1. Detect the architecture (above). Resolve project paths from `mcp__roslyn__get_solution_structure`
   or `.planning/solution-map.json`.
2. `project` mode: run the CLI steps from the table, then continue at step 4. Every other mode:
   spawn `dnp-tdd-developer-easy` with the mode, name, architecture, target paths and the file
   list from the table — tests first, production code second. The agent detects the conventions
   the new code must match through its `convention-learner` skill; pass along any the user stated.
3. On `[ROUTING: dotnet-pilot:dnp-tdd-developer-hard]`, spawn `dnp-tdd-developer-hard` with the
   same brief plus the reasons given. On `[PARTIAL: …]`, report what was created and what is left.
4. `dotnet build --no-restore`; then `mcp__roslyn__check_di_completeness` for every new injectable type.
5. Report: files created, build status, DI status.

## Related

- `/dotnet-pilot:dotnet:add-endpoint` — add a single endpoint to an existing feature
- `/dotnet-pilot:dotnet:create-entity` — entity + EF configuration + repository + migration
- `/dotnet-pilot:quality:check-architecture` — verify architecture compliance after scaffolding
- `/dotnet-pilot:dotnet:health-check` — full solution health including DI completeness
