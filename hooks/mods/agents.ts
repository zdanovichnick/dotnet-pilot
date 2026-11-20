import { update } from 'claude-code'
import type { AgentInfo, EngineInterface, On, Timer } from 'claude-code'

import type { AgentRun, AgentRuns } from '../../types'
import {
  addToHistory,
  agentOfMemoryFolder,
  capRuns,
  changedFinished,
  finishRun,
  HISTORY_KEY_PREFIX,
  historyKey,
  isLive,
  mergeInfo,
  parseAgentFrontmatter,
  parseHistory,
  parseMemoryFile,
  startRun,
  type AgentEnd,
  type AgentHistory,
  type AgentMemory,
  type MemoryEntry,
  type AgentSnapshot,
  type AgentStart,
  type RosterAgent,
} from './agents-data'
import { DATA_FILE, renderAgentsData, renderAgentsPage, type AgentsPageInput } from './agents-page'
import { parseReview, userStateDir, type ReviewSummary } from './dashboard-data'

export const AGENTS_COMMAND = 'dnp-agents'
export const PAGE_FILE = 'dnp-agents.html'
const TICK_MS = 2000
const SIDE_TTL_MS = 10_000
const OPEN_TIMEOUT_MS = 10_000
const MEMORY_ENTRIES_MAX = 100

const runsState = { plugin: 'dotnet-pilot', key: 'agentRuns' } as const

type SideData = { atMs: number; review?: ReviewSummary; memory?: { dir: string; entries: MemoryEntry[] }; agentMemory: AgentMemory[] }

let roster: RosterAgent[] | undefined
let ticker: Timer | undefined
let memoryCache: { dir: string; stamp: string; entries: MemoryEntry[] } | undefined
let sideCache: SideData | undefined
let storeChain: Promise<unknown> = Promise.resolve()

const readText = async ($: EngineInterface, path: string) => {
  const text = await $.fs.read(path).catch(() => undefined)
  return typeof text === 'string' ? text : undefined
}

const homeDir = async ($: EngineInterface) => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

async function stateDir($: EngineInterface): Promise<string | undefined> {
  const home = await homeDir($)
  if (home === undefined) return undefined
  return userStateDir(home, await $.session.cwd())
}

async function loadRoster($: EngineInterface): Promise<RosterAgent[]> {
  if (roster !== undefined) return roster
  const dir = `${$.plugin.root}/agents`
  const entries = await $.fs.list(dir).catch(() => [])
  const found: RosterAgent[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !/^dnp-.+\.md$/.test(entry.name)) continue
    const text = await readText($, `${dir}/${entry.name}`)
    const agent = text === undefined ? undefined : parseAgentFrontmatter(text)
    if (agent !== undefined) found.push(agent)
  }
  roster = found
  return found
}

const snapshotOf = (info: AgentInfo): AgentSnapshot => ({
  id: info.id,
  type: info.type,
  description: info.description,
  status: info.status,
  startTime: info.startTime,
  tokenCount: info.tokenCount,
  model: info.model,
  effort: info.effort === undefined ? undefined : String(info.effort),
  parentId: info.parentId,
  usd: info.cost?.usd,
})

async function loadHistory($: EngineInterface): Promise<AgentHistory> {
  return parseHistory(await $.store.get(historyKey(await $.session.cwd())).catch(() => undefined))
}

// The store is one 4 MiB file shared by every project, so a rejected write evicts the project
// saved longest ago and tries once more.
async function evictOldest($: EngineInterface, keep: string) {
  let oldest: { key: string; updatedMs: number } | undefined
  for (const key of await $.store.keys()) {
    if (!key.startsWith(HISTORY_KEY_PREFIX) || key === keep) continue
    const { updatedMs } = parseHistory(await $.store.get(key))
    if (oldest === undefined || updatedMs < oldest.updatedMs) oldest = { key, updatedMs }
  }
  if (oldest === undefined) return false
  await $.store.delete(oldest.key)
  return true
}

// Writes are chained so two turns finishing together cannot each read the old history and drop a run.
function persistRuns($: EngineInterface, runs: readonly AgentRun[]) {
  if (runs.length === 0) return storeChain
  storeChain = storeChain
    .then(async () => {
      const key = historyKey(await $.session.cwd())
      const next = addToHistory(await loadHistory($), runs, await $.clock.now())
      try {
        await $.store.set(key, next)
      } catch {
        if (await evictOldest($, key)) await $.store.set(key, next)
      }
    })
    .catch(() => undefined)
  return storeChain
}

// Applies one change, then folds in the engine's agent list; returns the state after both.
// Runs that finished or changed outcome on the way are saved to the store for later sessions.
async function record($: EngineInterface, change: (runs: AgentRun[]) => AgentRun[]): Promise<AgentRuns> {
  const infos = await $.agent.list().catch(() => [] as AgentInfo[])
  const nowMs = await $.clock.now()
  let before: AgentRun[] = []
  let next: AgentRuns = { runs: [], isPageOpen: false }
  await update($, runsState, prev => {
    const base = prev ?? { runs: [], isPageOpen: false }
    before = base.runs
    next = { ...base, runs: capRuns(mergeInfo(change(base.runs), infos.map(snapshotOf), nowMs)) }
    return next
  })
  await persistRuns($, changedFinished(before, next.runs))
  return next
}

async function loadMemory($: EngineInterface, home: string, cwd: string): Promise<{ dir: string; entries: MemoryEntry[] }> {
  const dir = `${userStateDir(home, cwd)}/memory`
  const files = (await $.fs.list(dir).catch(() => []))
    .filter(f => f.kind === 'file' && /\.md$/i.test(f.name) && f.name !== 'MEMORY.md')
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MEMORY_ENTRIES_MAX)
  const stamp = files.map(f => `${f.name}:${f.mtimeMs}`).join('|')
  if (memoryCache?.dir === dir && memoryCache.stamp === stamp) return memoryCache
  const entries: MemoryEntry[] = []
  for (const f of files) {
    const text = await readText($, `${dir}/${f.name}`)
    if (text !== undefined) entries.push(parseMemoryFile(f.name, text))
  }
  memoryCache = { dir, stamp, entries }
  return memoryCache
}

async function loadAgentMemory($: EngineInterface, cwd: string, names: readonly string[]): Promise<AgentMemory[]> {
  const root = `${cwd.replace(/\\/g, '/')}/.claude/agent-memory`
  const found: AgentMemory[] = []
  for (const folder of await $.fs.list(root).catch(() => [])) {
    if (folder.kind !== 'dir') continue
    const agent = agentOfMemoryFolder(folder.name, names)
    if (agent === undefined) continue
    const files = await $.fs.list(`${root}/${folder.name}`).catch(() => [])
    const notes = files.filter(f => f.kind === 'file' && /\.md$/i.test(f.name) && f.name !== 'MEMORY.md').length
    found.push({ agent, folder: `.claude/agent-memory/${folder.name}`, notes, hasIndex: files.some(f => f.name === 'MEMORY.md') })
  }
  return found
}

// The review file and the memory folders change rarely; reading them on every 2 s tick is waste.
async function loadSideData($: EngineInterface, dir: string, cwd: string, names: readonly string[], nowMs: number): Promise<SideData> {
  if (sideCache !== undefined && nowMs - sideCache.atMs < SIDE_TTL_MS) return sideCache
  const home = await homeDir($)
  const reviewText = await readText($, `${dir}/dnp-review-latest.json`)
  sideCache = {
    atMs: nowMs,
    review: reviewText === undefined ? undefined : parseReview(reviewText),
    memory: home === undefined ? undefined : await loadMemory($, home, cwd),
    agentMemory: await loadAgentMemory($, cwd, names),
  }
  return sideCache
}

// The page shell is written only by the command; every later change rewrites the small data file
// the open page polls, so the browser swaps panels in place instead of reloading.
async function writePage($: EngineInterface, state: AgentRuns, withShell: boolean): Promise<string | undefined> {
  const dir = await stateDir($)
  if (dir === undefined) return undefined
  const cwd = await $.session.cwd()
  const nowMs = await $.clock.now()
  const agents = await loadRoster($)
  const side = await loadSideData($, dir, cwd, agents.map(a => a.name), nowMs)
  const input: AgentsPageInput = { nowMs, cwd, runs: state.runs, roster: agents, history: await loadHistory($), ...side }
  await $.fs.write(`${dir}/${DATA_FILE}`, renderAgentsData(input))
  const path = `${dir}/${PAGE_FILE}`
  if (withShell) await $.fs.write(path, renderAgentsPage(input))
  return path
}

// The ticker only runs while the page is open and an agent is live, so token counts keep moving.
async function refresh($: EngineInterface, state: AgentRuns, withShell = false): Promise<string | undefined> {
  if (!state.isPageOpen) return undefined
  const path = await writePage($, state, withShell)
  const live = state.runs.some(isLive)
  if (live && ticker === undefined) {
    ticker = $.clock.every(TICK_MS, () => {
      void tick($)
    })
  } else if (!live && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
  return path
}

async function tick($: EngineInterface) {
  try {
    await refresh($, await record($, runs => runs))
  } catch {
    // A failed tick is retried on the next one.
  }
}

async function openInBrowser($: EngineInterface, path: string) {
  const { sysname } = await $.session.machine()
  const argv =
    sysname === 'Windows_NT'
      ? ['cmd', '/c', 'start', '', path.replace(/\//g, '\\')]
      : sysname === 'Darwin'
        ? ['open', path]
        : ['xdg-open', path]
  const result = await $.process.run(argv, { timeoutMs: OPEN_TIMEOUT_MS })
  return result.exitCode === 0
}

// Called from turn-complete.ts, which holds the module's one unmatched turn.complete hook.
export async function agentsTurnComplete($: EngineInterface, e: { agentId?: string; durationMs: number; reason: string; answer: string }) {
  if (e.agentId === undefined) return
  try {
    const end: AgentEnd = { id: e.agentId, endMs: await $.clock.now(), durationMs: e.durationMs, reason: e.reason, answer: e.answer }
    await refresh($, await record($, runs => finishRun(runs, end)))
  } catch {
    // Tracking is best effort.
  }
}

export function agentsSessionStart($: EngineInterface) {
  return $.command.register({
    name: AGENTS_COMMAND,
    description: 'Open the agents dashboard page: live agents, run history across sessions, per-agent stats, roster, memory',
    immediate: true,
  })
}

export const registerAgents = (on: On) => {
  // The bookkeeping never throws past next(e): a tracker fault must not refuse or repeat a spawn.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      const agentId = result.agentId
      if (agentId !== undefined) {
        const start: AgentStart = {
          id: agentId,
          type: e.subagentType,
          description: e.description,
          startMs: await $.clock.now(),
          model: result.model,
          parentId: e.parentAgentId,
        }
        await refresh($, await record($, runs => startRun(runs, start)))
      }
    } catch {
      // Tracking is best effort.
    }
    return result
  })

  on('command.run', { command: AGENTS_COMMAND }, async $ => {
    const state = await record($, runs => runs)
    const opened: AgentRuns = { ...state, isPageOpen: true }
    await update($, runsState, () => opened)
    sideCache = undefined
    const path = await refresh($, opened, true)
    if (path === undefined) return { text: 'No home folder (USERPROFILE or HOME) is set, so the agents page has nowhere to go.' }
    const isOpened = await openInBrowser($, path).catch(() => false)
    return { text: isOpened ? `Agents page opened: ${path}` : `Agents page written to ${path}; open it in a browser.` }
  })
}
