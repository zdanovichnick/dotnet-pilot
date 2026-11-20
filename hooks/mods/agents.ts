import { update } from 'claude-code'
import type { AgentInfo, EngineInterface, On, Timer } from 'claude-code'

import type { AgentRun, AgentRuns } from '../../types'
import {
  capRuns,
  finishRun,
  isLive,
  mergeInfo,
  parseAgentFrontmatter,
  startRun,
  type AgentEnd,
  type AgentSnapshot,
  type AgentStart,
  type RosterAgent,
} from './agents-data'
import { renderAgentsPage } from './agents-page'
import { parseReview, userStateDir } from './dashboard-data'

export const AGENTS_COMMAND = 'dnp-agents'
export const PAGE_FILE = 'dnp-agents.html'
const TICK_MS = 5000
const OPEN_TIMEOUT_MS = 10_000

const runsState = { plugin: 'dotnet-pilot', key: 'agentRuns' } as const

let roster: RosterAgent[] | undefined
let ticker: Timer | undefined

const readText = async ($: EngineInterface, path: string) => {
  const text = await $.fs.read(path).catch(() => undefined)
  return typeof text === 'string' ? text : undefined
}

const homeDir = async ($: EngineInterface) => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

async function pagePath($: EngineInterface): Promise<string | undefined> {
  const home = await homeDir($)
  if (home === undefined) return undefined
  return `${userStateDir(home, await $.session.cwd())}/${PAGE_FILE}`
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

// Applies one change, then folds in the engine's agent list; returns the state after both.
async function record($: EngineInterface, change: (runs: AgentRun[]) => AgentRun[]): Promise<AgentRuns> {
  const infos = await $.agent.list().catch(() => [] as AgentInfo[])
  const nowMs = await $.clock.now()
  let next: AgentRuns = { runs: [], isPageOpen: false }
  await update($, runsState, prev => {
    const base = prev ?? { runs: [], isPageOpen: false }
    next = { ...base, runs: capRuns(mergeInfo(change(base.runs), infos.map(snapshotOf), nowMs)) }
    return next
  })
  return next
}

async function writePage($: EngineInterface, state: AgentRuns): Promise<string | undefined> {
  const path = await pagePath($)
  if (path === undefined) return undefined
  const home = await homeDir($)
  const cwd = await $.session.cwd()
  const reviewText = home === undefined ? undefined : await readText($, `${userStateDir(home, cwd)}/dnp-review-latest.json`)
  const html = renderAgentsPage({
    nowMs: await $.clock.now(),
    cwd,
    runs: state.runs,
    roster: await loadRoster($),
    review: reviewText === undefined ? undefined : parseReview(reviewText),
  })
  await $.fs.write(path, html)
  return path
}

// The ticker only runs while the page is open and an agent is live, so elapsed time and tokens move.
async function refresh($: EngineInterface, state: AgentRuns): Promise<string | undefined> {
  if (!state.isPageOpen) return undefined
  const path = await writePage($, state)
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
    description: 'Open the agents dashboard page: live agents, run history, per-agent stats, roster',
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
    const path = await refresh($, opened)
    if (path === undefined) return { text: 'No home folder (USERPROFILE or HOME) is set, so the agents page has nowhere to go.' }
    const isOpened = await openInBrowser($, path).catch(() => false)
    return { text: isOpened ? `Agents page opened: ${path}` : `Agents page written to ${path}; open it in a browser.` }
  })
}
