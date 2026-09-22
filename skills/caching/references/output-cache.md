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

