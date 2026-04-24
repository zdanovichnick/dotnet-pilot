---
description: "Show current pipeline state — phase, progress, recent activity."
---

# Pipeline Status

`/DotnetPilot:pipeline:status` displays the current state of the DotnetPilot pipeline.

## Execution

1. Check if `.planning/` exists. If not: "DotnetPilot not initialized. Run `/DotnetPilot:pipeline:init`."

2. Read `.planning/STATE.md` frontmatter and body.

3. Read `.planning/ROADMAP.md` to get phase list and progress.

4. For each phase, check which artifacts exist:
   - CONTEXT.md (discussed)
   - RESEARCH.md (researched)
   - PLAN.md (planned)
   - SUMMARY.md (executed)
   - VERIFICATION.md (verified)

5. Display:

```
DotnetPilot Status
══════════════════
Solution: MyApp.slnx (net10.0, clean architecture)
Pipeline: Phase 2 of 5

Phase Progress:
  [1] Foundation        ████████████ VERIFIED
  [2] Authentication    ████████░░░░ EXECUTING (plan 2 of 3)
  [3] API Endpoints     ░░░░░░░░░░░░ PLANNED
  [4] Background Jobs   ░░░░░░░░░░░░ NOT STARTED
  [5] Deployment        ░░░░░░░░░░░░ NOT STARTED

Last Activity: 2026-04-20 — Executed plan 02-01 (JWT setup)
```

6. Show any pending items from STATE.md body.
