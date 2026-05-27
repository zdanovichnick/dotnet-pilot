---
name: adr-001-vsa-default
description: ADR-001 — Vertical Slice Architecture as recommended default for new .NET APIs.
---

# ADR-001: Vertical Slice Architecture as Default

**Status:** Accepted

## Context

New .NET API projects require an architecture recommendation. Clean Architecture (4-layer) is well-known but adds ceremony for simple CRUD APIs. Vertical Slice Architecture (VSA) organizes code by feature rather than layer, reducing cross-cutting indirection for typical web APIs.

## Decision

Recommend VSA as the default for new .NET APIs. Clean Architecture is recommended when:
- Domain logic is complex enough to warrant a rich domain model
- Multiple bounded contexts exist with shared kernel
- Team has strong DDD experience

## Consequences

- Features are self-contained: `Features/Orders/CreateOrder/` contains handler, validator, DTO, endpoint
- Less ceremony for CRUD features — no Application/Domain/Infrastructure boilerplate for simple flows
- Agents use `IEndpointGroup` + feature folder structure by default
- `/scaffold` command generates VSA structure unless `--arch clean` or `--arch ddd` is specified

## See Also
- `adr-005-multi-architecture.md` — full architecture comparison
- `skills/vertical-slice/SKILL.md` — implementation guidance
