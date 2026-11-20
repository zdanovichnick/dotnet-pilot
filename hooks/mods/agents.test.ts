import { expect, mock, test } from 'claude-code/testing'

const PAGE = 'C:/Users/me/.claude/projects/C--repo/dnp-agents.html'
const DATA = 'C:/Users/me/.claude/projects/C--repo/dnp-agents-data.js'
const ARCHITECT = '---\nname: dnp-architect\ntools: Read, Bash\nmodel: opus\neffort: high\n---\n'

const HISTORY_KEY = 'agentHistory:C--repo'
const MEMORY_DIR = 'C:/Users/me/.claude/projects/C--repo/memory'
const AGENT_MEMORY = 'C:/repo/.claude/agent-memory'

const entry = (name: string, kind = 'file') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })

type StubOptions = { openExitCode?: number; dirs?: Record<string, ReturnType<typeof entry>[]>; files?: Record<string, string> }

const slashes = (path: string) => path.replace(/\\/g, '/')

const stub = (on: any, { openExitCode = 0, dirs = {}, files = {} }: StubOptions = {}) => {
  mock.clock(on)
  const writes: { path: string; text: string }[] = []
  const opened: string[][] = []
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async () => ({ value: 'C:/Users/me' }))
  on('agent.list', async () => ({ value: [] }))
  on('fs.list', async (_$: unknown, e: { path: string }) => {
    const path = slashes(e.path)
    if (path.endsWith('/agents')) return { value: [entry('dnp-architect.md')] }
    if (path in dirs) return { value: dirs[path] }
    throw new Error('ENOENT')
  })
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    const path = slashes(e.path)
    if (path in files) return { value: files[path] }
    if (path.endsWith('/agents/dnp-architect.md')) return { value: ARCHITECT }
    throw new Error('ENOENT')
  })
  on('fs.write', async (_$: unknown, e: { path: string; text: string }) => {
    writes.push({ path: e.path.replace(/\\/g, '/'), text: e.text })
    return { value: undefined }
  })
  on('session.machine', async () => ({ value: { sysname: 'Windows_NT', release: '10', machine: 'x86_64', runtimes: [] } }))
  on('process.run', async (_$: unknown, e: { argv: string[] }) => {
    opened.push(e.argv)
    return { value: { exitCode: openExitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', async () => ({ value: undefined }))
  on('agent.spawn', async () => ({ model: 'claude-opus-5-5', agentId: 'agent-1' }))
  on('turn.complete', async (_$: unknown, e: { answer: string }) => ({ text: e.answer }))
  return { writes, opened }
}

const spawn = ($: any) =>
  $.agent.spawn({
    tool_use_id: 'tu-1',
    prompt: 'check the layers',
    description: 'check layers',
    subagentType: 'dotnet-pilot:dnp-architect',
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

const complete = ($: any, answer: string) =>
  $.turn.complete({ answer, durationMs: 4200, isAborted: false, turnId: 't-1', agentId: 'agent-1', reason: 'answer' })

const openPage = ($: any) => $.command.run({ command: 'dnp-agents', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

test('nothing is written to disk before /dnp-agents runs', async ($, on) => {
  const { writes } = stub(on)
  await spawn($)
  await complete($, '[HALT: which DbContext?]')
  expect(writes).toEqual([])
})

test('/dnp-agents writes the page with the finished run, its verdict and the roster, then opens it', async ($, on) => {
  const { writes, opened } = stub(on)
  await spawn($)
  await complete($, 'stopped [HALT: which DbContext?]')
  const result = await openPage($)
  expect(writes.at(-1)?.path).toBe(PAGE)
  const html = writes.at(-1)?.text ?? ''
  expect(html).toContain('dnp-architect')
  expect(html).toContain('[HALT: which DbContext?]')
  expect(html).toContain('completed')
  expect(opened[0]?.slice(0, 3)).toEqual(['cmd', '/c', 'start'])
  expect(opened[0]?.at(-1)).toBe('C:\\Users\\me\\.claude\\projects\\C--repo\\dnp-agents.html')
  expect(JSON.stringify(result)).toContain('dnp-agents.html')
})

test('/dnp-agents writes the data file beside the page so the open page can poll it', async ($, on) => {
  const { writes } = stub(on)
  await openPage($)
  expect(writes.map(w => w.path)).toEqual([DATA, PAGE])
  expect(writes[0]?.text.startsWith('window.dnpAgentsUpdate')).toBe(true)
})

test('once the page is open, a spawn and its end rewrite only the data file, not the page', async ($, on) => {
  const { writes } = stub(on)
  await openPage($)
  const before = writes.length
  await spawn($)
  const afterSpawn = writes.slice(before)
  expect(afterSpawn.length).toBeGreaterThan(0)
  expect(afterSpawn.every(w => w.path === DATA)).toBe(true)
  expect(afterSpawn.at(-1)?.text).toContain('working')
  expect(afterSpawn.at(-1)?.text).toContain('"live":1')
  await complete($, 'done')
  expect(writes.slice(before).every(w => w.path === DATA)).toBe(true)
  expect(writes.at(-1)?.text).toContain('"live":0')
})

test('a failed browser open still returns the page path', async ($, on) => {
  stub(on, { openExitCode: 1 })
  const result = await openPage($)
  expect(JSON.stringify(result)).toContain('open it in a browser')
})

test('agents:false registers no tracking and no page writes', { options: { agents: false } }, async ($, on) => {
  const { writes } = stub(on)
  await spawn($)
  await complete($, '[HALT: x]')
  expect(writes).toEqual([])
})

const recordingStore = (on: any, initial: Record<string, unknown> = {}, rejectFirstSet = false) => {
  const store = new Map(Object.entries(initial))
  const sets: { key: string; value: any }[] = []
  let isRejecting = rejectFirstSet
  on('store.get', async (_$: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', async (_$: unknown, e: { key: string; value: unknown }) => {
    if (isRejecting) {
      isRejecting = false
      throw new Error('store over 4 MiB')
    }
    sets.push({ key: e.key, value: e.value })
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: [...store.keys()] }))
  on('store.delete', async (_$: unknown, e: { key: string }) => {
    store.delete(e.key)
    return { value: undefined }
  })
  return { store, sets }
}

test('a finished run is saved to the store under the project key while the page stays unwritten', async ($, on) => {
  const { writes } = stub(on)
  const { sets } = recordingStore(on)
  await spawn($)
  expect(sets).toEqual([])
  await complete($, '[HALT: which DbContext?]')
  expect(writes).toEqual([])
  expect(sets.length).toBe(1)
  expect(sets[0]?.key).toBe(HISTORY_KEY)
  expect(sets[0]?.value.recent[0].verdict).toBe('[HALT: which DbContext?]')
  expect(sets[0]?.value.totals['dotnet-pilot:dnp-architect'].runs).toBe(1)
})

test('a run saved by an earlier session shows in history and in all-session stats', async ($, on) => {
  const { writes } = stub(on)
  const earlier = {
    id: 'old-1',
    type: 'dotnet-pilot:dnp-architect',
    description: 'earlier layer check',
    status: 'failed',
    startMs: 0,
    endMs: 10,
    durationMs: 10,
    tokens: 5,
  }
  mock.store(on, {
    [HISTORY_KEY]: {
      v: 1,
      updatedMs: 10,
      totals: { 'dotnet-pilot:dnp-architect': { runs: 3, completed: 2, totalMs: 30, tokens: 15, usd: 0 } },
      recent: [earlier],
    },
  })
  await openPage($)
  const html = writes.at(-1)?.text ?? ''
  expect(html).toContain('earlier layer check')
  expect(html).toContain('all sessions')
  expect(html).toContain('67%')
  expect(html).toContain('used</span>')
})

test('a rejected store write evicts the oldest other project and retries once', async ($, on) => {
  stub(on)
  const other = (updatedMs: number) => ({ v: 1, updatedMs, totals: {}, recent: [] })
  const { store } = recordingStore(on, { 'agentHistory:D--old': other(1), 'agentHistory:D--newer': other(5), unrelated: 1 }, true)
  await spawn($)
  await complete($, 'done')
  expect(store.has('agentHistory:D--old')).toBe(false)
  expect(store.has('agentHistory:D--newer')).toBe(true)
  expect(store.has('unrelated')).toBe(true)
  expect(store.has(HISTORY_KEY)).toBe(true)
})

test('the page lists project memory entries and counts the notes in each agent memory folder', async ($, on) => {
  const { writes } = stub(on, {
    dirs: {
      [MEMORY_DIR]: [entry('MEMORY.md'), entry('user-role.md'), entry('notes.txt')],
      [AGENT_MEMORY]: [entry('dnp-architect', 'dir'), entry('someone-else', 'dir')],
      [`${AGENT_MEMORY}/dnp-architect`]: [entry('MEMORY.md'), entry('layers.md'), entry('ef.md')],
    },
    files: {
      [`${MEMORY_DIR}/user-role.md`]: '---\nname: user-role\ndescription: <b>senior</b> .NET dev\nmetadata:\n  type: user\n---\nbody',
    },
  })
  await openPage($)
  const html = writes.at(-1)?.text ?? ''
  expect(html).toContain('user-role')
  expect(html).toContain('&lt;b&gt;senior&lt;/b&gt; .NET dev')
  expect(html).not.toContain('<b>senior</b>')
  expect(html).not.toContain('notes.txt')
  expect(html).toContain('2 notes')
  expect(html).not.toContain('someone-else')
})
