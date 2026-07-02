---
description: "Install and wire the DotnetPilot .NET-aware statusline."
argument-hint: "[--manual] — print the settings.json snippet instead of editing it"
---

# Statusline

`/DotnetPilot:utility:statusline` installs the DotnetPilot statusline and wires it into
`~/.claude/settings.json`. It renders a compact, .NET-aware status line:

- **Line 1 (always):** `<model> │ CTX <pct>% · <tokens> │ GIT <branch> ✚<dirty> ↑<ahead>↓<behind> │ ⏱ <elapsed> │ $<cost>`
- **Line 2 (only inside a .NET solution):** `SLN <name> │ TFM <framework> │ BUILD ✗ <n>x`

`BUILD ✗ Nx` appears only when a recent `dotnet build`/`dotnet test` failed — it reads the same
failure state `dnp-build-verify` writes, so it also reflects test failures. Absence means "no recent
failure recorded", not a guaranteed green build.

> **Why an install step?** Claude Code plugins cannot register a `statusLine`, and
> `${CLAUDE_PLUGIN_ROOT}` is not expanded inside statusLine command strings. So the script must live at
> a stable path (`~/.claude/dnp-statusline.js`) with `settings.json` pointing at it. This command
> performs that copy + wiring safely.

## Steps

1. **Copy the script.** Copy `${CLAUDE_PLUGIN_ROOT}/statusline/dnp-statusline.js` to
   `~/.claude/dnp-statusline.js` (create `~/.claude/` if absent). Overwrite any existing copy — the
   plugin's version is the source of truth.

2. **Read `~/.claude/settings.json`.** Parse it (treat missing/invalid as an empty object).

3. **Wire `statusLine`:**
   - **If no `statusLine` exists**, set it to:
     ```json
     { "type": "command", "command": "node \"<HOME>/.claude/dnp-statusline.js\"", "refreshInterval": 5 }
     ```
     where `<HOME>` is the absolute home directory (use an absolute path, not `~`, for shell safety on
     Windows). `refreshInterval` lets `BUILD ✗` / branch state refresh out-of-band.
   - **If a `statusLine` already exists** (e.g. another plugin's or a custom one), **do not overwrite
     silently.** Use `AskUserQuestion` to offer:
     - **Replace** — back up the current block to `~/.claude/dnp-statusline.prev.json`, then write the
       DotnetPilot `statusLine`.
     - **Keep existing** — abort wiring and print the manual snippet (see below) so the user can decide
       later.

4. **Confirm.** Print what changed, the backup path if one was written, and the revert instruction:
   restore `statusLine` from `~/.claude/dnp-statusline.prev.json` (or remove the key) and delete
   `~/.claude/dnp-statusline.js`.

## `--manual`

Skip all `settings.json` edits. Copy the script (step 1), then print this snippet for the user to paste
into `~/.claude/settings.json` themselves:

```json
"statusLine": {
  "type": "command",
  "command": "node \"<HOME>/.claude/dnp-statusline.js\"",
  "refreshInterval": 5
}
```

## Automatic activation (optional)

Instead of running this command, set `statusline.auto_enable: true` in `.planning/config.json`. The
`dnp-statusline-sync` SessionStart hook then keeps `~/.claude/dnp-statusline.js` current every session
and wires `settings.json` for you (backing up any prior `statusLine` once). It defaults to **off** so it
never clobbers an existing statusline without consent.

## Notes

- The statusline coexists with any other tooling — it only claims the single `statusLine` slot when you
  install it here or opt in via `auto_enable`. It never runs alongside a second statusline.
- Colors honor `NO_COLOR`. The `.NET` line is omitted outside a .NET solution; the universal line always renders.
