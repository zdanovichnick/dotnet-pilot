## Identity
- Do not attribute yourself ("As Claude...", "I think...", "I'd suggest...")
- No sycophantic openers ("Great question!", "Certainly!")
- Be direct and concise — skip preamble, get to the answer

## Code Style (C# / .NET)
- Prefer explicit types over `var` unless the type is obvious from the right-hand side
- Use file-scoped namespaces
- Prefer `async/await` over `.Result` or `.Wait()`
- Always include `CancellationToken` params on async methods
- Prefer records for DTOs and immutable data shapes
- No commented-out code in final output
- Always use `var` for local variable declarations instead of explicit types.
  - ✅ `var product = await db.Products.FindAsync(id);`
  - ❌ `Product? product = await db.Products.FindAsync(id);`
- This applies to all local variables where the type is inferable — including LINQ results, awaited calls, `new` expressions, and loop variables.

## Testing
- Framework: xUnit + NSubstitute + FluentAssertions
- Name tests: `MethodName_Scenario_ExpectedBehavior`
- Arrange/Act/Assert blocks separated by blank lines — no inline comments labeling them
- Use `Substitute.For<T>()` for mocks; never hand-roll test doubles
- Use `Arg.Any<T>()`, `Arg.Is<T>()` for argument matching — avoid `Arg.Do` unless necessary
- Assert call counts with `Received(n)` / `DidNotReceive()`, not manual flags
- Prefer `[Theory]` + `[InlineData]` over duplicate `[Fact]` tests for parameterized cases
- Prefer `FluentAssertions` over raw `Assert` — use `.Should().Be()`, `.Should().ThrowAsync<T>()`, etc.
- Test one behavior per test — no multi-assertion sprawl unless testing a composite result

## Output Format
- Prefer code over explanation — show, don't tell
- When explaining, use short prose, not bullet walls
- If changes are small, show only the diff, not the whole file
- For multi-file changes, list files affected before showing code

## Git
- Never append `Co-Authored-By` lines to commit messages
- When creating a pull request, fetch default reviewers first: check `CODEOWNERS` for paths touched by the PR, then pass each matched owner via `--reviewer <user>` to `gh pr create`.

## Workflow
- Before writing code, confirm the approach if the change is non-trivial
- Don't create files unless asked — suggest the change first
- If something is ambiguous, ask one clarifying question before proceeding
- Flag breaking changes explicitly

## Jira / Tickets
- Use [BE] prefix on backend ticket titles, [FE] prefix on frontend ticket titles
- Default issue type: Task (unless explicitly a bug or story)
- Always include Acceptance Criteria in descriptions

## .NET Coding Style
- Use file-scoped namespaces in all C# files
- Use `var` for all local variable declarations where type is inferable
- Prefer primary constructors for classes with simple injection: `public class Service(IDep dep)`
- Use records for DTOs and immutable data shapes: `public record CreateUserRequest(string Name, string Email);`
- No `#region` blocks — use partial classes if a file is too large
- Prefer `IReadOnlyList<T>` / `IReadOnlyDictionary<K,V>` for read-only return types
- ✅ `public class OrderService(IOrderRepository repo, ILogger<OrderService> logger)`
- ❌ `public class OrderService { public OrderService(IOrderRepository repo) { _repo = repo; } }`

## .NET Error Handling
- Use `Result<TValue, TError>` for expected failures in domain/application layer — never throw for business rules
- Use `ProblemDetails` (RFC 7807) for all HTTP error responses — register a global `GlobalExceptionHandler`
- Never catch `Exception` at a call site unless you re-throw or have a specific recovery action
- Exception boundaries: controllers and background jobs only — let domain/application errors bubble as `Result`
- ✅ `return Result.Failure<Order>("Order not found");`
- ❌ `throw new NotFoundException("Order not found");` (from application layer)

## .NET Performance
- Every `async` method on a controller/service call path MUST have a `CancellationToken` parameter
- Use `TimeProvider` (injected) instead of `DateTime.Now` / `DateTime.UtcNow` — enables deterministic testing
- Never call `.Result` or `.Wait()` on a `Task` — propagate `async/await` all the way up
- Prefer `ExecuteUpdateAsync` / `ExecuteDeleteAsync` for bulk EF Core operations (no change-tracking overhead)
- Use `IMemoryCache` / `HybridCache` for hot data; annotate cache keys as constants
- ✅ `var user = await repo.GetByIdAsync(id, cancellationToken);`
- ❌ `var user = repo.GetByIdAsync(id).Result;`

## .NET Security
- Never log secrets, tokens, passwords, or PII — use structured logging with safe projections
- Always validate input at system boundaries (controllers, message consumers) — never trust caller
- Use parameterized queries only — never build SQL strings via interpolation or concatenation
- Store secrets in environment variables or a secrets manager — never in `appsettings.json` committed to git
- Use `IDataProtectionProvider` for encrypting PII at rest
- ✅ `logger.LogInformation("User {UserId} authenticated", userId);`
- ❌ `logger.LogInformation($"User {user.Email} with password {password} authenticated");`

## NuGet Package Guidelines
- Resilience: **Polly v8** (`Microsoft.Extensions.Resilience`) — use `ResiliencePipelineBuilder`
- Logging: **Serilog** with `Serilog.AspNetCore` — structured, sink-configurable
- Validation: **FluentValidation** with `FluentValidation.AspNetCore` — never DataAnnotations for complex rules
- Integration testing: **Testcontainers** (`Testcontainers.MsSql`, etc.) — real databases, not in-memory
- HTTP resilience: configure via `IHttpClientFactory` + Polly pipeline, never `new HttpClient()`
- Avoid packages with no commits in 2+ years or < 500k monthly downloads unless no alternative exists
