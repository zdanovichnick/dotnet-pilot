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
        .HandleResult(r => !r.IsSuccessStatusCode)
    // No ActionGenerator: the default re-invokes the original callback, which is what hedging needs.
})
```

For `HttpClient`, prefer `AddStandardHedgingHandler()` from `Microsoft.Extensions.Http.Resilience`
over hand-built hedging — it wires per-attempt timeouts and circuit breakers around each hedged call.

Use hedging for latency-sensitive read operations where idempotency is guaranteed.

