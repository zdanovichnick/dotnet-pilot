---
description: "Initialize DotnetPilot for a .NET solution — discovers projects and writes the user-scoped .planning/ state (config.json, solution-map.json)."
argument-hint: "[--refresh to re-scan an existing .planning/]"
effort: medium
disable-model-invocation: true
---

# Initialize

`/dotnet-pilot:project:init` scans the solution and writes `.planning/` under the user-scoped
path `~/.claude/projects/<flattened-cwd>/.planning/`, where `<flattened-cwd>` replaces `:` and
path separators with `-` (`D:\Projects\Foo` → `D--Projects-Foo`). Nothing lands in the repo.
Hooks read a repo-local `.planning/` first, so an older in-repo directory keeps working until it
is moved to the user-scoped path.

## Execution

1. Locate the `.sln`/`.slnx` (current directory or nearest parent) and run `dotnet sln list`.
2. Per project, read the `.csproj`: target framework, type (`web`, `classlib`, `xunit`, `nunit`,
   `mstest`, `worker`, `console`), project references, notable packages. Classes extending
   `DbContext` give the EF contexts.
3. Derive the architecture style from the reference graph: `clean` (Domain → Application →
   Infrastructure → Api), `vertical-slice` (feature folders), or `flat`.
4. Write `config.json` and `solution-map.json` (below). `--refresh` rewrites only these two files.
5. Report: solution, framework, architecture, test framework, a project table (name · type ·
   layer), EF contexts, and the state path.

## `config.json`

Holds the detected `dotnet.*` values — `solution_path`, `target_framework`, `test_framework`,
`ef_contexts`, `architecture_style`. Hook toggles (`hooks.*`) and `statusline.*` are optional and
default on/off as `hooks/_lib/config.js` documents; do not write them unless the user wants a
non-default.

## `solution-map.json`

The cached project graph. `dotnet:*` commands and the `dnp-project-scope-guard` hook read it
instead of re-scanning the solution. `projects` is an **array**:

```json
{
  "projects": [
    {
      "name": "Shop.Domain",
      "path": "src/Shop.Domain/Shop.Domain.csproj",
      "type": "classlib",
      "layer": "domain",
      "framework": "net10.0",
      "references": [],
      "notes": "optional free text"
    }
  ]
}
```

`layer` is `domain`, `application`, `infrastructure`, `api`, `test`, or `other`; `references`
lists project names; `notes` may be omitted. A `STATE.md` beside it with `focus_projects: [...]`
frontmatter is optional and only enables the scope-guard hook.
