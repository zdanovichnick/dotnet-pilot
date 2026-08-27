---
description: "Run a full .NET security audit — OWASP, secrets, auth, and dependency vulnerabilities."
argument-hint: "[--scope ProjectName]"
effort: high
---

# Security Scan

`/dotnet-pilot:quality:security-scan` runs a three-phase security audit for the current .NET solution.

> **Delegates to**: `dnp-security-auditor` (sonnet, effort high); Phase 1 built-in scan runs in the caller's context.

## Phase 1 — Dependency Vulnerabilities (built-in)

```bash
dotnet list package --vulnerable
```

Surface any packages with known CVEs. Treat as CRITICAL if NuGet advisory severity is High or Critical.

## Phase 2 — Static Security Audit

Delegate to `dnp-security-auditor` with:
- Solution structure from `mcp__roslyn__get_solution_structure`
- Scope restriction if `--scope ProjectName` was provided
- Instruction to audit all 6 domains: injection, auth/authz, secrets, CORS, dependencies, input validation

## Phase 3 — Report

Combine Phase 1 and Phase 2 findings. Surface CRITICAL and HIGH items first with remediation steps.

```
Security Scan Results — [solution name] — [date]

CRITICAL (must fix before ship)
  [INJ-001] SQL injection risk at OrderRepository.cs:47
  ...

HIGH (fix in current sprint)
  [AUTH-001] Endpoint POST /admin/users has no authorization requirement
  ...

MEDIUM / LOW (schedule for backlog)
  ...

Dependency Vulnerabilities
  ❌ Package X 1.2.3 — CVE-2023-44487 (High) — fix: upgrade to 1.2.9
  ✅ No other vulnerable packages found

Domains audited: Injection, Auth/AuthZ, Secrets, CORS, Dependencies, Input Validation
```

## Related

- `/dotnet-pilot:quality:check-packages` — NuGet version audit without the full security scan
- `/dotnet-pilot:quality:check-architecture` — architecture compliance (separate concern)
- `/dotnet-pilot:dotnet:health-check` — full solution health including build and DI
