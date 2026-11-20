import { expect, mock, test } from 'claude-code/testing'

const PAGE = 'C:/Users/me/.claude/projects/C--repo/dnp-agents.html'
const ARCHITECT = '---\nname: dnp-architect\ntools: Read, Bash\nmodel: opus\neffort: high\n---\n'

const stub = (on: any, openExitCode = 0) => {
  mock.clock(on)
  const writes: { path: string; text: string }[] = []
  const opened: string[][] = []
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async () => ({ value: 'C:/Users/me' }))
  on('agent.list', async () => ({ value: [] }))
  on('fs.list', async () => ({ value: [{ name: 'dnp-architect.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path.endsWith('dnp-architect.md')) return { value: ARCHITECT }
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

test('once the page is open, a spawn rewrites it with the agent working', async ($, on) => {
  const { writes } = stub(on)
  await openPage($)
  const before = writes.length
  await spawn($)
  expect(writes.length).toBeGreaterThan(before)
  expect(writes.at(-1)?.text).toContain('working')
  await complete($, 'done')
})

test('a failed browser open still returns the page path', async ($, on) => {
  stub(on, 1)
  const result = await openPage($)
  expect(JSON.stringify(result)).toContain('open it in a browser')
})

test('agents:false registers no tracking and no page writes', { options: { agents: false } }, async ($, on) => {
  const { writes } = stub(on)
  await spawn($)
  await complete($, '[HALT: x]')
  expect(writes).toEqual([])
})
