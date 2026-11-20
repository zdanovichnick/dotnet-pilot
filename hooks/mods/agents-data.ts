import type { AgentRun, AgentRunStatus } from '../../types'

export type AgentSnapshot = {
  id: string
  type: string
  description: string
  status: string
  startTime: number
  tokenCount: number
  model?: string
  effort?: string
  parentId?: string
  usd?: number
}

export type AgentStart = { id: string; type: string; description: string; startMs: number; model?: string; parentId?: string }

export type AgentEnd = { id: string; endMs: number; durationMs: number; reason: string; answer: string }

export type RosterAgent = { name: string; model: string; effort: string; skills: string[]; toolCount: number }

export type TypeStats = {
  type: string
  runs: number
  finished: number
  completed: number
  // Undefined until one run of the type has finished.
  successRate?: number
  avgMs?: number
  tokens: number
  usd: number
}

export const MAX_RUNS = 200
const VERDICT_MAX = 200

// The same three markers hooks/dnp-subagent-result.js surfaces; the first one found wins.
const MARKERS = [/\[HALT\b[^\]]*\]/, /\[PARTIAL\b[^\]]*\]/, /\[ROUTING:[^\]]*\]/]

export const verdictOf = (answer: string): string | undefined => {
  for (const re of MARKERS) {
    const hit = answer.match(re)
    if (hit) return hit[0].slice(0, VERDICT_MAX)
  }
  return undefined
}

export const isLive = (run: AgentRun) => run.status === 'running' || run.status === 'waiting'

const statusOfReason = (reason: string): AgentRunStatus => (reason === 'answer' ? 'completed' : reason === 'aborted' ? 'aborted' : 'failed')

// A start under an id already held is a resume: the run goes live again and keeps its first start.
export const startRun = (runs: readonly AgentRun[], start: AgentStart): AgentRun[] => {
  const prev = runs.find(r => r.id === start.id)
  if (prev !== undefined) {
    return runs.map(r => (r.id === start.id ? { ...r, status: 'running', endMs: undefined, verdict: undefined } : r))
  }
  return [
    ...runs,
    {
      id: start.id,
      type: start.type,
      description: start.description,
      status: 'running',
      startMs: start.startMs,
      durationMs: 0,
      model: start.model,
      parentId: start.parentId,
      tokens: 0,
    },
  ]
}

// An end with no start on record (an agent older than the mod's load) still makes a row.
export const finishRun = (runs: readonly AgentRun[], end: AgentEnd): AgentRun[] => {
  const closed = (r: AgentRun): AgentRun => ({
    ...r,
    status: statusOfReason(end.reason),
    endMs: end.endMs,
    durationMs: r.durationMs + Math.max(0, end.durationMs),
    verdict: verdictOf(end.answer),
  })
  if (runs.some(r => r.id === end.id)) return runs.map(r => (r.id === end.id ? closed(r) : r))
  const unknown: AgentRun = {
    id: end.id,
    type: 'agent',
    description: '',
    status: 'running',
    startMs: end.endMs - Math.max(0, end.durationMs),
    durationMs: 0,
    tokens: 0,
  }
  return [...runs, closed(unknown)]
}

const liveStatus = (status: string): AgentRunStatus | undefined => {
  if (status === 'waiting') return 'waiting'
  if (status === 'pending' || status === 'running' || status === 'idle') return 'running'
  return undefined
}

const endedStatus = (status: string): AgentRunStatus => (status === 'failed' ? 'failed' : status === 'killed' ? 'aborted' : 'completed')

// Adds what the engine's agent list knows (model, effort, tokens, cost). A run that an event already
// closed keeps its outcome; one still open follows the list's status.
export const mergeInfo = (runs: readonly AgentRun[], infos: readonly AgentSnapshot[], nowMs: number): AgentRun[] => {
  const out = runs.map(r => ({ ...r }))
  for (const info of infos) {
    let run = out.find(r => r.id === info.id)
    if (run === undefined) {
      run = { id: info.id, type: info.type, description: info.description, status: 'running', startMs: info.startTime, durationMs: 0, tokens: 0 }
      out.push(run)
    }
    if (run.type === 'agent' && info.type !== '') run.type = info.type
    if (run.description === '') run.description = info.description
    if (info.model !== undefined) run.model = info.model
    if (info.effort !== undefined) run.effort = info.effort
    if (info.parentId !== undefined) run.parentId = info.parentId
    if (info.tokenCount > run.tokens) run.tokens = info.tokenCount
    if (info.usd !== undefined) run.usd = info.usd
    if (run.endMs !== undefined) continue
    const live = liveStatus(info.status)
    if (live !== undefined) {
      run.status = live
    } else {
      run.status = endedStatus(info.status)
      run.endMs = nowMs
      run.durationMs = Math.max(0, nowMs - run.startMs)
    }
  }
  return out
}

// Live runs are never dropped; the oldest finished ones go first.
export const capRuns = (runs: readonly AgentRun[], max = MAX_RUNS): AgentRun[] => {
  if (runs.length <= max) return [...runs]
  let excess = runs.length - max
  return runs.filter(r => {
    if (excess === 0 || isLive(r)) return true
    excess -= 1
    return false
  })
}

export const statsByType = (runs: readonly AgentRun[]): TypeStats[] => {
  const byType = new Map<string, AgentRun[]>()
  for (const run of runs) byType.set(run.type, [...(byType.get(run.type) ?? []), run])
  const out: TypeStats[] = []
  for (const [type, list] of byType) {
    const finished = list.filter(r => !isLive(r))
    const completed = finished.filter(r => r.status === 'completed').length
    out.push({
      type,
      runs: list.length,
      finished: finished.length,
      completed,
      successRate: finished.length === 0 ? undefined : completed / finished.length,
      avgMs: finished.length === 0 ? undefined : finished.reduce((n, r) => n + r.durationMs, 0) / finished.length,
      tokens: list.reduce((n, r) => n + r.tokens, 0),
      usd: list.reduce((n, r) => n + (r.usd ?? 0), 0),
    })
  }
  return out.sort((a, b) => b.runs - a.runs || a.type.localeCompare(b.type))
}

// Reads the frontmatter of an agents/dnp-*.md file: `tools:` is one comma-separated line, `skills:` a
// YAML list or one comma-separated line.
export const parseAgentFrontmatter = (text: string): RosterAgent | undefined => {
  const block = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block) return undefined
  const fields = new Map<string, string>()
  const skills: string[] = []
  let key = ''
  for (const line of block[1]!.split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.+)$/)
    if (item) {
      if (key === 'skills') skills.push(item[1]!.trim())
      continue
    }
    const pair = line.match(/^([A-Za-z_-]+):\s*(.*)$/)
    if (!pair) continue
    key = pair[1]!
    fields.set(key, pair[2]!.trim().replace(/^["']|["']$/g, ''))
  }
  const name = fields.get('name')
  if (name === undefined || name === '') return undefined
  const list = (value: string | undefined) => (value ?? '').split(',').map(s => s.trim()).filter(s => s !== '')
  return {
    name,
    model: fields.get('model') || '?',
    effort: fields.get('effort') || '?',
    skills: skills.length > 0 ? skills : list(fields.get('skills')),
    toolCount: list(fields.get('tools')).length,
  }
}

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export const formatTokens = (n: number) => (n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(2)}M`)

export const formatUsd = (usd: number | undefined) => (usd === undefined ? '—' : `$${usd.toFixed(usd < 1 ? 3 : 2)}`)
