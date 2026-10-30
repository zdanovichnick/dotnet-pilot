---
description: Discover a .NET solution and cache its projects, conventions, test framework, and EF contexts.
---

# Initialize DotnetPilot

1. Read the `dotnet-project-init` and `convention-learner` pattern skills.
2. Find `.sln` / `.slnx` files in the current directory or nearest parent. Ask the user
   to choose if multiple solutions are in scope. Run `dotnet sln <solution> list`.
3. Inspect project files and inherited props for frameworks, references, package
   management, test runners, architecture layers, and EF contexts. Use Roslyn when available.
4. Resolve the state directory using the host runtime instructions. Write only
   `config.json` and `solution-map.json`; preserve unrelated state. With `--refresh`,
   re-scan and replace those two caches. Never create or alter host settings.
5. `config.json` contains `dotnet.solution_path`, `target_framework`, `test_framework`,
   `ef_contexts`, and `architecture_style`. The solution map contains a `projects` array;
   each item has `name`, solution-relative `path`, `type`, `layer`, `framework`, and
   `references` (project names). Layers are domain, application, infrastructure, api,
   test, or other. Record uncertainty rather than inventing a classification.
6. Report the chosen solution, projects, frameworks, test runner, EF contexts, and
   absolute cache path. Initialization does not scaffold code, build, or apply migrations.
