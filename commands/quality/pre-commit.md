---
description: "Pre-commit quality gate — build, test, format check, DI verification, and architecture audit."
---

# Pre-Commit

`/DotnetPilot:quality:pre-commit` runs all quality checks before committing.

> **Delegates to**: `dnp-di-wiring-checker` (Haiku 4.5); optionally the stock `code-reviewer` agent on large changesets.

## Execution

Run these checks in sequence (fail-fast):

### 1. Build
```bash
dotnet build --no-restore
```
If build fails: report errors, STOP.

### 2. Tests
```bash
dotnet test --no-build
```
If tests fail: report failures, STOP.

### 3. Format Check
```bash
dotnet format --verify-no-changes --verbosity diagnostic
```
If formatting issues: report files, suggest `dotnet format` to fix.

### 4. DI Verification
Spawn `dnp-di-wiring-checker` to verify all services are registered.
If missing registrations: report, WARN (non-blocking).

### 5. Architecture Check
Quick layer violation scan:
- Parse project references from `.csproj` files
- Check for forbidden layer dependencies
If violations: report, WARN (non-blocking).

### 6. Code Review (optional)
If changes touch >5 files, run `/DotnetPilot:quality:review --depth quick` (which
delegates to the stock `code-reviewer` agent with .NET focus).

## Report

```
Pre-Commit Results
  [PASS] Build: 0 errors
  [PASS] Tests: 24 passed
  [WARN] Format: 2 files need formatting
  [PASS] DI Wiring: all services registered
  [PASS] Architecture: no violations

Ready to commit. Run `dotnet format` to fix formatting issues.
```
