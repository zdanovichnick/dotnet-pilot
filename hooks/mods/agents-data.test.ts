import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../../types'
import { capRuns, finishRun, mergeInfo, parseAgentFrontmatter, startRun, statsByType, verdictOf } from './agents-data'
import { renderAgentsPage } from './agents-page'

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

test('renderAgentsPage refreshes fast only while an agent is live', async () => {
  const idle = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [run({})], roster: [] })
  expect(idle).toContain('content="30"')
  const live = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [run({ status: 'running', endMs: undefined })], roster: [] })
  expect(live).toContain('content="5"')
})

test('renderAgentsPage with nothing recorded shows the empty states', async () => {
  const html = renderAgentsPage({ nowMs: 0, cwd: 'C:/repo', runs: [], roster: [] })
  expect(html).toContain('No agent is running.')
  expect(html).toContain('No agent has finished in this session.')
  expect(html).toContain('No review run saved')
})
