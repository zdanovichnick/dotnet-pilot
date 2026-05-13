---
description: "Verify readiness before shipping — build, tests, DI completeness, and architecture check."
---

# Verify

`/DotnetPilot:pipeline:verify` is the "ready to ship?" gate between active development
and `/DotnetPilot:pipeline:ship`. Run it when you think the feature is done.

> **Delegates to**: `dnp-di-wiring-checker` (Haiku 4.5) and `dnp-architect` (Opus 4.7).

## Difference from `quality:pre-commit`

`quality:pre-commit` is file-level and runs before every commit (format check included).
`pipeline:verify` is feature-level: it skips the format check, adds an architecture deep-scan
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

Ready to ship. Run /DotnetPilot:pipeline:ship.
```

If any check fails, stop and list what needs fixing before `/pipeline:ship` is called.
