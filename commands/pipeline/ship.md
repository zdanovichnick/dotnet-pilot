---
description: "Create a pull request for completed work — runs final checks and invokes gh pr create."
argument-hint: "[--draft to create a draft PR]"
---

# Ship

`/DotnetPilot:pipeline:ship` creates a pull request for the current branch.

> **Delegates to** (optional pre-flight): `dnp-di-wiring-checker` (Haiku 4.5) and `dnp-architect` (Opus 4.6). The `gh pr create` call runs in the caller's context.

## Execution

### Step 1: Pre-flight checks

1. `dotnet build --no-restore` must succeed.
2. `dotnet test --no-build` must pass.
3. Optional: spawn `dnp-di-wiring-checker` for a final DI-completeness report.
4. Optional: spawn `dnp-architect` for a final architecture-violation scan.
5. Check for uncommitted changes: `git status --porcelain`. If any, warn and ask before continuing.

### Step 2: Check branch state

1. Determine the base branch (default `main` or `master`) and the current branch.
2. Check commits ahead of base: `git log --oneline <base>..HEAD`.
3. If zero commits ahead, abort — nothing to ship.
4. Push the branch if its remote is not up to date: `git push -u origin <branch>`.

### Step 3: Generate PR body

Scan the commits since the base branch and build a summary:

```markdown
## Summary
<1-3 bullet points synthesized from commit subjects and changed files>

## .NET Checks
- [x] Solution builds cleanly
- [x] All tests pass
- [x] DI registrations complete (per `dnp-di-wiring-checker`)
- [x] No architecture layer violations (per `dnp-architect`)
- [x] EF migration chain valid (if migrations touched)

## Test plan
- [ ] <suggested manual verification steps based on which projects changed>
```

### Step 4: Create PR

```bash
gh pr create --title "<conventional commit-style title from the lead commit>" \
  --body-file <(cat <<'EOF'
<generated body>
EOF
) --base <base-branch>
```

Pass `--draft` if that flag was provided.

### Step 5: Report

Print the PR URL returned by `gh pr create`.

## Notes

- Requires the GitHub CLI (`gh`) to be installed and authenticated.
- `VERIFICATION.md` / `SUMMARY.md` dependencies from the old spec-driven pipeline were removed in v1.0.0 — this command no longer requires `.planning/` state.
