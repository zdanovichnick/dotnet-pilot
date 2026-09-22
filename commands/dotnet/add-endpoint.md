---
description: "Add an endpoint to an existing controller or endpoint group."
argument-hint: "<controller-name> <http-method> <route> [--with-dto]"
effort: medium
---

# Add Endpoint

`/dotnet-pilot:dotnet:add-endpoint` adds a single endpoint to an existing API surface.

> **Delegates to**: `dnp-tdd-developer-easy` (sonnet, effort low); `dnp-tdd-developer-hard` (opus,
> effort medium) when the easy agent hands the task back.

## Execution

1. Find the target controller/endpoint group file
2. Spawn `dnp-tdd-developer-easy` with the target file, the HTTP method and route, and
   `--with-dto` if given. It matches the file's return types, error handling and attribute style
   (its `convention-learner` skill) and generates, tests first:
   - The endpoint method with proper HTTP attributes
   - Request/response DTOs if `--with-dto` (or auto-detect if needed)
   - ProducesResponseType attributes
   - A new service interface method and its implementation, when the endpoint needs one
3. On `[ROUTING: dotnet-pilot:dnp-tdd-developer-hard]`, spawn `dnp-tdd-developer-hard` with the
   same brief plus the reasons given. On `[PARTIAL: …]`, report what was done and what is left.
4. Verify: `dotnet build --no-restore`
