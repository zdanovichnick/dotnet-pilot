---
name: adr-005-multi-architecture
description: ADR-005 — Supporting multiple architecture styles (VSA, Clean Architecture, DDD, Modular Monolith).
---

# ADR-005: Multi-Architecture Support

**Status:** Accepted

## Context

No single architecture fits all projects. dotnet-pilot must support teams using different styles without prescribing one globally.

## Decision

Support four architecture styles with dedicated scaffolding and skills:

| Style | When to use | Skill |
|-------|------------|-------|
| **Vertical Slice (VSA)** | Default for new APIs, CRUD-heavy, small-medium team | `vertical-slice` |
| **Clean Architecture** | Complex domain, multiple aggregates, DDD-adjacent | `clean-architecture` |
| **DDD** | Rich domain model, bounded contexts, event sourcing | `ddd` |
| **Modular Monolith** | Multiple bounded contexts, not ready for microservices | (modular-monolith template) |

## Architecture Detection

Agents detect current architecture via `mcp__roslyn__get_solution_structure`:
- Projects suffixed `.Domain`, `.Application`, `.Infrastructure` → Clean Architecture / DDD
- `Features/` folder structure with `IEndpointGroup` → VSA
- Separate module projects with internal boundaries → Modular Monolith

## Consequences

- `/scaffold` detects and matches existing architecture automatically
- Skills are architecture-aware — VSA skill generates feature folders, Clean Architecture skill generates layered files
- Teams can migrate gradually — detection is per-project, not per-solution

## See Also
- `adr-001-vsa-default.md` — VSA as default recommendation
- `skills/vertical-slice/SKILL.md`, `skills/clean-architecture/SKILL.md`, `skills/ddd/SKILL.md`
