---
description: "Auto-detect and suggest the next project step based on current state."
effort: low
---

# Next Step

`/dotnet-pilot:project:next` reads `.planning/STATE.md` (if present) and suggests the
appropriate next action.

The legacy spec-driven pipeline (`discuss`/`research`/`plan`/`execute`/`verify`) has been
retired. For multi-step implementation work, use Claude Code's native **Plan Mode**
(`EnterPlanMode` / the `/plan` flow) and `TaskCreate` instead.

## Decision Logic

1. **No `.planning/` directory** → Run `/dotnet-pilot:project:init` to set up the project model.
2. **`.planning/` exists, no ROADMAP.md / PROJECT.md populated** → Open those files and fill them in, then re-run this command.
3. **PROJECT.md / ROADMAP.md populated, uncommitted work in progress** → Use Plan Mode for the next feature, then `/dotnet-pilot:quality:commit-check`, then `/dotnet-pilot:project:ship`.
4. **All phases complete, tests pass, no uncommitted work** → Run `/dotnet-pilot:project:ship`.

## Execution

1. Read `.planning/STATE.md` frontmatter if it exists.
2. Check git for uncommitted changes: `git status --porcelain`.
3. Check build health: `dotnet build --no-restore`.
4. Report: "Next suggested step: `<command>`" with a one-line reason.

This is a read-only advisory. It never executes the suggested command automatically.
