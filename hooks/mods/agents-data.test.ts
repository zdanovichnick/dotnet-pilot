import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../../types'
import {
  addToHistory,
  agentOfMemoryFolder,
  capRuns,
  changedFinished,
  emptyHistory,
  finishedRuns,
  finishRun,
  historyKey,
  HISTORY_KEEP,
  mergeInfo,
  parseAgentFrontmatter,
  parseHistory,
  parseMemoryFile,
  startRun,
  statsByType,
  statsFromTotals,
  verdictOf,
} from './agents-data'
import { DATA_FILE, renderAgentsData, renderAgentsPage } from './agents-page'

const run = (over: Partial<AgentRun>): AgentRun => ({
  id: 'a1',
  type: 'dotnet-pilot:dnp-architect',
  description: 'check layers',
  status: 'completed',
  startMs: 0,
  endMs: 1000,
  durationMs: 1000,
  tokens: 0,
  ...over,
})

test('verdictOf takes the HALT, PARTIAL or ROUTING marker and nothing else', async () => {
  expect(verdictOf('done. [HALT: pick a DbContext] more')).toBe('[HALT: pick a DbContext]')
  expect(verdictOf('[PARTIAL 3 of 5 files]')).toBe('[PARTIAL 3 of 5 files]')
  expect(verdictOf('[ROUTING: dnp-tdd-developer-hard]')).toBe('[ROUTING: dnp-tdd-developer-hard]')
  expect(verdictOf('all green')).toBeUndefined()
  expect(verdictOf(`[HALT ${'x'.repeat(300)}]`)?.length).toBe(200)
})

test('startRun then finishRun records outcome, duration and verdict', async () => {
  let runs = startRun([], { id: 'a1', type: 't', description: 'd', startMs: 100 })
  expect(runs[0]?.status).toBe('running')
  runs = finishRun(runs, { id: 'a1', endMs: 900, durationMs: 800, reason: 'answer', answer: '[HALT: which layer?]' })
  expect(runs[0]).toMatchObject({ status: 'completed', durationMs: 800, verdict: '[HALT: which layer?]' })
  expect(finishRun(runs, { id: 'a1', endMs: 1, durationMs: 0, reason: 'error', answer: '' })[0]?.status).toBe('failed')
  expect(finishRun(runs, { id: 'a1', endMs: 1, durationMs: 0, reason: 'aborted', answer: '' })[0]?.status).toBe('aborted')
})

test('a resumed agent goes live again and adds to its duration', async () => {
  let runs = finishRun(startRun([], { id: 'a1', type: 't', description: 'd', startMs: 0 }), { id: 'a1', endMs: 10, durationMs: 10, reason: 'answer', answer: '' })
  runs = startRun(runs, { id: 'a1', type: 't', description: 'd', startMs: 50 })
  expect(runs).toHaveLength(1)
  expect(runs[0]?.status).toBe('running')
  runs = finishRun(runs, { id: 'a1', endMs: 70, durationMs: 20, reason: 'answer', answer: '' })
  expect(runs[0]?.durationMs).toBe(30)
})

test('finishRun for an unknown agent still makes a row', async () => {
  const runs = finishRun([], { id: 'x', endMs: 500, durationMs: 200, reason: 'answer', answer: '' })
  expect(runs[0]).toMatchObject({ id: 'x', status: 'completed', startMs: 300 })
})

test('mergeInfo adds tokens and cost, and closes a run the list shows ended', async () => {
  const runs = startRun([], { id: 'a1', type: 't', description: 'd', startMs: 0 })
  const snap = { id: 'a1', type: 't', description: 'd', startTime: 0, tokenCount: 1200, model: 'opus', effort: 'high', usd: 0.04 }
  const live = mergeInfo(runs, [{ ...snap, status: 'running' }], 1000)
  expect(live[0]).toMatchObject({ status: 'running', tokens: 1200, model: 'opus', effort: 'high', usd: 0.04 })
  const ended = mergeInfo(runs, [{ ...snap, status: 'killed' }], 1000)
  expect(ended[0]).toMatchObject({ status: 'aborted', endMs: 1000 })
})

test('statsByType over no runs, one run and mixed outcomes', async () => {
  expect(statsByType([])).toEqual([])
  expect(statsByType([run({ status: 'running', endMs: undefined })])[0]).toMatchObject({ runs: 1, finished: 0, successRate: undefined })
  const stats = statsByType([run({ id: '1' }), run({ id: '2', status: 'failed', durationMs: 3000 }), run({ id: '3', type: 'other' })])
  expect(stats[0]).toMatchObject({ type: 'dotnet-pilot:dnp-architect', runs: 2, completed: 1, successRate: 0.5, avgMs: 2000 })
})

test('capRuns drops the oldest finished runs and keeps live ones', async () => {
  const runs = [run({ id: 'live', status: 'running' }), run({ id: 'old' }), run({ id: 'new' })]
  expect(capRuns(runs, 3)).toHaveLength(3)
  expect(capRuns(runs, 2).map(r => r.id)).toEqual(['live', 'new'])
})

test('parseAgentFrontmatter reads list and inline fields and rejects a file with no name', async () => {
  const text = '---\nname: dnp-architect\ndescription: "x"\ntools: Read, Bash, Grep\nskills:\n  - clean-architecture\n  - ddd\nmodel: opus\neffort: high\n---\nbody'
  expect(parseAgentFrontmatter(text)).toEqual({ name: 'dnp-architect', model: 'opus', effort: 'high', skills: ['clean-architecture', 'ddd'], toolCount: 3 })
  expect(parseAgentFrontmatter('---\nname: bare\n---\n')).toEqual({ name: 'bare', model: '?', effort: '?', skills: [], toolCount: 0 })
  expect(parseAgentFrontmatter('---\nmodel: opus\n---\n')).toBeUndefined()
  expect(parseAgentFrontmatter('no frontmatter')).toBeUndefined()
})

test('renderAgentsPage escapes model text', async () => {
  const html = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [run({ description: '<script>alert(1)</script>' })], roster: [] })
  expect(html).not.toContain('<script>alert')
  expect(html).toContain('&lt;script&gt;')
})

test('renderAgentsPage polls the data file instead of reloading, with a reload only for no-script browsers', async () => {
  const html = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [run({ status: 'running', endMs: undefined, startMs: 1234 })], roster: [] })
  expect(html).toContain(`'${DATA_FILE}?'`)
  expect(html).toContain('<noscript><meta http-equiv="refresh" content="5"></noscript>')
  expect(html.match(/http-equiv="refresh"/g)?.length).toBe(1)
  expect(html).toContain('data-start="1234"')
  for (const id of ['dnp-status', 'dnp-counts', 'dnp-main', 'dnp-footer']) expect(html).toContain(`id="${id}"`)
})

test('renderAgentsData carries the escaped panels and the live count as one update call', async () => {
  const data = renderAgentsData({ nowMs: 42, cwd: 'C:/repo', runs: [run({ status: 'running', endMs: undefined, description: '<img src=x onerror=alert(1)>' })], roster: [] })
  const prefix = 'window.dnpAgentsUpdate && window.dnpAgentsUpdate('
  expect(data.startsWith(prefix)).toBe(true)
  const parts = JSON.parse(data.slice(prefix.length, data.lastIndexOf(')')))
  expect(parts).toMatchObject({ updatedMs: 42, live: 1 })
  expect(parts.main).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(parts.main).not.toContain('<img')
  expect(parts.counts).toContain('working now')
  expect(parts.footer).toContain('No review run saved')
})

test('renderAgentsPage with nothing recorded shows the empty states', async () => {
  const html = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [], roster: [] })
  expect(html).toContain('No agent is running.')
  expect(html).toContain('No agent has finished in this session.')
  expect(html).toContain('No review run saved')
})

test('historyKey is per project folder', async () => {
  expect(historyKey('C:\\repo')).toBe('agentHistory:C--repo')
  expect(historyKey('/home/me/app')).toBe('agentHistory:home-me-app')
})

test('parseHistory rejects other versions and drops malformed runs and fields', async () => {
  expect(parseHistory(undefined)).toEqual(emptyHistory())
  expect(parseHistory({ v: 2, totals: {}, recent: [] })).toEqual(emptyHistory())
  const parsed = parseHistory({
    v: 1,
    updatedMs: 7,
    totals: { t: { runs: 2, completed: 'x' }, bad: 3 },
    recent: [run({ id: 'ok' }), { id: 'no-type' }, run({ id: 'bad-status', status: 'exploded' as AgentRun['status'] })],
  })
  expect(parsed.totals).toEqual({ t: { runs: 2, completed: 0, totalMs: 0, tokens: 0, usd: 0 } })
  expect(parsed.recent.map(r => r.id)).toEqual(['ok'])
  expect(parsed.updatedMs).toBe(7)
})

test('changedFinished returns new, just-ended and re-scored runs, never live or unchanged ones', async () => {
  const before = [run({ id: 'same' }), run({ id: 'ending', status: 'running', endMs: undefined }), run({ id: 'rescored', tokens: 1 })]
  const after = [
    run({ id: 'same' }),
    run({ id: 'ending' }),
    run({ id: 'rescored', tokens: 9 }),
    run({ id: 'new' }),
    run({ id: 'live', status: 'running', endMs: undefined }),
  ]
  expect(changedFinished(before, after).map(r => r.id)).toEqual(['ending', 'rescored', 'new'])
  expect(changedFinished([], [])).toEqual([])
})

test('addToHistory counts a replaced run once and caps recent at HISTORY_KEEP', async () => {
  let h = addToHistory(emptyHistory(), [run({ id: 'a', durationMs: 100, tokens: 10 })], 1)
  h = addToHistory(h, [run({ id: 'a', status: 'failed', durationMs: 300, tokens: 30 })], 2)
  expect(h.totals['dotnet-pilot:dnp-architect']).toEqual({ runs: 1, completed: 0, totalMs: 300, tokens: 30, usd: 0 })
  expect(h.recent).toHaveLength(1)
  expect(h.updatedMs).toBe(2)
  const many = Array.from({ length: HISTORY_KEEP + 1 }, (_, i) => run({ id: `r${i}`, endMs: i, description: 'x'.repeat(500) }))
  const capped = addToHistory(emptyHistory(), many, 3)
  expect(capped.recent).toHaveLength(HISTORY_KEEP)
  expect(capped.recent[0]?.id).toBe(`r${HISTORY_KEEP}`)
  expect(capped.recent[0]?.description.length).toBe(160)
  expect(capped.totals['dotnet-pilot:dnp-architect']?.runs).toBe(HISTORY_KEEP + 1)
})

test('statsFromTotals skips empty types and orders by runs', async () => {
  const stats = statsFromTotals({
    a: { runs: 1, completed: 1, totalMs: 10, tokens: 1, usd: 0 },
    b: { runs: 4, completed: 1, totalMs: 40, tokens: 4, usd: 0.5 },
    c: { runs: 0, completed: 0, totalMs: 0, tokens: 0, usd: 0 },
  })
  expect(stats.map(s => s.type)).toEqual(['b', 'a'])
  expect(stats[0]).toMatchObject({ successRate: 0.25, avgMs: 10, usd: 0.5 })
})

test('finishedRuns prefers the session copy of a stored run and sorts newest first', async () => {
  const session = [run({ id: 'x', endMs: 5, description: 'session' }), run({ id: 'live', status: 'running', endMs: undefined })]
  const stored = [run({ id: 'x', endMs: 5, description: 'stored' }), run({ id: 'old', endMs: 1 }), run({ id: 'newer', endMs: 9 })]
  const merged = finishedRuns(session, stored)
  expect(merged.map(r => r.id)).toEqual(['newer', 'x', 'old'])
  expect(merged[1]?.description).toBe('session')
})

test('parseMemoryFile reads nested type, a BOM and quotes, and falls back to the file name', async () => {
  const text = '\ufeff---\r\nname: "user-role"\r\ndescription: Senior dev\r\nmetadata:\r\n  type: user\r\n---\r\nbody'
  expect(parseMemoryFile('user-role.md', text)).toEqual({ file: 'user-role.md', name: 'user-role', type: 'user', description: 'Senior dev' })
  expect(parseMemoryFile('bare.md', 'no frontmatter')).toEqual({ file: 'bare.md', name: 'bare', type: '—', description: '' })
})

test('agentOfMemoryFolder matches the bare name or a plugin-prefixed one only', async () => {
  const names = ['dnp-architect', 'dnp-nuget-auditor']
  expect(agentOfMemoryFolder('dnp-architect', names)).toBe('dnp-architect')
  expect(agentOfMemoryFolder('dotnet-pilot-dnp-nuget-auditor', names)).toBe('dnp-nuget-auditor')
  expect(agentOfMemoryFolder('dotnet-pilot:dnp-architect', names)).toBe('dnp-architect')
  expect(agentOfMemoryFolder('dnp-architect-old', names)).toBeUndefined()
  expect(agentOfMemoryFolder('', names)).toBeUndefined()
})

test('renderAgentsPage with an empty stored history says so per project', async () => {
  const html = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [], roster: [], history: emptyHistory(), memory: { dir: 'C:/m', entries: [] } })
  expect(html).toContain('No agent has finished in this project yet.')
  expect(html).toContain('No finished run is saved for this project yet.')
  expect(html).toContain('No memory entries for this project.')
})
