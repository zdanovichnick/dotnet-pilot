---
description: "Verify readiness before shipping — build, tests, DI completeness, and architecture check."
effort: high
---

# Verify

`/dotnet-pilot:project:verify` is the "ready to ship?" gate between active development
and `/dotnet-pilot:project:ship`. Run it when you think the feature is done.

> **Delegates to**: `dnp-di-wiring-checker` (sonnet, effort low) and `dnp-architect` (opus, effort xhigh).

## Difference from `quality:commit-check`

`quality:commit-check` is file-level and runs before every commit (format check included).
`project:verify` is feature-level: it skips the format check, adds an architecture deep-scan
via `dnp-architect`, and reports a clear go/no-go for shipping.

## Execution

### 1. Build
```bash
dotnet build --no-restore
```
On failure: report errors, STOP.

### 2. Tests
```bash
dotnet test --no-build
```
On failure: report failures, STOP.

### 3. DI completeness
Spawn `dnp-di-wiring-checker`. Report any missing registrations as FAIL (blocking).

### 4. Architecture check
Spawn `dnp-architect` for a full layer-violation scan. Report violations as FAIL (blocking).

### 5. EF migration chain (if applicable)
If any `Migrations/` directories exist, validate that the migration chain is intact
(no gaps, no manually edited migration files).

## Report

```
Verification Results
  [PASS] Build: 0 errors
  [PASS] Tests: 47 passed
  [PASS] DI Wiring: 12 services, 0 missing
  [PASS] Architecture: no violations
  [PASS] EF Migrations: chain valid

Ready to ship. Run /dotnet-pilot:project:ship.
```

If any check fails, stop and list what needs fixing before `/project:ship` is called.
