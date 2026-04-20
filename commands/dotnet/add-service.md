---
description: "Create a service with interface, implementation, DI registration, and test scaffold."
argument-hint: "<service-name> [--lifetime scoped|transient|singleton]"
---

# Add Service

`/DotnetPilot:dotnet:add-service` creates a complete service with proper DI wiring.

## Execution

1. Read `solution-map.json` to determine which project to create the service in (Application layer)
2. Create:
   - `I<Name>Service.cs` in Application project (interface)
   - `<Name>Service.cs` in Application project (implementation)
   - DI registration in `ServiceCollectionExtensions.cs` or equivalent
   - `<Name>ServiceTests.cs` in test project (test scaffold with mocked dependencies)
3. Detect existing patterns:
   - Constructor injection style
   - Method naming convention
   - Error handling approach (exceptions vs Result pattern)
4. Verify: `dotnet build --no-restore`
5. Run tests: `dotnet test --no-build`
