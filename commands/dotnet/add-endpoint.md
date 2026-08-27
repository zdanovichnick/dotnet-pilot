---
description: "Add an endpoint to an existing controller or endpoint group."
argument-hint: "<controller-name> <http-method> <route> [--with-dto]"
effort: medium
---

# Add Endpoint

`/dotnet-pilot:dotnet:add-endpoint` adds a single endpoint to an existing API surface.

> **Delegates to**: `dnp-api-scaffolder` (sonnet, effort low).

## Execution

1. Find the target controller/endpoint group file
2. Detect existing patterns (return types, error handling, attribute style)
3. Spawn `dnp-api-scaffolder` to generate:
   - The endpoint method with proper HTTP attributes
   - Request/response DTOs if `--with-dto` (or auto-detect if needed)
   - ProducesResponseType attributes
4. If the endpoint needs a new service method:
   - Add the method to the service interface
   - Implement in the service class
5. Verify: `dotnet build --no-restore`
