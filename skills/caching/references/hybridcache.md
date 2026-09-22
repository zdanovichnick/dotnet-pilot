## HybridCache (.NET 9+)

HybridCache combines an in-process L1 cache (fast) with an optional L2 distributed cache (Redis, SQL). Built-in stampede protection: concurrent requests for the same key share one factory call.

### Package

```xml
<PackageReference Include="Microsoft.Extensions.Caching.Hybrid" Version="9.*" />
<!-- Optional Redis L2: -->
<PackageReference Include="Microsoft.Extensions.Caching.StackExchangeRedis" Version="9.*" />
```

### Registration

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        // How long entries live in both L1 and L2
        Expiration = TimeSpan.FromMinutes(5),
        // L1 can expire sooner to reduce stale reads across instances
        LocalCacheExpiration = TimeSpan.FromMinutes(1)
    };
    // Cap serialized value size (protects against runaway entries)
    options.MaximumPayloadBytes = 1024 * 1024; // 1 MB
});

// Optional Redis L2 — HybridCache uses whatever IDistributedCache is registered in DI;
// registration order relative to AddHybridCache doesn't matter.
builder.Services.AddStackExchangeRedisCache(options =>
    options.Configuration = builder.Configuration.GetConnectionString("Redis"));
```

### Usage

```csharp
public class ProductService(HybridCache cache, AppDbContext db)
{
    public async Task<Product?> GetByIdAsync(int id, CancellationToken ct)
        => await cache.GetOrCreateAsync(
            $"product:{id}",
            async token => await db.Products
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id, token),
            cancellationToken: ct);

    public async Task<IReadOnlyList<Product>> GetByCategoryAsync(
        string category, CancellationToken ct)
        => await cache.GetOrCreateAsync(
            $"products:category:{category}",
            async token => await db.Products
                .AsNoTracking()
                .Where(p => p.Category == category)
                .ToListAsync(token),
            options: new HybridCacheEntryOptions { Expiration = TimeSpan.FromMinutes(2) },
            cancellationToken: ct) ?? [];
}
```

### Gotchas

- **Instance reuse:** HybridCache deserializes a fresh object on **every hit** unless the cached type
  is `sealed` and marked `[System.ComponentModel.ImmutableObject(true)]` — only then does it hand out
  the same L1 instance. Records alone don't qualify.
- **Never cache tracked EF entities.** Query with `AsNoTracking()` and cache a DTO projection: an
  entity carries navigations (serialization cycles, over-fetching), and a cached tracked instance
  attached to a disposed `DbContext` breaks lazy loads and change tracking.
- The factory runs once per key across concurrent callers (stampede protection) but only
  **per process** — N instances can still issue N factory calls on a cold L2.

### Invalidation

```csharp
// Remove a single entry
await cache.RemoveAsync($"product:{id}", ct);

// Remove by tag (invalidate a group of related entries)
await cache.RemoveByTagAsync("products", ct);

// Register tags when setting
await cache.GetOrCreateAsync(
    $"product:{id}",
    async token => ...,
    tags: ["products", $"product-category:{product.Category}"],
    cancellationToken: ct);
```

### Typed Cache Keys (recommended)

Define key constants to avoid typos and enable tag-based invalidation:

```csharp
public static class CacheKeys
{
    public static string Product(int id) => $"product:{id}";
    public static string ProductsByCategory(string category) => $"products:category:{category}";
    public static string UserProfile(string userId) => $"user-profile:{userId}";

    // For multi-tenant apps — always scope to tenant
    public static string TenantProduct(string tenantId, int id) => $"tenant:{tenantId}:product:{id}";
}
```

