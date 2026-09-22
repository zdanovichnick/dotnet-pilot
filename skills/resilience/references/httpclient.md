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

