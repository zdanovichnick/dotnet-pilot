---
name: breaking-changes
description: .NET 9 and .NET 10 breaking changes and migration gotchas that affect common patterns.
---

# .NET Breaking Changes & Migration Gotchas

## .NET 9

### HybridCache replaces IDistributedCache patterns
`HybridCache` (`Microsoft.Extensions.Caching.Hybrid`) is the new recommended caching abstraction.
The old `IDistributedCache` + `GetOrCreateAsync` pattern still works but `HybridCache` adds stampede protection and serialization improvements.
Migration: replace `IDistributedCache` injections with `HybridCache` where you own the code.

### OpenAPI document generation built-in
`Microsoft.AspNetCore.OpenApi` replaces `Swashbuckle.AspNetCore` for OpenAPI document generation.
Swashbuckle is not officially updated for .NET 9+ minimal API metadata.
Migration: `builder.Services.AddOpenApi()` + `app.MapOpenApi()` + Scalar for UI.

### TimeProvider is now first-class
`TimeProvider.System` is the production singleton; inject `TimeProvider` in services.
`DateTime.Now` / `DateTime.UtcNow` in production code is an antipattern.

## .NET 10

### Nullable analysis improvements
Compiler may flag previously-passing code as nullable warnings.
If you get new CS8602/CS8603/CS8604 warnings after upgrading, check for unchecked nullability assumptions.

### `params` collections
`params IEnumerable<T>` now works (not just arrays). Logging calls and test helpers may pick up new overloads — verify behavior is unchanged.

## EF Core 9

### `UseSeeding` / `UseAsyncSeeding` replaces `HasData`
`HasData` still works but `UseSeeding` is the new recommended approach for data seeding that requires DI.

### `ExecuteUpdateAsync` with complex expressions
Some LINQ expressions in `ExecuteUpdateAsync` that worked in EF 8 may require rewriting for EF 9's stricter translation. Run integration tests after upgrade.

## Polly v8 (from v7)

### Complete API rewrite
`Policy.Handle<>().Retry()` does NOT exist in v8.
New API: `new ResiliencePipelineBuilder().AddRetry(new RetryStrategyOptions { ... }).Build()`.
The `Microsoft.Extensions.Http.Resilience` package handles `IHttpClientFactory` wiring automatically.

## xUnit v3 (from v2)

### Constructor injection from DI
xUnit v3 supports constructor injection from a shared test DI container.
`IClassFixture<T>` still works but you can now use `[TestContext]` parameter injection for richer test context.
