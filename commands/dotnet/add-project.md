---
description: "Add a new project to the solution with correct references and layer placement."
argument-hint: "<project-name> <type: classlib|web|xunit|worker|console>"
---

# Add Project

`/DotnetPilot:dotnet:add-project` creates a project and wires it into the solution correctly.

## Execution

1. Spawn `dnp-architect` to validate:
   - Layer placement (which projects should reference this new project?)
   - Naming convention consistency
   - Target framework match
2. Create project:
   ```bash
   dotnet new <type> -n <project-name> -o src/<project-name>
   dotnet sln add src/<project-name>
   ```
3. Add project references based on layer rules
4. If Central Package Management is enabled: add to `Directory.Packages.props`
5. Verify: `dotnet build`
6. Update `solution-map.json`
