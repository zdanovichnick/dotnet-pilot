## Voice
- No self-attribution ("As Claude…", "I'd suggest…") and no sycophantic openers.
- Show the code; explain only what the code doesn't say. Small changes → the diff, not the file.
- Multi-file changes: list the affected files before the code.

## C# / .NET Style
- `var` for every local whose type is inferable — LINQ results, awaited calls, `new` expressions,
  `foreach` variables. Only write the type when inference genuinely loses information.
- File-scoped namespaces. Records for DTOs and immutable shapes. `IReadOnlyList<T>` /
  `IReadOnlyDictionary<K,V>` for read-only returns. No `#region` — split the file instead.
- Primary constructors for simple injection: `public class OrderService(IOrderRepository repo, ILogger<OrderService> logger)`.
- Whatever the surrounding file already does wins over all of the above.

## Comments
Write as few as possible — most comments are noise that drifts out of date while the code moves on.
Default to none and let names, small methods, and structure carry the intent. A comment earns its
place only when the code genuinely cannot say the thing itself:

- a non-obvious **why** — a workaround plus the constraint forcing it, a perf trade-off, a spec quirk
- an invariant, ordering requirement, or thread-safety expectation a caller has to honor
- a deliberate deviation from the surrounding pattern

Never restate the line below it, never narrate mechanics (`// loop over the orders`), never label
Arrange/Act/Assert, never leave commented-out code or an unowned `// TODO`. `///` XML docs belong on
public API surface other teams consume — not on internals, and not as a signature paraphrase.

## Error Handling
- `Result<TValue, TError>` for expected/business failures in domain and application code — those
  are outcomes, not exceptions. Exceptions cross boundaries only: controllers, background jobs.
- RFC 7807 `ProblemDetails` for every HTTP error, via a registered `GlobalExceptionHandler`.
- Don't catch `Exception` unless you re-throw or have a specific recovery.

## Async & Performance
- `CancellationToken` on every async method on a controller or service call path, threaded all the
  way down. Never `.Result` or `.Wait()`.
- Injected `TimeProvider`, not `DateTime.UtcNow` — otherwise the behavior isn't testable.
- `ExecuteUpdateAsync` / `ExecuteDeleteAsync` for bulk EF Core writes (skips change tracking).

## Security
- Structured logging with safe projections; secrets, tokens, and PII never reach a log sink.
  `logger.LogInformation("User {UserId} authenticated", userId)` — never interpolate the subject.
- Parameterized queries only. Validate at system boundaries (controllers, message consumers).
- Secrets from environment or a secrets manager, never committed `appsettings.json`.
  `IDataProtectionProvider` for PII at rest.

## Testing
- xUnit; `MethodName_Scenario_ExpectedBehavior`; Arrange/Act/Assert separated by blank lines;
  `[Theory]` + `[InlineData]` over duplicated `[Fact]`s; one behavior per test.
- NSubstitute + FluentAssertions for new test projects — but an existing project's mocking and
  assertion libraries win. Two mocking libraries in one solution is debt.
- Integration tests hit real dependencies via Testcontainers, not in-memory substitutes.

## Package Defaults (greenfield; existing choices win)
Polly v8 via `Microsoft.Extensions.Resilience` · Serilog + `Serilog.AspNetCore` · FluentValidation
for anything beyond trivial rules · `IHttpClientFactory` + a Polly pipeline, never `new HttpClient()`.
Skip packages with no commits in 2+ years or under ~500k monthly downloads unless nothing else exists.

## Git
- No `Co-Authored-By` lines in commit messages.
- Before opening a PR, match the touched paths against `CODEOWNERS` and pass each owner as
  `--reviewer <user>` to `gh pr create`.
- The `dnp-git-autoapprove` hook pre-approves safe `git`/`gh` commands, so they run without a
  permission prompt — just run them instead of narrating or asking first.

## Workflow
Don't create files that weren't asked for — propose the change instead. Flag breaking changes
explicitly (signature, contract, schema, config).

## Jira
`[BE]` / `[FE]` title prefixes. Default issue type Task. Always include Acceptance Criteria.

## .NET Tooling Priority
In a solution containing `.sln` / `.slnx` / `.csproj`, inspect C# with `mcp__roslyn__*`
(dnp-roslyn) — DI completeness, architecture violations, EF models, references, class outlines.
`mcp__*code-analyzer__*` supports Python/TS/JS only and returns `unsupported_language` on `.cs`;
it stays the right tool for the non-C# files in the same repo. Prefer `dnp-*` agents and
`/dotnet-pilot:*` commands for .NET work.
