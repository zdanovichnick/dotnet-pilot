## Cache-Aside Pattern

The standard manual pattern: check cache → on miss, load from source → store → return.

```csharp
public async Task<Order?> GetOrderAsync(int id, CancellationToken ct)
{
    var key = CacheKeys.Order(id);

    // 1. Check cache
    var cached = await distributedCache.GetStringAsync(key, ct);
    if (cached is not null)
        return JsonSerializer.Deserialize<Order>(cached);

    // 2. Miss — load from source
    var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id, ct);
    if (order is null)
        return null;

    // 3. Store
    var serialized = JsonSerializer.Serialize(order);
    await distributedCache.SetStringAsync(key, serialized, new DistributedCacheEntryOptions
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
    }, ct);

    // 4. Return
    return order;
}
```

**Prefer HybridCache over manual cache-aside** — it handles stampede protection, L1/L2, and serialization automatically. Use manual cache-aside only when you need fine-grained control over serialization or a custom distributed store.

## IMemoryCache (Single-Node)

Use when you don't need distribution and the data is node-local (e.g., config, feature flags, per-process state).

```csharp
public class FeatureFlagService(IMemoryCache cache, IConfiguration config)
{
    public bool IsEnabled(string flag)
        => cache.GetOrCreate($"flag:{flag}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            entry.Priority = CacheItemPriority.Low;
            return config.GetValue<bool>($"Features:{flag}");
        });
}
```

Async version:

```csharp
public async Task<UserProfile?> GetProfileAsync(string userId, CancellationToken ct)
    => await cache.GetOrCreateAsync($"profile:{userId}", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        return await db.UserProfiles.FindAsync([userId], ct);
    });
```

## Multi-Tenant Key Strategy

Always scope cache keys to the tenant. A missing tenant prefix is a data leakage bug.

```csharp
// Resolve tenant from HTTP context
public class TenantCacheKeyFactory(IHttpContextAccessor accessor)
{
    private string TenantId =>
        accessor.HttpContext?.User.FindFirstValue("tenant_id")
        ?? throw new InvalidOperationException("No tenant in context");

    public string Product(int id) => $"t:{TenantId}:product:{id}";
    public string ProductList()   => $"t:{TenantId}:products";
}
```

