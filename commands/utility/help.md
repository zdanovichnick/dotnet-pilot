---
description: "List DotnetPilot commands with their arguments, plus the agent, skill and hook rosters and a 'Did you mean' table for names removed in v3.0.0."
effort: low
---

# DotnetPilot Help

Print the following block **exactly as-is** — do not summarize, paraphrase, or add any other text:

```
DotnetPilot v3.5.1 — .NET development plugin for Claude Code
Usage: /dotnet-pilot:<category>:<command> [args]      e.g. /dotnet-pilot:dotnet:create-entity Product

COMMANDS (16)

  project — lifecycle
    project:init            [--refresh]
        Discover the solution and write the user-scoped .planning/ (config.json, solution-map.json)
    project:verify          [--quick]
        Build, tests, DI completeness, architecture check; --quick is the pre-commit form
    project:ship            [--draft]
        Final checks, then gh pr create

  dotnet — scaffolding & solution management
    dotnet:scaffold         [feature|api|service|project] <Name> [--arch vsa|clean|ddd] [--minimal]
                            [--lifetime scoped|transient|singleton] [--type classlib|web|xunit|worker|console]
        Generate code that matches the solution's architecture; feature is the default mode
    dotnet:create-entity    <Name> [--properties 'Name:string, Age:int, Email:string']
        Entity class, EF configuration, repository, service, DI registration; then add-migration
    dotnet:add-endpoint     <Controller> <http-method> <route> [--with-dto]
        Add an endpoint to an existing controller or endpoint group
    dotnet:add-migration    <Name> [--context <DbContext>]
        Generate, then check Up() for data-loss operations; idempotent SQL script for review
    dotnet:tdd              <task> [--complexity easy|hard] [--existing <class|file|project>]
        Failing tests first, then production code; --existing adds tests to code that already exists
    dotnet:run-tests        [project] [--coverage] [--filter <pattern>]
        Run tests with coverage reporting and failure diagnosis
    dotnet:health-check     [--fix]
        Build, tests, NuGet, project references, DI completeness

  quality — safety checks
    quality:review          [--base <ref> | --staged | --last-commit | --scope <glob>]
                            [--depth quick|standard|deep]
        Sharded review: haiku scouts per diff shard, opus confirmers per finding, one deterministic
        digest. Runs the dnp-review workflow; allow the permission rule Workflow(dnp-review) once
    quality:check-architecture
        Clean-architecture layer violations: forbidden project references, DI issues, package placement
    quality:security-scan   [--scope <Project>]
        OWASP audit: NuGet CVEs, secrets exposure, auth config, CORS, input validation
    quality:de-sloppify     [--scope <path>]
        Dead code removal, naming normalization, duplication elimination; needs a green test run first

  utility — housekeeping
    utility:help            This text
    utility:statusline      [--manual]
        Install the .NET-aware statusline; --manual prints the settings.json snippet instead

AGENTS (9) — spawned by commands; a decision they cannot make returns as [HALT: <question>]
  dnp-tdd-developer-easy     sonnet / low    Routine TDD; also runs dotnet:scaffold and dotnet:add-endpoint
  dnp-tdd-developer-hard     opus / medium   Complex TDD: architectural choices, cross-layer changes
  dnp-refactor-cleaner       sonnet / high   Dead code, naming, duplication; behavior verified by tests
  dnp-architect              opus / high     Layer boundaries, project references, package placement
  dnp-ef-migration-planner   sonnet / low    Migration chain, data-loss risk, DbContext targeting
  dnp-security-auditor       sonnet / high   OWASP Top 10 for APIs, secrets, auth config, input validation
  dnp-performance-analyst    sonnet / high   Async hotspots, N+1 queries, caching gaps, allocation pressure
  dnp-di-wiring-checker      sonnet / low    Constructor injection cross-checked against DI registrations
  dnp-nuget-auditor          sonnet / low    Vulnerable, outdated and version-inconsistent packages

SKILLS (15) — knowledge packs agents load on demand
  architecture     clean-architecture · vertical-slice · ddd · convention-learner · dotnet-project-init
  api & data       aspnet-api-patterns · ef-core-patterns · error-handling · authentication
  cross-cutting    caching · resilience · logging · opentelemetry
  language & test  modern-csharp · testing-dotnet

HOOKS (13) — advisory (exit 0) except dnp-git-autoapprove, which grants permission; switch one
            off with hooks.<key>: false in .planning/config.json
  dnp-sync-global-claude-md    (sync_global_claude_md)   at session start, refresh the rules block in ~/.claude/CLAUDE.md
  dnp-dotnet-priority          (dotnet_priority)         steer .NET work to dnp-* agents and mcp__roslyn__*
  dnp-code-analyzer-redirect   (code_analyzer_redirect)  code-analyzer MCP has no C#; use mcp__roslyn__*
  dnp-migration-guard          (migration_guard)         warn before a hand edit under Migrations/
  dnp-git-autoapprove          (git_autoapprove)         auto-allow safe single git/gh commands (Bash only)
  dnp-commit-format            (commit_format)           conventional-commit check on git commit -m "..."
  dnp-di-registration-check    (di_check)                new .cs class with no DI registration
  dnp-project-scope-guard      (project_scope_guard)     edit outside .planning/STATE.md focus_projects
  dnp-post-edit-format         (post_edit_format)        dotnet format over the .cs files saved in a turn (at Stop)
  dnp-build-verify             (build_verify)            build/test failure streak: warn at 3, escalate at 5
  dnp-stop-verify              (stop_verify)             nudge to build/test before stopping after .cs edits
                                                         (stop_verify_block: true makes it block instead)
  dnp-subagent-result          (subagent_result)         show [HALT / [PARTIAL / [ROUTING: from dnp-* agents
  dnp-statusline-sync          (statusline.auto_enable)  refresh ~/.claude/dnp-statusline.js at session start
                                                         (auto_enable: true also wires settings.json)

Did you mean — commands removed in v3.0.0 and where their job went
  dotnet:add-project         → dotnet:scaffold project <Name> --type <classlib|web|xunit|worker|console>
  dotnet:add-service         → dotnet:scaffold service <Name> [--lifetime ...]
  dotnet:create-api          → dotnet:scaffold api <Entity> [--minimal]
  dotnet:write-tests         → dotnet:tdd --existing <class|file|project>
  dotnet:build-fix           → run dotnet build and fix inline; the dnp-build-verify hook
                               escalates after repeated failures
  project:checkpoint         → project:verify --quick
  quality:commit-check       → project:verify --quick
  quality:check-packages     → dotnet:health-check (NuGet section) or quality:security-scan
  project:next               → Plan Mode + TaskCreate (Claude Code native)
  utility:status             → git status + TaskList (Claude Code native)
  utility:quick-fix          → just ask in the conversation — no command needed
  utility:settings           → edit .planning/config.json (keys: hooks/_lib/config.js)
  utility:show-solution      → mcp__roslyn__get_solution_structure, or .planning/solution-map.json
                               (schema documented in project:init)

Docs: README.md (full reference) · CHANGELOG.md (every removed name) · hooks/_lib/config.js (toggle keys)
```
