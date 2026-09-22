---
name: caching
description: HybridCache (.NET 9+), output caching, cache-aside pattern, and IMemoryCache — registration, usage, invalidation, and key strategy.
when_to_use: Adding or reviewing caching — HybridCache, output caching, cache-aside, IMemoryCache, key design, or invalidation.
---

# Caching Patterns

Reference for caching in .NET APIs. Covers HybridCache (L1+L2), output caching, cache-aside, and IMemoryCache.

## Caching Options at a Glance

| Option | Best For | Notes |
|--------|----------|-------|
| `HybridCache` | Application-level data (entities, computed results) | .NET 9+; L1 in-process + L2 distributed; stampede protection |
| `IOutputCache` | HTTP response caching (full responses) | Middleware-level; `[OutputCache]` attribute or `.CacheOutput()` |
| `IMemoryCache` | Single-node, simple key-value, no distributed requirement | No stampede protection; use `GetOrCreateAsync` |
| `IDistributedCache` | Distributed session, custom serialization | Low-level; HybridCache wraps it |

## References

Load only the file the task needs:

| File | Covers |
|------|--------|
| `references/hybridcache.md` | Package, registration, usage, invalidation, typed cache keys |
| `references/output-cache.md` | Output-cache registration, `[OutputCache]` / `.CacheOutput()` usage, invalidation |
| `references/cache-aside-and-keys.md` | Cache-aside pattern, `IMemoryCache` for single-node apps, multi-tenant key strategy |

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
