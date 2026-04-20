# Hook test harness

Run from the plugin root:

```bash
node hooks/__tests__/run.js
```

Every hook in `hooks/*.js` and `hooks/*.sh` has at least one case. Each case pipes a
fixture JSON payload (matching Claude Code's PreToolUse/PostToolUse event shape) into
the target hook and asserts:

1. Exit code is 0 (DotnetPilot hooks are advisory-only — they never block).
2. Stdout is either empty or valid JSON matching the `hookSpecificOutput` schema.
3. When the hook should speak, the expected labeled prefix (`[dnp-<name>]`) and message
   fragments appear in `additionalContext`.

Add new cases by appending to the `CASES` array in `run.js`.

## When to run

- Before publishing a new plugin version.
- After editing any hook script.
- As part of CI (see `.github/workflows/hooks.yml` if present).
