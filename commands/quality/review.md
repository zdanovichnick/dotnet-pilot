---
description: "Code review current changes with .NET-specific focus — async patterns, LINQ, naming, DI."
argument-hint: "[--depth quick|standard|deep]"
---

# Code Review

`/DotnetPilot:quality:review` reviews staged or recent changes.

> **Delegates to**: the stock Claude Code `code-reviewer` agent (not a DotnetPilot-specific reviewer).

## Execution

This command delegates to the stock `code-reviewer` agent with a .NET-specific focus.
The DotnetPilot-specific `dnp-code-reviewer` was retired in v1.0.0 — stock Claude Code
review plus the checklist below is equivalent in quality and does not drift as Claude
evolves.

1. Get changed files: `git diff --name-only HEAD~1` (or staged changes with `git diff --cached --name-only`).
2. Filter to `.cs` files.
3. Spawn the stock `code-reviewer` agent (via Task tool) with:
   - Changed file contents
   - Diff context
   - Depth directive (see below)
   - The .NET checklist in the "Focus areas" section
4. Present findings prioritized by severity.

## Depth levels

- **quick** — naming + compilation risk + obvious bugs
- **standard** — + async/await pitfalls + DI lifetime issues + nullable ref-type violations
- **deep** — + N+1 EF queries + thread-safety + performance + OWASP (injection, auth)

## Focus areas for .NET review

Pass this checklist verbatim to the reviewer so the output is .NET-aware:

- Async methods end with `Async`; no `.Result` / `.Wait()`; `CancellationToken` propagated.
- No `async void` except event handlers; no fire-and-forget without error handling.
- LINQ: `Any()` not `Count() > 0`; `AsNoTracking()` on read-only EF queries; no N+1.
- Nullable reference types respected; no `null!` suppression without justification.
- Constructor injection over property/service-locator; interface-based dependencies.
- Specific exception types (no `catch (Exception)` without rethrow); ProblemDetails for API errors.
- Controller attributes: `[ApiController]`, `[ProducesResponseType]`, route consistency.
- For DI lifetime concerns or architecture violations, run `/DotnetPilot:dotnet:check-solution` instead — the Roslyn-backed checks are more accurate than line-by-line review.
