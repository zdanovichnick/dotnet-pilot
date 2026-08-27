---
description: "Create API controller or minimal API endpoint with DTOs, validation, DI registration, and OpenAPI attributes."
argument-hint: "<entity-name> [--minimal for minimal API style]"
effort: medium
---

# Create API

`/dotnet-pilot:dotnet:create-api` generates a complete API endpoint for an entity.

> **Delegates to**: `dnp-api-scaffolder` (sonnet, effort low).

## Execution

1. Read `solution-map.json` to identify the API project and detect style (controllers vs minimal API)
2. Check for existing service interface (`I<Entity>Service`) — use it if present
3. Spawn `dnp-api-scaffolder` to generate:
   - DTOs: `Create<Entity>Request`, `Update<Entity>Request`, `<Entity>Response`
   - Validation: FluentValidation validators (if present) or DataAnnotations
   - Controller or endpoint group
   - Mapping profile (if AutoMapper/Mapster present)
   - DI registration (if new service created)
4. Verify: `dotnet build --no-restore`
5. Report files created and suggest test creation
