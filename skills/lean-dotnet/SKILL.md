---
name: lean-dotnet
description: The smallest complete change in a .NET solution — the reuse ladder (codebase, BCL and ASP.NET Core built-ins, installed packages, then new code), what the framework already ships, the `shortcut:` comment for a known limit, and what is never cut.
when_to_use: Before writing new production code, choosing a NuGet package, or adding an abstraction; when reviewing a change for code that should not exist.
---

# Lean .NET

The best code is the code nobody has to write. Be lazy about the solution, never about the change:
finish every place the change must reach — callers, DI registration, `appsettings*.json`, the
migration, the tests your change breaks.

## Before you write

List the places the change must reach. For a signature change, that is every caller
(`mcp__roslyn__find_callers` or `find_references`), every implementation of the interface
(`find_implementations`), and the registration. That list is the scope; features nobody asked for
are not.

**Bug fix:** find every caller of the function you touch first, then fix the root cause once in the
shared code. A guard added in one caller leaves the others broken.

## The reuse ladder

Take the first rung that fully works:

1. **Does it need to exist?** Skip options, flags and flexibility nobody asked for, and name what you
   skipped in one line of the report.
2. **The codebase already has it** — a helper, base endpoint, extension method, `Result` type, house
   validator. Use it the way its neighbours do.
3. **The BCL or ASP.NET Core ships it** (table below). Unless the project has its own version;
   the house version wins.
4. **An installed package does it.** Check the `.csproj` and `Directory.Packages.props` first. Never
   add a NuGet package for a few lines of code.
5. **Otherwise, the minimum code that passes the test.**

Between options of equal size, take the one that is correct on the edge cases (empty, `null`,
`default`, time zones, cancellation).

## Already in the framework

| Before you write… | Use |
| --- | --- |
| Rate limiting middleware | `AddRateLimiter` + `RequireRateLimiting` (`Microsoft.AspNetCore.RateLimiting`, .NET 7+) |
| Retry / timeout / circuit breaker around `HttpClient` | `AddStandardResilienceHandler()` (`Microsoft.Extensions.Http.Resilience`) — see `resilience` |
| A cache wrapper with stampede locking | `HybridCache` (.NET 9+) or `AddOutputCache` — see `caching` |
| Request DTO validation in minimal APIs | DataAnnotations + `builder.Services.AddValidation()` (.NET 10) |
| A custom error envelope | `AddProblemDetails()` + `IExceptionHandler` (.NET 8+) — see `error-handling` |
| Config binding and checks | `AddOptions<T>().Bind(...).ValidateDataAnnotations().ValidateOnStart()` |
| A "now" abstraction | `TimeProvider` (.NET 8+); `FakeTimeProvider` in tests |
| A dictionary of strategies keyed by name | Keyed services: `AddKeyedScoped<T>("key")` + `[FromKeyedServices]` (.NET 8+) |
| A timer loop in a hosted service | `BackgroundService` + `PeriodicTimer` |
| A producer/consumer queue | `System.Threading.Channels.Channel<T>` |
| Guard clauses | `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrWhiteSpace`, `ArgumentOutOfRangeException.ThrowIfNegative` |
| Group-and-count, batching | LINQ `CountBy` / `AggregateBy` (.NET 9+), `Chunk`, `DistinctBy` |
| Process tasks as they finish | `Task.WhenEach` (.NET 9+) |
| Sortable IDs | `Guid.CreateVersion7()` (.NET 9+) |
| URL-safe Base64 | `System.Buffers.Text.Base64Url` (.NET 9+) |
| A lock object | `System.Threading.Lock` (.NET 9+) |
| Secure random tokens | `RandomNumberGenerator.GetHexString` / `GetInt32` — never `Random` |
| Health endpoint | `AddHealthChecks()` + `MapHealthChecks("/health")` |
| JSON | `System.Text.Json`, unless the project already uses Newtonsoft |

## Abstractions: what is lean in .NET

- **An interface with one implementation is not automatically waste here.** A port in Application
  implemented in Infrastructure, or an interface that a test substitutes, is the layer rule
  (`clean-architecture`). It is waste when nothing substitutes it and no layer boundary needs it.
- **A generic repository over `DbContext`** duplicates what `DbSet<T>` already is. Add one only
  when the codebase already has the pattern; never introduce it alongside direct `DbContext` use.
- No wrapper that only forwards calls, no factory with one product, no options class nobody sets,
  no "for later" overloads. Keep the structure the solution already has: its layers, folders and
  registration style (`convention-learner`).
- Code you move or merge keeps its validation, error handling and `CancellationToken` flow.

## Known limits: the `shortcut:` comment

A deliberate simplification with a known ceiling gets one comment in this form, and it is one of the
few comments worth writing:

```csharp
// shortcut: in-process cache, per instance; move to HybridCache with Redis when we scale out
```

Name the limit and the trigger to revisit it. A reviewer treats a `shortcut:` line as a recorded
decision, not a finding, unless the change already crosses the limit it names. Find them all with
`git grep -n "// shortcut:" -- "*.cs"`.

## Never cut

Validation at trust boundaries, error handling that prevents data loss, authorization, transactions
around multi-write operations, `CancellationToken` on request paths, the DI registration, the
migration, and anything the brief asked for. New logic with a branch, a loop, a parser, money or
security leaves one test that fails when it breaks.
