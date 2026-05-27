---
name: resilience
description: Polly v8 resilience patterns for .NET — retry, circuit breaker, timeout, hedging, and IHttpClientFactory integration using Microsoft.Extensions.Resilience.
---

# Resilience Patterns (Polly v8)

Reference for building fault-tolerant .NET services using Polly v8 and `Microsoft.Extensions.Resilience`. Used by `dnp-planner` and `dnp-tdd-developer-hard`.

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

## DI Registration

```csharp
builder.Services.AddResiliencePipeline("database", pipeline =>
    pipeline
        .AddRetry(new RetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromSeconds(1),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            ShouldHandle = new PredicateBuilder()
                .Handle<SqlException>()
                .Handle<TimeoutException>(),
            OnRetry = args =>
            {
                // args.Context, args.AttemptNumber, args.Outcome available
                Console.WriteLine($"Retry {args.AttemptNumber} after {args.RetryDelay}");
                return ValueTask.CompletedTask;
            }
        })
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(30),
            MinimumThroughput = 5,
            BreakDuration = TimeSpan.FromSeconds(15)
        })
        .AddTimeout(TimeSpan.FromSeconds(5)));
```

## Retry Strategy

```csharp
.AddRetry(new RetryStrategyOptions
{
    MaxRetryAttempts = 3,

    // Fixed, Linear, or Exponential
    BackoffType = DelayBackoffType.Exponential,
    Delay = TimeSpan.FromSeconds(1),  // base delay; doubles each attempt with Exponential

    // Adds ±20% random jitter to prevent thundering herd
    UseJitter = true,

    // Only retry on specific exceptions or results
    ShouldHandle = new PredicateBuilder()
        .Handle<HttpRequestException>()
        .HandleResult<HttpResponseMessage>(r => r.StatusCode == HttpStatusCode.TooManyRequests),

    OnRetry = args =>
    {
        logger.LogWarning(
            "Retry attempt {Attempt} after {Delay}ms due to {Exception}",
            args.AttemptNumber,
            args.RetryDelay.TotalMilliseconds,
            args.Outcome.Exception?.Message);
        return ValueTask.CompletedTask;
    }
})
```

## Circuit Breaker

Opens the circuit when the failure ratio exceeds the threshold, stopping all calls for `BreakDuration`.

```csharp
.AddCircuitBreaker(new CircuitBreakerStrategyOptions
{
    // Open circuit if ≥50% of calls fail
    FailureRatio = 0.5,

    // Measurement window
    SamplingDuration = TimeSpan.FromSeconds(30),

    // Minimum calls in window before circuit can open
    MinimumThroughput = 5,

    // How long circuit stays open before moving to half-open
    BreakDuration = TimeSpan.FromSeconds(15),

    OnOpened = args =>
    {
        logger.LogError("Circuit opened for {Duration}s", args.BreakDuration.TotalSeconds);
        return ValueTask.CompletedTask;
    },
    OnClosed = _ =>
    {
        logger.LogInformation("Circuit closed — service recovered");
        return ValueTask.CompletedTask;
    }
})
```

When the circuit is open, calls throw `BrokenCircuitException` immediately without hitting the dependency.

## Timeout

```csharp
// Per-attempt timeout (placed after retry — each attempt gets its own timeout)
.AddTimeout(TimeSpan.FromSeconds(5))

// Or with options for callbacks
.AddTimeout(new TimeoutStrategyOptions
{
    Timeout = TimeSpan.FromSeconds(5),
    OnTimeout = args =>
    {
        logger.LogWarning("Operation timed out after {Timeout}", args.Timeout);
        return ValueTask.CompletedTask;
    }
})
```

## Hedging (Parallel Fallback Requests)

Sends a duplicate request after a delay if the first hasn't returned. Uses the first successful response.

```csharp
.AddHedging(new HedgingStrategyOptions<HttpResponseMessage>
{
    // Send a second request after 500ms if first hasn't returned
    Delay = TimeSpan.FromMilliseconds(500),

    // How many parallel hedged requests to allow
    MaxHedgedAttempts = 2,

    ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
        .HandleResult(r => !r.IsSuccessStatusCode),

    ActionGenerator = args => () =>
        ValueTask.FromResult(Outcome.FromResult(
            args.PrimaryContext.Properties.GetValue(
                new ResiliencePropertyKey<HttpResponseMessage>("hedged-result"),
                null!)))
})
```

Use hedging for latency-sensitive read operations where idempotency is guaranteed.

## IHttpClientFactory Integration

### Standard Resilience Handler (recommended shortcut)

Applies retry + circuit breaker + timeout + rate limiter in one call:

```csharp
builder.Services.AddHttpClient("payments", client =>
    {
        client.BaseAddress = new Uri(builder.Configuration["PaymentsApi:BaseUrl"]!);
    })
    .AddStandardResilienceHandler(options =>
    {
        options.Retry.MaxRetryAttempts = 3;
        options.CircuitBreaker.FailureRatio = 0.5;
        options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(30);
    });
```

### Custom Pipeline per Client

```csharp
builder.Services.AddHttpClient("inventory")
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline
            .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
            {
                MaxRetryAttempts = 2,
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<HttpRequestException>()
                    .HandleResult(r => r.StatusCode >= HttpStatusCode.InternalServerError)
            })
            .AddTimeout(TimeSpan.FromSeconds(10));
    });
```

### Consuming the Named Client

```csharp
public class InventoryClient(IHttpClientFactory factory)
{
    public async Task<InventoryResponse?> GetStockAsync(string sku, CancellationToken ct)
    {
        var client = factory.CreateClient("inventory");
        var response = await client.GetAsync($"/stock/{sku}", ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<InventoryResponse>(ct);
    }
}
```

## Named Pipeline Usage (Non-HTTP)

```csharp
public class OrderRepository(
    AppDbContext db,
    ResiliencePipelineProvider<string> pipelines,
    ILogger<OrderRepository> logger)
{
    public async Task<Order?> GetByIdAsync(int id, CancellationToken ct)
    {
        var pipeline = pipelines.GetPipeline("database");

        return await pipeline.ExecuteAsync(
            async token => await db.Orders.FindAsync([id], token),
            ct);
    }
}
```

## Recommended Pipeline Compositions

| Use Case | Strategies (outer → inner) |
|----------|---------------------------|
| Database queries | Retry (3x exponential) → Timeout (5s) |
| HTTP API calls | Retry (3x) → Circuit Breaker → Timeout (10s total) |
| Payment processing | Circuit Breaker → Timeout (30s) — no retry (idempotency risk) |
| Read-heavy low-latency | Hedging → Timeout |
| Background job step | Retry (5x linear) → Timeout (60s) |

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
