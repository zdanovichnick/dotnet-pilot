---
description: "Quick one-off task — bypass the full pipeline for small changes."
argument-hint: "<task description>"
---

# Quick Task

`/DotnetPilot:utility:quick` executes a single task without the full planning pipeline. Good for small fixes, refactors, and configuration changes.

## Execution

1. Take the task description from arguments
2. Run `dotnet build` pre-flight
3. Execute the task directly (no plan file, no separate agent)
4. Run `dotnet build` post-flight
5. Run `dotnet test` if the change touches implementation code
6. Commit with conventional format
7. Update STATE.md with a note about the quick task

## When to Use Quick vs Pipeline

**Use Quick for:**
- Bug fixes in a single file
- Configuration changes
- Adding a missing DI registration
- Renaming or refactoring within one project
- Documentation updates

**Use Pipeline for:**
- New features spanning multiple files/projects
- Database schema changes
- Architecture changes
- Anything requiring research or planning
