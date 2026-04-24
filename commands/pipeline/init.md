---
description: "Initialize DotnetPilot for a .NET solution — discovers projects, creates user-scoped .planning/ directory, generates PROJECT.md and solution map."
argument-hint: "[--refresh to re-scan existing .planning/]"
---

# Initialize DotnetPilot Workflow

`/DotnetPilot:pipeline:init` discovers your .NET solution and creates a user-scoped
`.planning/` directory with all foundational state files.

Requires `enableProjectModel: true` (set automatically on first run).

## State location

`.planning/` lives in a user-scoped path (not committed to the repo):

```
~/.claude/projects/<flattened-repo-path>/.planning/
```

The path is derived from the current working directory by replacing `:` and path
separators with `-`, matching Claude Code's memory-system convention. Example:

- Repo: `D:\Projects\1Poc\dotnet-pilot`
- State: `~/.claude/projects/D--Projects-1Poc-dotnet-pilot/.planning/`

This avoids polluting repos with Claude-specific state and makes `.planning/` naturally
per-developer. Teammates who don't use Claude Code never see it.

### Migration from repo-local .planning/

If your repo still has a local `.planning/` directory, the hooks continue to read it
for backward compatibility. To migrate to user-scoped:

```bash
REPO_FLAT=$(pwd | sed -e 's/:/-/g' -e 's|[/\\]|-|g' -e 's/^-*//')
mkdir -p ~/.claude/projects/$REPO_FLAT
mv .planning ~/.claude/projects/$REPO_FLAT/.planning
git rm -r --cached .planning 2>/dev/null || true
echo ".planning/" >> .gitignore
```

## Execution

### Step 1: Discover solution

1. Find `.sln` or `.slnx` file in the current directory (or nearest parent).
2. Run `dotnet sln list` to enumerate all projects.
3. For each project, read the `.csproj` to extract:
   - Target framework (`net8.0`, `net9.0`, `net10.0`, etc.)
   - Project type (web, classlib, xunit, nunit, mstest, worker, console)
   - Project references (layer detection)
   - Key NuGet packages
4. Detect architecture style from the project reference graph:
   - **Clean architecture**: Domain → Application → Infrastructure → Api layers
   - **Vertical slices**: Feature-folder organization
   - **Flat**: Single project or minimal structure
5. Detect test framework from test project packages.
6. Detect EF Core contexts by searching for classes extending `DbContext`.

### Step 2: Create state directory

1. Compute `<flattened-repo-path>` from the current working directory (replace `:` and
   separators with `-`, then strip leading dashes).
2. Create `~/.claude/projects/<flattened>/.planning/` if it does not exist (or
   `--refresh` was passed).
3. Generate `config.json` with detected .NET settings (see template below).
4. Generate `solution-map.json` with the full project structure cache.
5. Create empty `STATE.md`, `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` from templates.

### Step 3: Populate PROJECT.md

Use `AskUserQuestion` to gather:

- **What are you building?** (core value proposition)
- **Who is this for?** (target users / audience)
- **What constraints exist?** (deadlines, existing APIs, backward compatibility)

Write answers into `PROJECT.md`.

### Step 4: Report

Display a summary:

- Solution: `<name>.slnx` with N projects
- Framework: `net10.0` | Architecture: `clean` | Tests: `xunit`
- Projects discovered (table with name, type, layer)
- EF Core contexts found
- State directory: `~/.claude/projects/<flattened>/.planning/`
- Next step: open Plan Mode for your first feature, or run `/DotnetPilot:dotnet:scaffold-entity <name>` for a focused scaffold.

## Templates

### config.json (minimum)

```json
{
  "enableProjectModel": true,
  "dotnet": {
    "solution_path": "<detected>",
    "target_framework": "<detected>",
    "test_framework": "<detected>",
    "ef_contexts": ["<detected>"],
    "architecture_style": "<detected>",
    "use_minimal_api": false,
    "central_package_management": false
  },
  "hooks": {
    "di_check": true,
    "migration_guard": true,
    "project_scope_guard": true,
    "build_verify": true,
    "commit_format": true
  },
  "workflow": {
    "build_after_task": true,
    "test_after_task": true,
    "di_check_on_write": true
  }
}
```

### STATE.md

```markdown
---
phase: 0
status: initialized
last_activity: <timestamp>
focus_projects: []
---

## Current Position
Initialized. Use Plan Mode to design features; the `dnp-planner` agent produces a
TaskCreate-compatible task list on demand.

## Recent Decisions
(none)

## Pending
(none)
```

## Flags

- `--refresh`: Re-scan solution and update `solution-map.json` and `config.json` without
  overwriting existing PROJECT.md, REQUIREMENTS.md, or ROADMAP.md.
