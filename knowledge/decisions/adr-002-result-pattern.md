---
name: adr-002-result-pattern
description: ADR-002 — Result<TValue, TError> over exceptions for expected domain/application failures.
---

# ADR-002: Result Pattern Over Exceptions

**Status:** Accepted

## Context

Exceptions are expensive and represent unexpected control flow. Domain rules ("order cannot be cancelled after shipping") are expected failures, not unexpected errors. Using exceptions for expected failures leads to try-catch sprawl and implicit control flow.

## Decision

Use `Result<TValue, TError>` for expected failures in domain and application layer. Reserve exceptions for:
- Infrastructure failures (DB down, network timeout) — let them propagate to the global handler
- Programming errors (ArgumentNullException, InvalidOperationException) — these should not be caught

## Consequences

- `ProblemDetails` (RFC 7807) maps `Result.Failure` to HTTP error responses at the controller/endpoint level
- Domain layer has no dependency on `Microsoft.AspNetCore` — errors are plain C# records
- Callers use `result.Match(onSuccess, onFailure)` — exhaustive handling enforced by compiler
- Global `IExceptionHandler` handles true exceptions; application errors are handled explicitly

## See Also
- `knowledge/common-infrastructure.md` — Result<TValue, TError> implementation
- `skills/error-handling/SKILL.md` — full error handling patterns
