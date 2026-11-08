import { test, expect, mock } from 'claude-code/testing'

import { ADVICE, MIN_ROSLYN_VERSION, PROBE_TIMEOUT_MS, isBelowMinimum, SERVER_TOOL, parseVersion, probeToolName } from './mcp-health'

const COMPOSE_ARGS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const
const SERVER = 'plugin:dotnet-pilot:roslyn'

type Connect = { isConnected: true; server: string } | { isConnected: false; reason: string; message: string }

const stubEngine = (on: any, opts: { files?: string[]; version?: string } = {}) => {
  const clock = mock.clock(on)
  const out = {
    clock,
    toasts: [] as string[],
    status: [] as (string | undefined)[],
    commands: [] as string[],
    connects: [] as number[],
    runs: [] as string[][],
    connect: (): Connect => ({ isConnected: true, server: SERVER }),
    call: (): Promise<unknown> => Promise.resolve({ content: [{ type: 'text', text: 'none' }], isError: false }),
    calls: 0,
    decision: 'allow' as 'allow' | 'ask' | 'deny',
    checked: [] as string[],
    spawnFails: false,
    toolError: true,
    version: opts.version ?? `dnp-roslyn ${MIN_ROSLYN_VERSION}.2`,
    doctor: 'dnp-roslyn doctor\n=================\nSolution:    NOT FOUND\n\nFix: run from a directory with a .sln/.slnx file, or pass --solution <path>',
  }
  const files = opts.files ?? ['App.slnx']
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('fs.list', async (_$: unknown, e: { path: string }) => ({
    value: e.path.replaceAll('\\', '/') === 'C:/repo' ? files.map(name => ({ name, kind: 'file' })) : [],
  }))
  on('fs.read', async () => ({ value: 'ROUTING TEXT\n' }))
  on('mcp.connect', async () => {
    out.connects.push(clock.now())
    return { value: out.connect() }
  })
  on('tool.check', async (_$: unknown, e: { tool: string }) => {
    out.checked.push(e.tool)
    return { decision: out.decision, reason: out.decision === 'allow' ? undefined : 'not in permissions.allow' }
  })
  on('mcp.call', async () => {
    out.calls++
    return { value: await out.call() }
  })
  on('process.run', async (_$: unknown, e: { argv: string[] }) => {
    out.runs.push([...e.argv])
    if (out.spawnFails) throw new Error('spawn dnp-roslyn ENOENT')
    if (e.argv[1] === 'version') return { value: { exitCode: 0, stdout: out.version, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: out.doctor, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', async (_$: unknown, e: { name: string }) => {
    out.commands.push(e.name)
    return { value: undefined }
  })
  on('ui.toast', async (_$: unknown, e: { text: string }) => {
    out.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', async (_$: unknown, e: { text: string | undefined }) => {
    out.status.push(e.text)
    return { value: undefined }
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', async () => (out.toolError ? { result: 'Connection closed', text: 'Connection closed', isError: true } : { result: {}, text: 'none' }))
  return out
}

const start = async ($: any, out: { clock: { settle: () => Promise<void> } }) => {
  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await out.clock.settle()
}

const mcp = ($: any, args = '') =>
  $.command.run({ command: 'dnp-mcp', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

const healthSection = async ($: any) => {
  const { sections } = await $.prompt.compose(COMPOSE_ARGS)
  return sections.find((s: { id: string }) => s.id === 'dotnet-pilot:mcp-health')
}

const opts = { options: { pressure: false } }

test('versions compare against the minimum', async () => {
  expect(parseVersion('dnp-roslyn 0.5.2')).toEqual([0, 5, 2])
  expect(parseVersion('garbage')).toBe(undefined)
  expect(isBelowMinimum([0, 4, 9])).toBe(true)
  expect(isBelowMinimum([0, 5, 0])).toBe(false)
  expect(isBelowMinimum([1, 0, 0])).toBe(false)
})

test('healthy start: no toast, status set once', opts, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  expect(out.toasts).toEqual([])
  expect(out.status).toEqual(['roslyn ✓'])
  expect(out.connects.length).toBe(1)
  expect(await healthSection($)).toBe(undefined)
})

test('a failed connect is diagnosed at once and never reconnected', opts, async ($, on) => {
  const out = stubEngine(on)
  out.connect = () => ({ isConnected: false, reason: 'failed', message: 'Connection closed' })
  await start($, out)
  expect(out.connects).toEqual([0])
  expect(out.runs).toEqual([['dnp-roslyn', 'version'], ['dnp-roslyn', 'doctor']])
  expect(out.status).toEqual(['roslyn ✗ no solution'])
  expect(out.toasts.length).toBe(1)
  expect(out.toasts[0]).toContain(ADVICE['no solution'])

  await out.clock.advance(60000)
  expect(out.connects.length).toBe(1)

  const text = (await mcp($)).text
  expect(text).toContain('roslyn: down (no solution)')
  expect(text).toContain('Connection closed')
  expect(text).toContain('Solution:    NOT FOUND')
})

test('a failure the engine replayed from its cache is named when doctor finds nothing wrong', opts, async ($, on) => {
  const out = stubEngine(on)
  out.connect = () => ({
    isConnected: false,
    reason: 'failed',
    message: 'The MCP server "plugin:dotnet-pilot:roslyn" did not connect: Skipping connection (recent failure cached; retries automatically in 15 min, or edit the plugin config to retry now).',
  })
  out.doctor = 'dnp-roslyn doctor\nSolution:    C:/repo/App.slnx\nAll checks passed'
  await start($, out)
  expect(out.status).toEqual(['roslyn ✗ failure cached'])
  expect(out.toasts[0]).toContain(ADVICE['failure cached'])
})

test('a cached failure with a real cause reports the cause', opts, async ($, on) => {
  const out = stubEngine(on)
  out.connect = () => ({ isConnected: false, reason: 'failed', message: 'Skipping connection (recent failure cached; retries automatically in 15 min)' })
  await start($, out)
  expect(out.status).toEqual(['roslyn ✗ no solution'])
})

test('a tool that cannot start is reported as not installed', opts, async ($, on) => {
  const out = stubEngine(on)
  out.connect = () => ({ isConnected: false, reason: 'failed', message: '' })
  out.spawnFails = true
  await start($, out)
  expect(out.status.at(-1)).toBe('roslyn ✗ not installed')
  expect(out.toasts[0]).toContain('dotnet tool install -g DotnetPilot.Mcp.Roslyn')
})

for (const reason of ['unapproved', 'disabled', 'policy'] as const) {
  test(`${reason} is not retried and gives its advice`, opts, async ($, on) => {
    const out = stubEngine(on)
    out.connect = () => ({ isConnected: false, reason, message: '' })
    await start($, out)
    await out.clock.advance(30000)
    expect(out.connects.length).toBe(1)
    expect(out.runs).toEqual([])
    expect(out.status).toEqual([`roslyn ✗ ${reason}`])
    expect(out.toasts).toEqual([`roslyn unavailable (${reason}): ${ADVICE[reason]}`])
  })
}

test('connected but the probe times out: down, unresponsive', opts, async ($, on) => {
  const out = stubEngine(on)
  out.call = () => new Promise(() => {})
  await start($, out)
  expect(out.status).toEqual([])
  await out.clock.advance(PROBE_TIMEOUT_MS)
  expect(out.status).toEqual(['roslyn ✗ unresponsive'])
  expect((await healthSection($))?.text).toContain('Roslyn MCP is unavailable: unresponsive')
})

test('the probe asks the permission layer about the model-facing tool name', opts, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  expect(out.checked).toEqual(['mcp__plugin_dotnet-pilot_roslyn__detect_circular_dependencies'])
  expect(probeToolName('roslyn')).toBe('mcp__roslyn__detect_circular_dependencies')
  expect(out.calls).toBe(1)
})

for (const decision of ['ask', 'deny'] as const) {
  test(`a probe the permission layer would ${decision} is never called and the server stays ok`, opts, async ($, on) => {
    const out = stubEngine(on)
    out.decision = decision
    await start($, out)
    expect(out.calls).toBe(0)
    expect(out.status).toEqual(['roslyn ✓ unprobed'])
    expect(out.toasts).toEqual([])
    expect(await healthSection($)).toBe(undefined)
    const text = (await mcp($)).text
    expect(text).toContain('roslyn: ok (unprobed)')
    expect(text).toContain(ADVICE.unprobed)
  })
}

test('an unprobed server that is also outdated reports the version', opts, async ($, on) => {
  const out = stubEngine(on, { version: 'dnp-roslyn 0.4.2' })
  out.decision = 'ask'
  await start($, out)
  expect(out.status).toEqual(['roslyn ⚠ version below minimum'])
})

test('a probe the server answers with an error is down', opts, async ($, on) => {
  const out = stubEngine(on)
  out.call = () => Promise.resolve({ content: [{ type: 'text', text: 'Failed to load solution' }], isError: true })
  await start($, out)
  expect(out.status).toEqual(['roslyn ✗ probe failed'])
  expect(out.toasts[0]).toContain(ADVICE['probe failed'])
})

test('a server started outside any solution is reported as no solution', opts, async ($, on) => {
  const out = stubEngine(on)
  out.call = () =>
    Promise.resolve({
      content: [{ type: 'text', text: "No solution is loaded: dnp-roslyn started in 'C:/repo/src', which has no .sln or .slnx in it or above it." }],
      isError: true,
    })
  await start($, out)
  expect(out.status).toEqual(['roslyn ✗ no solution'])
  expect(out.toasts[0]).toContain('reload_solution')
})

test('an old dnp-roslyn stays usable but says to update', opts, async ($, on) => {
  const out = stubEngine(on, { version: 'dnp-roslyn 0.4.2' })
  await start($, out)
  expect(out.status).toEqual(['roslyn ⚠ version below minimum'])
  expect(out.toasts[0]).toContain('dotnet tool update -g DotnetPilot.Mcp.Roslyn')
  expect(await healthSection($)).toBe(undefined)
})

test('the compose section lasts while down and goes after a successful /dnp-mcp retry', opts, async ($, on) => {
  const out = stubEngine(on)
  out.connect = () => ({ isConnected: false, reason: 'disabled', message: '' })
  await start($, out)
  expect((await healthSection($))?.text).toBe('Roslyn MCP is unavailable: disabled. Use Grep/Read for C# navigation and say the results are text-based.')

  out.connect = () => ({ isConnected: true, server: SERVER })
  const text = (await mcp($, 'retry')).text
  expect(text).toContain('roslyn: ok')
  expect(await healthSection($)).toBe(undefined)
  expect(out.status.at(-1)).toBe('roslyn ✓')
})

const toolFailure = ($: any, server: string) =>
  $.tool.call({ tool: `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__find_symbol`, tool_use_id: 't1' })

test('roslyn tool names are recognized for a plugin or a configured server', async () => {
  expect(SERVER_TOOL.test('mcp__plugin_dotnet-pilot_roslyn__find_symbol')).toBe(true)
  expect(SERVER_TOOL.test('mcp__roslyn__find_symbol')).toBe(true)
  expect(SERVER_TOOL.test('mcp__plugin_other_github__issue')).toBe(false)
  expect(SERVER_TOOL.test('mcp__notroslyn__find_symbol')).toBe(false)
  expect(SERVER_TOOL.test('Bash')).toBe(false)
})

test('a failed roslyn call re-checks and toasts once when the server has gone down', opts, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  expect(out.status).toEqual(['roslyn ✓'])

  out.connect = () => ({ isConnected: false, reason: 'failed', message: 'Connection closed' })
  await toolFailure($, SERVER)
  await out.clock.settle()
  expect(out.connects.length).toBe(2)
  expect(out.status.at(-1)).toBe('roslyn ✗ no solution')
  expect(out.toasts.length).toBe(1)
  expect((await healthSection($))?.text).toContain('Roslyn MCP is unavailable: no solution')

  await toolFailure($, SERVER)
  await out.clock.settle()
  expect(out.connects.length).toBe(3)
  expect(out.toasts.length).toBe(1)
})

test('a successful roslyn call re-checks nothing', opts, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  out.toolError = false
  await toolFailure($, SERVER)
  await out.clock.settle()
  expect(out.connects.length).toBe(1)
})

test('a failed roslyn call outside a .NET project re-checks nothing', opts, async ($, on) => {
  const out = stubEngine(on, { files: ['package.json'] })
  await start($, out)
  await toolFailure($, SERVER)
  await out.clock.settle()
  expect(out.connects).toEqual([])
})

test('a failed call on another server re-checks nothing', opts, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  await toolFailure($, 'plugin:other:github')
  await out.clock.settle()
  expect(out.connects.length).toBe(1)
})

test('/dnp-mcp before any check says so', opts, async ($, on) => {
  const out = stubEngine(on, { files: ['package.json'] })
  await start($, out)
  expect(out.connects).toEqual([])
  expect(out.status).toEqual([])
  expect((await mcp($)).text).toContain('not checked yet')
})

test('pressure and mcp-health share the one status line and session start', async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  expect(out.commands.filter(c => c.startsWith('dnp-'))).toEqual(['dnp-pressure', 'dnp-mcp'])
  expect(out.status).toEqual(['pressure 0 steady', 'pressure 0 steady · roslyn ✓'])
})

test('mcp_health:false checks nothing', { options: { mcp_health: false } }, async ($, on) => {
  const out = stubEngine(on)
  await start($, out)
  expect(out.connects).toEqual([])
  expect(out.commands.filter(c => c.startsWith('dnp-'))).toEqual(['dnp-pressure'])
  expect(await healthSection($)).toBe(undefined)
})
