---
name: resilience
description: Polly v8 resilience patterns for .NET — retry, circuit breaker, timeout, hedging, and IHttpClientFactory integration using Microsoft.Extensions.Resilience.
when_to_use: Adding retry, circuit breaker, timeout, or hedging around an outbound call; configuring IHttpClientFactory resilience; migrating off Polly v7.
---

# Resilience Patterns (Polly v8)

Reference for building fault-tolerant .NET services using Polly v8 and `Microsoft.Extensions.Resilience`.

## Package Reference

```xml
<PackageReference Include="Microsoft.Extensions.Resilience" Version="9.*" />
<!-- For HTTP clients: -->
<PackageReference Include="Microsoft.Extensions.Http.Resilience" Version="9.*" />
```

**Breaking change from Polly v7**: the `Policy.Handle<>().Retry()` API is gone. Use `ResiliencePipelineBuilder` exclusively.

## Core Concepts

| Concept | Purpose |
|---------|---------|
| `ResiliencePipeline` | Executes a delegate through a chain of strategies |
| `ResiliencePipelineBuilder` | Fluent builder — add strategies in order (outermost first) |
| `ResiliencePipelineProvider<TKey>` | DI-resolved registry; resolve pipelines by key |
| `ResilienceContext` | Per-execution metadata (cancellation token, properties) |

Strategies execute in the order they are added. Outer strategies wrap inner ones — add timeout last to apply it per-attempt, or first to apply it to the whole pipeline.

## References

Load only the file the task needs:

| File | Covers |
|------|--------|
| `references/strategies.md` | DI registration of pipelines; retry, circuit breaker, timeout, and hedging strategy options |
| `references/httpclient.md` | `AddStandardResilienceHandler`, a custom pipeline per client, consuming the named client |
| `references/named-pipelines.md` | Resolving keyed pipelines from `ResiliencePipelineProvider<TKey>` for non-HTTP work |

## Recommended Pipeline Compositions

| Use Case | Strategies (outer → inner) |
|----------|---------------------------|
| Database queries | Retry (3x exponential) → Timeout (5s) |
| HTTP API calls | Total timeout (30s) → Retry (3x) → Circuit Breaker → Attempt timeout (10s) |
| Payment processing | Circuit Breaker → Timeout (30s) — no retry (idempotency risk) |
| Read-heavy low-latency | Hedging → Timeout |
| Background job step | Retry (5x linear) → Timeout (60s) |

## Gotchas

- A timeout placed inside the retry is **per attempt**. The worst-case wall time is roughly
  attempts × attempt-timeout plus back-off delays. Add an outer timeout when callers need a hard cap
  (`AddStandardResilienceHandler` does this: 30s total, 10s per attempt).
- **Polly retry stacks with EF Core's `EnableRetryOnFailure`.** EF's retrying execution strategy
  already retries transient SQL errors (SQL Server default: 6 retries). A Polly retry around the
  same `SaveChangesAsync` multiplies attempts and latency. Pick one retry layer for database calls.
  With EF's strategy enabled, a user-initiated transaction must run inside
  `db.Database.CreateExecutionStrategy().ExecuteAsync(...)`.
- Retrying a non-idempotent POST can duplicate the side effect. Retry it only with an idempotency key.

## Do / Don't

| Do | Don't |
|----|-------|
| Always pass `CancellationToken` to `ExecuteAsync` | Let the pipeline ignore cancellation |
| Add `UseJitter = true` to retry strategies | Use fixed delays (thundering herd) |
| Log retries with `OnRetry` callback | Retry silently — you lose observability |
| Set `ShouldHandle` to specific exceptions | Handle all exceptions with default predicate in payment flows |
| Place timeout after retry for per-attempt timeout | Nest retry inside retry (doubles the attempt count unexpectedly) |
| Use `AddStandardResilienceHandler` for new HTTP clients | Hand-roll retry loops around `HttpClient` |
| Use circuit breaker for downstream service calls | Use circuit breaker for local in-memory operations |

## See Also
- `skills/caching/SKILL.md` — HybridCache stampede protection reduces load, complementing circuit breakers
- `skills/error-handling/SKILL.md` — `BrokenCircuitException` should surface as a `Result.Failure` at domain boundaries
