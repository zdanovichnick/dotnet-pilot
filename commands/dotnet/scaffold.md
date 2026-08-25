---
description: "Scaffold a complete feature (endpoint, handler, validator, DTO, tests) matching the project's existing architecture style."
argument-hint: "[FeatureName] [--arch vsa|clean|ddd]"
effort: high
---

# Scaffold Feature

`/DotnetPilot:dotnet:scaffold [FeatureName]` generates a complete feature scaffold matching the current project's architecture.

> **Delegates to**: `dnp-api-scaffolder` (sonnet, effort low); architecture detection runs in the caller's context.

## Architecture Detection

1. Run `mcp__roslyn__get_solution_structure` to identify project layout
2. Detect architecture from the solution structure:
   - `Features/` folder with `IEndpointGroup` or vertical slice pattern → **VSA**
   - `*.Domain` + `*.Application` + `*.Infrastructure` projects → **Clean Architecture**
   - Aggregates + domain events + value objects → **DDD**
3. Override with `--arch vsa|clean|ddd` if auto-detection is wrong or ambiguous

## Execution (VSA — default)

Delegate to `dnp-api-scaffolder` with:
- Architecture: VSA
- Feature name: `[FeatureName]`
- Target folder: `Features/[FeatureName]/`
- Files to generate:
  - `[FeatureName]Endpoint.cs` — minimal API endpoint group
  - `[FeatureName]Request.cs` — input record DTO
  - `[FeatureName]Response.cs` — output record DTO
  - `[FeatureName]Validator.cs` — FluentValidation validator
- Test file: `[FeatureName]Tests.cs` in the test project under `Features/[FeatureName]/`

## Execution (Clean Architecture)

Delegate to `dnp-api-scaffolder` with:
- Architecture: Clean
- Feature name: `[FeatureName]`
- Files to generate:
  - `Application/[FeatureName]/[FeatureName]Command.cs` (or Query) — MediatR request + handler
  - `Application/[FeatureName]/[FeatureName]Dto.cs` — response DTO record
  - `Api/Controllers/[FeatureName]Controller.cs` — controller action delegating to MediatR
- Test file in the test project covering the command handler

## Post-Scaffold

1. Run `dotnet build --no-restore` to verify the scaffold compiles cleanly
2. Verify DI registration via `mcp__roslyn__check_di_completeness` — the scaffolder registers services but confirm nothing was missed
3. Report: files created, build status, DI status

## Related

- `/DotnetPilot:dotnet:add-endpoint` — add a single endpoint to an existing feature
- `/DotnetPilot:quality:check-architecture` — verify architecture compliance after scaffold
- `/DotnetPilot:dotnet:health-check` — full solution health including DI completeness
