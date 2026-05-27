---
name: adr-003-ef-core
description: ADR-003 — EF Core as default ORM; no repository wrapping.
---

# ADR-003: EF Core as Default ORM

**Status:** Accepted

## Context

Teams often wrap EF Core in a generic `IRepository<T>` abstraction. This adds a leaky abstraction (EF Core is already a unit-of-work + repository), complicates testing (mocking EF Core behavior is brittle), and prevents use of EF Core's richer query APIs (Split queries, ExecuteUpdate, etc.).

## Decision

Use EF Core directly in application services. `DbContext` is the repository and unit-of-work. No `IRepository<T>` wrapper. Complex query objects (specifications, projections) may be extracted to dedicated query classes but still use `DbContext`.

## Consequences

- Integration tests use real databases via Testcontainers — no fake repository mocks
- `DbContext` is registered `AddDbContext<T>` scoped; injected directly into services
- EF Core query operators (`Include`, `ExecuteUpdateAsync`, `AsSplitQuery`) are used freely
- Schema changes require EF Core migrations — never manual SQL

## Exceptions

Dapper is acceptable for reporting queries that are inherently complex SQL and do not benefit from EF Core's change tracking.

## See Also
- `skills/ef-core-patterns/SKILL.md` — query and migration patterns
