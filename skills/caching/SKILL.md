---
name: caching
description: HybridCache (.NET 9+), output caching, cache-aside pattern, and IMemoryCache — registration, usage, invalidation, and key strategy.
---

# Caching Patterns

Reference for caching in .NET APIs. Covers HybridCache (L1+L2), output caching, cache-aside, and IMemoryCache. Used by `dnp-planner` and `dnp-tdd-developer-hard`.

## Caching Options at a Glance

| Option | Best For | Notes |
|--------|----------|-------|
| `HybridCache` | Application-level data (entities, computed results) | .NET 9+; L1 in-process + L2 distributed; stampede protection |
| `IOutputCache` | HTTP response caching (full responses) | Middleware-level; `[OutputCache]` attribute or `.CacheOutput()` |
| `IMemoryCache` | Single-node, simple key-value, no distributed requirement | No stampede protection; use `GetOrCreateAsync` |
| `IDistributedCache` | Distributed session, custom serialization | Low-level; HybridCache wraps it |

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

// Optional Redis L2 — add BEFORE AddHybridCache so it's picked up automatically
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

## Output Cache (HTTP Response Caching)

Caches full HTTP responses at the middleware level. Useful for read-heavy endpoints that return the same response for the same parameters.

### Registration

```csharp
builder.Services.AddOutputCache(options =>
{
    // Named policy
    options.AddPolicy("products", b => b.Expire(TimeSpan.FromMinutes(5)));
    // Vary by query string parameter
    options.AddPolicy("search", b => b
        .Expire(TimeSpan.FromMinutes(1))
        .SetVaryByQuery("q", "page", "pageSize"));
});

// In pipeline — after UseRouting, before UseAuthorization
app.UseOutputCache();
```

### Usage

```csharp
// Minimal API
app.MapGet("/products", GetProducts)
   .CacheOutput("products");

app.MapGet("/products/search", SearchProducts)
   .CacheOutput("search");

// Controller action
[OutputCache(PolicyName = "products")]
[HttpGet]
public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await svc.GetAllAsync(ct));

// Quick inline duration (no named policy)
app.MapGet("/config/features", GetFeatureFlags)
   .CacheOutput(b => b.Expire(TimeSpan.FromHours(1)));
```

### Invalidation

```csharp
// Inject IOutputCacheStore for programmatic invalidation
public class ProductsController(IOutputCacheStore outputCache) : ControllerBase
{
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, UpdateProductRequest req, CancellationToken ct)
    {
        await svc.UpdateAsync(id, req, ct);
        await outputCache.EvictByTagAsync("products", ct);
        return NoContent();
    }
}
```

Tag endpoints for eviction:

```csharp
app.MapGet("/products", GetProducts)
   .CacheOutput(b => b.Expire(TimeSpan.FromMinutes(5)).Tag("products"));
```

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

## Do / Don't

| Do | Don't |
|----|-------|
| Use `HybridCache` as the default for application data | Use `IMemoryCache` in a multi-node deployment for shared data |
| Always set an expiration | Cache indefinitely (memory leak, stale data) |
| Use typed key factory to avoid magic strings | Scatter `$"product:{id}"` literals across the codebase |
| Use records or `[Serializable]` value objects as cache values | Cache mutable objects (mutations won't propagate) |
| Scope keys by tenant ID in multi-tenant apps | Share cache entries across tenants |
| Log cache misses at `Debug` level | Log every cache hit (too noisy) |
| Invalidate on write (cache-aside write-through) | Let stale data live beyond TTL without a manual eviction path |
| Use tags for group invalidation | Enumerate and delete keys by prefix (fragile, slow) |

## See Also
- `skills/resilience/SKILL.md` — pair HybridCache with circuit breakers when the backing store is unreliable
- `knowledge/decisions/adr-004-hybridcache.md` — project-level ADR for HybridCache adoption
