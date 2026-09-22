# Hook test harness

Run from the plugin root:

```bash
node hooks/__tests__/run.js                # hook harness
node hooks/__tests__/check-consistency.js  # versions, frontmatter, README tables, references
```

`run.js` spawns every hook in `hooks/*.js` (and the statusline script) as a child process,
pipes a fixture JSON payload into stdin shaped like the real Claude Code event, and asserts
on the exit code, the output channel the hook is supposed to use, and any files it wrote.
Hooks are advisory, so the exit code is always expected to be 0.

## How a run works

```mermaid
flowchart TD
    subgraph setup["1 · Setup: temp fixtures under os.tmpdir()"]
        direction LR
        ws["workspace<br/>Demo.slnx · FooService.cs, partial and record classes<br/>Migrations/ file · Extensions with no registration"]
        plain["nonDotnetDir<br/>no .sln or .csproj"]
        scope["scopeWorkspace<br/>.planning/STATE.md focus_projects<br/>solution-map.json with a projects array"]
        build["buildDir<br/>one state file, asserted as it accumulates"]
        stop["stop dirs, each git init<br/>dirty · block (stop_verify_block) · green · clean (committed)"]
        homes["throwaway HOMEs<br/>fakeHome · slHomeDefault · slHomeAuto"]
        sl["slnFailDir · slnGreenDir<br/>pre-seeded build-state files"]
    end

    subgraph loop["2 · Run loop: every CASE, in array order"]
        pick["case = hook · input · env · expect*"]
        spawn["spawnSync node hooks/dnp-*.js<br/>stdin = JSON.stringify(input)<br/>env = process.env + case.env · 15 s timeout"]
        exitc["exit code == expectExit (always 0: hooks are advisory)"]
    end

    subgraph channel["3 · Primary channel (exactly one per case)"]
        direction LR
        empty["expectEmpty<br/>stdout is empty"]
        ctx["expectSubstrings<br/>hookSpecificOutput.additionalContext<br/>+ expectHookEvent"]
        perm["expectPermission<br/>hookSpecificOutput.permissionDecision"]
        dec["expectDecision<br/>top-level decision, substrings in reason"]
        sysm["expectSystemMessage<br/>systemMessage"]
        raw["expectStdout<br/>raw text, statusline only"]
    end

    subgraph side["4 · Independent checks"]
        direction LR
        absent["expectStdoutAbsent"]
        files["expectFiles<br/>path exists and includes fragments"]
        nofiles["expectFilesAbsent"]
    end

    subgraph state["Shared tmpdir state: paths mirror the hooks byte for byte"]
        direction LR
        bs["dnp-build-fail-sha1(cwd).json"]
        em["dnp-cs-edit-sha1(cwd).json"]
        sa["dnp-scope-advised-sha1(cwd + project)"]
    end

    verdict{"problems.length == 0?"}
    pass["PASS"]
    fail["FAIL: print problems and stderr"]
    next["next case"]

    setup --> pick --> spawn --> exitc --> channel --> side --> verdict
    spawn -. "hooks read and write" .-> state
    files -. "asserts on" .-> state
    verdict -->|yes| pass --> next
    verdict -->|no| fail --> next
    next --> pick
    next -->|"after the last case"| cleanup["5 · Cleanup<br/>unlink state files · rm temp dirs"]
    cleanup --> exit["exit 0 if all passed, else 1"]
```

Every mismatch is appended to the case's `problems` list, so one case can report an exit
code problem, a missing substring, and a missing file together.

## What each hook is fed, and where it must speak

The fixture is the contract: a payload keyed the way the real event is keyed. `PostToolUse`
carries `tool_response` and no exit code; a non-zero exit only reaches a hook as the
`PostToolUseFailure` string `error`. A hook that reads the wrong key passes silently in
production and fails here.

```mermaid
flowchart LR
    subgraph events["Fixture shape = the real event"]
        pre["PreToolUse<br/>cwd · tool_name · tool_input"]
        post["PostToolUse<br/>tool_input · tool_response (stdout, stderr, no exit code)"]
        postf["PostToolUseFailure<br/>error string: Error: Exit code N + output"]
        stopE["Stop<br/>stop_hook_active"]
        sub["SubagentStop<br/>agent_type · last_assistant_message"]
        sess["SessionStart"]
        slin["statusline stdin<br/>model · effort · context_window · cost"]
    end

    subgraph hooks["Hook under test"]
        h_sync["dnp-sync-global-claude-md"]
        h_prio["dnp-dotnet-priority"]
        h_redir["dnp-code-analyzer-redirect"]
        h_mig["dnp-migration-guard"]
        h_git["dnp-git-autoapprove"]
        h_commit["dnp-commit-format"]
        h_di["dnp-di-registration-check"]
        h_scope["dnp-project-scope-guard"]
        h_fmt["dnp-post-edit-format"]
        h_build["dnp-build-verify"]
        h_stop["dnp-stop-verify"]
        h_sub["dnp-subagent-result"]
        h_slsync["dnp-statusline-sync"]
        h_sl["statusline/dnp-statusline.js"]
    end

    subgraph out["Channel the harness asserts on"]
        o_ctx["hookSpecificOutput.additionalContext"]
        o_perm["hookSpecificOutput.permissionDecision"]
        o_dec["top-level decision: block"]
        o_sys["systemMessage"]
        o_files["files on disk"]
        o_raw["raw stdout"]
        o_silent["silence only (skip paths)"]
    end

    pre --> h_sync & h_prio & h_redir & h_mig & h_git & h_commit
    post --> h_di & h_scope & h_fmt & h_build & h_stop
    postf --> h_build
    stopE --> h_stop
    sub --> h_sub
    sess --> h_slsync
    slin --> h_sl

    h_prio & h_redir & h_mig & h_commit & h_di & h_scope --> o_ctx
    h_git --> o_perm
    h_build --> o_ctx & o_files
    h_stop --> o_ctx & o_dec & o_files
    h_sub --> o_sys
    h_sync & h_slsync --> o_files
    h_sl --> o_raw
    h_fmt --> o_silent
```

## Adding a case

- Append to the `CASES` array in `run.js`. Pick exactly one primary `expect*` channel;
  `expectStdoutAbsent`, `expectFiles` and `expectFilesAbsent` stack on top of it.
- Reuse a fixture directory when one fits. A new `mkdtempSync` directory must also be added
  to the cleanup list at the bottom of the file, or it leaks into `os.tmpdir()`.
- A hook that writes under `HOME` gets `env: { HOME, USERPROFILE }` pointing at a throwaway
  directory. Never let a case touch the developer's real `~/.claude`.
- Cases run in array order. `dnp-build-verify` cases share one state file and assert the
  consecutive-failure count as it grows; `dnp-stop-verify` stamps its edit marker on a
  `PostToolUse` case and reads it on the following `Stop` case. Insert between them only
  if the count sequence still holds.
- The `buildStatePath`, `editMarkerPath` and `scopeAdvisedPath` helpers must stay identical
  to the hooks' own path functions, or the fixture seeds one file and the hook reads another.

## When to run

- After editing any hook, command, agent, or the statusline script.
- Before bumping the plugin version.
- CI runs both scripts on Ubuntu and Windows (`.github/workflows/hooks.yml`), then validates
  agents, commands and skills with `claude plugin validate --strict`.
