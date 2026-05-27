---
name: adr-004-hybridcache
description: ADR-004 — HybridCache as default caching strategy for .NET 9+ projects.
---

# ADR-004: HybridCache as Default Caching Strategy

**Status:** Accepted (.NET 9+ projects only)

## Context

`IMemoryCache` is single-node only. `IDistributedCache` requires manual serialization and has no stampede protection. `HybridCache` (introduced in .NET 9) combines L1 (in-memory) and L2 (distributed) with built-in stampede protection and serialization.

## Decision

Use `HybridCache` for application-level caching in .NET 9+ projects. For .NET 8 projects, use `IMemoryCache` + `IDistributedCache` with manual stampede protection via `SemaphoreSlim`.

## Consequences

- Register: `builder.Services.AddHybridCache()`
- Optionally add Redis as L2: `builder.Services.AddStackExchangeRedisCache(...)`
- Use: `await cache.GetOrCreateAsync(key, factory, cancellationToken: ct)`
- Cache keys are strings; use typed key constants to prevent collision
- HybridCache serializes via `System.Text.Json` by default

## See Also
- `skills/caching/SKILL.md` — full caching patterns
- `knowledge/package-recommendations.md` — package versions
