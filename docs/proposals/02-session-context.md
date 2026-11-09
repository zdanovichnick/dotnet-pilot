# 2. Session and context visibility: `context` mod

> **Dropped 2026-11-09.** This is generic Claude Code tooling (see the
> [scope tension](README.md#scope-tension)), and existing tools cover it:
> [weiesky/cc-viewer](https://github.com/weiesky/cc-viewer) records every API request, so it shows
> exactly what was loaded, and
> [Charlie0113-T/claude-agent-flow](https://github.com/Charlie0113-T/claude-agent-flow) is a mod
> with a live subagent tree. Since 2.1.277, `/context all` no longer lists instruction files one by
> one ([anthropics/claude-code#95443](https://github.com/anthropics/claude-code/issues/95443), open).
> The spec below is kept as a record and is not scheduled.

## Goal

One place to see what is in the context window and where it came from: memory files, skills, MCP
tools, agents, hook-injected text and compaction. Today `/context` shows a snapshot with no
history and no provenance. It forgets what was there before a compaction, and it can't say which
hook added a block.

Scope tension: this is generic Claude Code tooling (see [README](README.md#scope-tension)). It
ships behind `context_view`, default **off**.

## Shape

A mod in `hooks/mods/context-view.tsx` with:

- a pane (`$.ui.open({ id: 'dnp-context', title: 'Context' })`, drawn by a `ui.render` hook on
  `{ component: 'Pane', requestId: 'dnp-context' }`),
- a `/dnp-context` command (`$.command.register` from the shared `session-start.ts` dispatcher,
  answered by `command.run` matched `{ command: 'dnp-context' }`) that opens the pane, or prints a
  text summary where no surface places one (`isPlaced: false`),
- no `prompt.compose` and no model-facing text. It only observes.

## Data sources (verified in the 2.1.309 types)

| Need | Source |
|------|--------|
| Breakdown by category, memory files, skills, MCP tools, agents, with token counts | `$.session.usage({ breakdown: 'summary' })` → `context.breakdown`: `categories[]`, `memoryFiles[{path,type,tokens}]`, `mcpTools[{name,serverName,tokens,isLoaded}]`, `agents[{agentType,source,tokens}]`, `skills{totalSkills,includedSkills,tokens,skillFrontmatter[]}`, `autoCompactThreshold`, `isAutoCompactEnabled`. `summary` estimates locally and makes no API call. |
| Exact counts on demand | `breakdown: 'full'` sends one token-count request per tool and memory file, as `/context` does. Use it only from a "Recount" button, never on a timer. |
| Window and session totals | `usage().context` (status line `context_window` figures), `startedAt`, `cost`, `rateLimits` |
| Why a memory file loaded | `classic.InstructionsLoaded`: `file_path`, `memory_type`, `load_reason` (`session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`), `trigger_file_path`, `parent_file_path` |
| What was injected, and by whom | `session.append` (call `next(e)` and pass it through unchanged): `door` (`attachment`, `hook-context`, `compaction`, ...), `origin` (`{kind:'hook', event}`, `{kind:'plugin', event}`, `{kind:'engine'}`, ...), `message.name` (e.g. `nested_memory`, `compact_boundary`), `uuid`, `agentId` |
| Compaction receipt | `session.compact`: `trigger`, `instructions`, `messages` (before), and on the result `tokensBefore`/`tokensAfter`. `classic.PostCompact`: `compact_summary`. |
| Resume/fork marker | `classic.SessionStart`: `source` (`startup`, `resume`, `clear`, `compact`, `fork`), `seconds_since_last_response`, `context_tokens` |

## State

Add to `types/index.d.ts`:

```ts
export type ContextLedgerEntry = {
  uuid: string
  door: string
  origin: string          // rendered 'hook:PostToolUse', 'plugin:tool.call', 'engine', ...
  name?: string
  agentId?: string
  chars: number           // text length of message.content; a size signal, not tokens
  atMs: number
}

export type ContextLoad = {
  path: string
  memoryType: string
  reason: string
  trigger?: string
  atMs: number
}

export type CompactionReceipt = {
  trigger: string
  tokensBefore?: number
  tokensAfter?: number
  summaryChars: number
  atMs: number
}

export type ContextView = {
  ledger: ContextLedgerEntry[]   // ring buffer, newest last, cap 500
  loads: ContextLoad[]           // cap 200
  compactions: CompactionReceipt[]
  lastStart?: { source: string; atMs: number }
}
```

and `contextView: ContextView` under `PluginState['dotnet-pilot']`.

Store sizes and pointers, not content: the ledger keeps a length and a `uuid`, never the text.
That keeps `$.state` small and keeps secrets out of plugin state. The pane reads the row's text
on demand with `$.session.messages` when the user expands a row.

## Pane layout

1. **Now**: the window bar (used / auto-compact threshold / max) and the top 8 categories from the
   breakdown.
2. **Loaded**: memory files with `type`, tokens and load reason (joined from `loads` by path);
   skills (included / total, tokens); MCP tools grouped by `serverName` with loaded/deferred;
   agents by `source`.
3. **Injected**: ledger rows grouped by `origin`, with total size per origin and, expanded, the
   last rows. This answers "which hook keeps stuffing context in". Attribution stops at the
   **event**: `origin` names `PostToolUse`, not which plugin's hook (see UNCONFIRMED).
4. **Compactions**: one row per receipt, before → after, trigger, and what reloaded right after
   (the `loads` rows with `reason: 'compact'`).
5. **Session**: `lastStart.source` (`resume`/`fork` flagged) and `startedAt`.

Refresh the "Now" section on `turn.complete` (one `summary` call per turn) and when the user opens
the pane. Never refresh on a timer.

## Wiring

- `plugin.json` userConfig: `context_view` (boolean, default off).
- `register.ts`: `if (options.context_view === true) registerContextView(on)`, plus its
  `onSessionStart` in the dispatcher.
- Hooks used: `session.append` (observe, `return next(e)`), `session.compact`,
  `classic.InstructionsLoaded`, `classic.PostCompact`, `classic.SessionStart`, `turn.complete`,
  `ui.render`, `command.run`. All pass-through.

## Tests (`hooks/mods/context-view.test.ts`)

- The ledger records `door`/`origin`/size, caps at 500 and never stores text.
- `InstructionsLoaded` with `load_reason: 'compact'` joins to the latest compaction receipt.
- `session.compact` and `PostCompact` produce one receipt with before/after.
- The pane renders with an empty state (fresh session) and with seeded state from an earlier
  version (the `shape` rule in the plugin-authoring reference).
- `/dnp-context` without a placed surface returns a text summary.

## Acceptance

- After a manual `/compact`, the pane shows the receipt and which memory files reloaded.
- A Node hook that injects `additionalContext` on `PostToolUse` shows up under
  `hook:PostToolUse` with a growing size.
- No API calls happen unless the user presses Recount.

## UNCONFIRMED

- **Which plugin** a `hook-context` row came from. `origin` carries `event` only. Check: grep the
  type file of the build you target for an added field. Without one, feature 3's timing layer is
  the closest attribution.
- **Fork lineage.** No documented hook field or transcript field names a parent session id;
  `source: 'fork'` only says it is a fork. The pane says "forked (parent unknown)". It does not
  guess.
- Whether `session.append` fires for subagent rows with `agentId` on every door. Check: spawn a
  subagent and inspect the ledger.
- Whether skill bodies loaded on demand show up as a `session.append` attachment `name`. Builds
  add and retire names, so match on `door`, and treat `name` as display only.
