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

