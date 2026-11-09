# 3. Hook tracing and ordering: `hook-trace`

## Goal

Answer three questions without `claude --debug`:

1. Which hooks ran for this event, and how long did each take?
2. What did they decide (block, allow, deny) and what text did they inject?
3. Why did one not run? For example, the `prompt.compose skipped` / "bypassed by
   cc-plugin-sec-default" case.

Scope tension: generic tooling (see [README](README.md#scope-tension)). Part B (self-trace of
DotnetPilot's own Node hooks) is .NET-plugin maintenance and fits the scope. Part A ships behind
`hook_trace`, default **off**.

## Prior art (checked 2026-11-09)

[disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
logs hook events but does not time individual hooks or show what they inject. No other tool found
does either, so this is the one proposal with no existing replacement.

An external mod, offered but not yet reviewed here, reports per-hook injected text. In one smoke
run it showed a single SessionStart hook injecting about 13k tokens. Before writing Part A, find
out how it attributes text to **one hook**. If that works, it contradicts the per-event limit
below, and Part B may be unnecessary.

## What Claude Code gives (and does not)

- Matching settings hooks for one event **run in parallel**. Identical handlers from several
  settings files run once; plugin copies stay separate. No priority or ordering control is
  documented for plugin hooks.
- In a mod, a classic event's chain is **[managed settings hooks, ...hooks modules, the other
  settings hooks as core]**. `await next(e)` from a module therefore spans everything beneath it,
  and it resolves to the **folded** `ClassicResult`: `block`, `preventContinuation`,
  `additionalContext[]`, `permissionDecision`, ... ("last write wins, contexts concatenate").
- Telemetry exists (`hook_execution_start` / `hook_execution_complete` with `num_success`,
  `num_blocking`, `num_non_blocking_error`, `num_cancelled`, `total_duration_ms`, and
  `hook_plugin_metrics`) but only with OTel export enabled.
- The "bypassed by <plugin> (tier <n>); beneath runs" line goes to the debug log only.

So a mod can measure **per event**, not per individual settings hook. Per-hook timing needs the
hook itself to report it, which is Part B.

## Part A: the timing mod (`hooks/mods/hook-trace.tsx`)

For each event in `TRACED = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit',
'SessionStart', 'Stop', 'SubagentStop', 'PreCompact', 'PostCompact', 'Notification']`:

```ts
on(`classic.${name}`, async ($, e, next) => {
  const t0 = await $.clock.now()
  const result = await next(e)
  record($, { event: name, tool: toolOf(e), ms: (await $.clock.now()) - t0, outcome: outcomeOf(result), contexts: result.additionalContext?.length ?? 0, contextChars: sum(result.additionalContext) })
  return result
})
```

- Pass `result` through unchanged. The mod never alters a decision.
- `toolOf(e)`: for `classic.PreToolUse`, `e` is a `ToolCallEnvelope` (the one shape that differs).
  For the others, read `tool_name` from the stdin input.
- `outcomeOf`: `block` / `deny` / `ask` / `allow` / `stop` / `pass`.
- Group a `PostToolBatch` round under one row when present.
- Also hook `session.append` with `door: 'hook-context'` (pass-through) to count injected text by
  `origin.event`. This catches context injected outside the classic chain result.

State (`types/index.d.ts`):

```ts
export type HookTraceRow = {
  event: string
  tool?: string
  ms: number
  outcome: 'block' | 'deny' | 'ask' | 'allow' | 'stop' | 'pass'
  contexts: number
  contextChars: number
  atMs: number
}

export type HookTrace = { rows: HookTraceRow[] }   // ring buffer, cap 1000
```

UI:

- `/dnp-hooks` prints a table per event: count, p50/p95/max ms, blocks, total context chars, and
  the five slowest rows with their tool.
- Optional pane `dnp-hooks` with the same table and a live tail.
- `$.ui.status` only while a single event's chain exceeds `hook_trace_slow_ms` (default 2000).
  Otherwise silent.

## Part B: self-trace of DotnetPilot's Node hooks (`hooks/_lib/trace.js`)

A small wrapper every `hooks/dnp-*.js` entry calls:

```js
const { traced } = require('./_lib/trace');
traced('dnp-build-verify', async input => { /* existing body */ });
```

- It records `{hook, event, tool, ms, exit, contextChars, atMs}` as one JSONL line in
  `${CLAUDE_PLUGIN_DATA}/hook-trace.jsonl`. Fall back to `os.tmpdir()/dnp-hook-trace.jsonl` when
  the env var is unset. Rotate at 1 MB, keeping one `.1`.
- It is gated by `hookFlag(cwd, 'trace')` (opt-in, `.planning/config.json` `hooks.trace: true`).
  When off, it calls the body directly and does nothing else.
- It never changes stdout, the exit code or timing beyond one `appendFileSync`. A trace write
  failure is swallowed, since hooks are advisory.
- `/dnp-hooks` (Part A) merges these lines in when present. A mod can't read Node env vars, so the
  file path comes from `$.fs` under the plugin data dir. **UNCONFIRMED**: whether `$.fs` reaches
  `CLAUDE_PLUGIN_DATA`. If not, Part B stays a file the user `tail`s, and `/dnp-hooks` says where
  it is.

## Ordering

No ordering API is documented for plugin hooks, so the spec doesn't fake one. What we can do:

- Order inside DotnetPilot: hooks.json entries for one matcher run in parallel, so any dependency
  between two DotnetPilot hooks has to live inside one script. `stop-verify` and `post-edit-format`
  on `Stop` are the case to check for a hidden order assumption.
- Explain the cross-plugin skips: add a "Coexisting plugins" note to the README's mods section
  (`docs/HOST-PLUGINS.md` covers Codex/Cursor packaging, not this) saying a higher-tier plugin's
  `prompt.compose` can bypass ours. The debug log line is the proof (`claude --debug`, search for
  `bypassed by`). `/dnp-hooks` adds a hint when the routing section is missing from the last
  compose. Confirmed: with cc-plugin-sec-default seated, our `prompt.compose` does not fire
  ([04-mcp-health.md](04-mcp-health.md#verified)), and the session receives a task notification
  saying so ("dotnet-pilot: its prompt.compose hook was skipped. "cc-plugin-sec-default" runs first
  and sent the event on past it.", 2026-11-09). **UNCONFIRMED**: whether the mod itself can see
  the skip (an event or a `$` call), not just the model.

## Wiring

- `plugin.json` userConfig: `hook_trace` (boolean, default off), `hook_trace_slow_ms` (string,
  parsed as int, default `"2000"`).
- `register.ts`: `if (options.hook_trace === true) registerHookTrace(on, slowMs(options))`.
- `hooks/_lib/trace.js` plus one-line adoption in each `hooks/dnp-*.js`. `check-consistency.js`
  gains a rule that every hook entry script calls `traced(`.

## Tests

- `hook-trace.test.ts`: a seeded `next` that resolves `{ block: 'x' }` gives `outcome: 'block'`.
  The result passes through identical (same reference or deep-equal). The ring buffer caps. The
  `/dnp-hooks` table output is right for a known row set.
- `hooks/__tests__/run.js`: with `hooks.trace: true` a hook writes exactly one JSONL line, and its
  stdout and exit code are unchanged. With the flag off, no file is created.

## Acceptance

- With the mod on, a `PostToolUse` after `dotnet build` shows one row whose `ms` covers
  `dnp-build-verify`'s run. With Part B on, the per-hook line for `dnp-build-verify` matches it
  within a few ms.
- Turning `hook_trace` off leaves the event chain exactly as before.

## UNCONFIRMED

- Whether **plugin** `hooks.json` command hooks sit in the "other settings hooks as core" part of
  the chain (so beneath the module) or elsewhere. Check: add a temporary `PostToolUse` command hook
  that sleeps 500 ms and confirm the mod's `ms` grows by about 500.
- How conflicting `decision` values from parallel hooks resolve beyond "last write wins". Treat the
  folded result as the outcome and don't attribute it.
- Per-hook OTel spans (`claude_code.hook`): the docs give two different env-var sets for beta
  tracing. Test both before documenting either.
