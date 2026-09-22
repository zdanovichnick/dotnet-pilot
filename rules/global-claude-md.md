## Voice
- No self-attribution ("As Claude…", "I'd suggest…") and no sycophantic openers.
- Show the code; explain only what the code doesn't say. Small changes → the diff, not the file.
- Multi-file changes: list the affected files before the code.

## C# / .NET Style
- `var` for every local whose type is inferable; write the type only when inference genuinely
  loses information.
- File-scoped namespaces, records for DTOs and immutable shapes, primary constructors for simple
  injection. No `#region` — split the file instead.
- Whatever the surrounding file already does wins over all of the above.

## Comments
Minimum comments — only critical ones. Default to none; names, small methods, and structure carry
the intent. A comment is critical only when the code cannot say it: a non-obvious **why** (a
workaround and the constraint forcing it), an invariant or ordering a caller must honor, or a
deliberate deviation from the surrounding pattern. Never restate the line below it; never leave
commented-out code or an unowned `// TODO`. `///` XML docs belong on public API surface other
teams consume, not on internals.

## Error Handling
- `Result<TValue, TError>` for expected/business failures in domain and application code;
  exceptions cross boundaries only (controllers, background jobs).
- RFC 7807 `ProblemDetails` for every HTTP error, via a registered `GlobalExceptionHandler`.

## Async & Time
- `CancellationToken` on every async method on a controller or service call path, threaded all
  the way down. Never `.Result` or `.Wait()`.
- Injected `TimeProvider`, not `DateTime.UtcNow` — otherwise the behavior isn't testable.

## Logging
Structured logging with safe projections; secrets, tokens, and PII never reach a log sink.
`logger.LogInformation("User {UserId} authenticated", userId)` — never interpolate the subject.

## Testing
- xUnit; `MethodName_Scenario_ExpectedBehavior`; `[Theory]` + `[InlineData]` over duplicated
  `[Fact]`s; one behavior per test.
- NSubstitute + FluentAssertions for new test projects — an existing project's libraries win.
- Integration tests hit real dependencies via Testcontainers, not in-memory substitutes.

## Package Defaults (greenfield; existing choices win)
Polly v8 via `Microsoft.Extensions.Resilience` · Serilog + `Serilog.AspNetCore` · FluentValidation
for anything beyond trivial rules · `IHttpClientFactory` + a Polly pipeline, never `new HttpClient()`.

## Git
- No `Co-Authored-By` lines in commit messages.
- Before opening a PR, match the touched paths against `CODEOWNERS` and pass each owner as
  `--reviewer <user>` to `gh pr create`.

## Jira
`[BE]` / `[FE]` title prefixes. Default issue type Task. Always include Acceptance Criteria.

## .NET Tooling Priority
In a solution containing `.sln` / `.slnx` / `.csproj`, inspect C# with `mcp__roslyn__*`
(dnp-roslyn) — DI completeness, architecture violations, EF models, references, class outlines.
`mcp__*code-analyzer__*` supports Python/TS/JS only and returns `unsupported_language` on `.cs`;
it stays the right tool for the non-C# files in the same repo. Prefer `dnp-*` agents and
`/dotnet-pilot:*` commands for .NET work.
