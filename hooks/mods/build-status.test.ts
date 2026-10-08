import { test, expect, mock } from 'claude-code/testing'

const FAILED = 'Build FAILED.\n  error CS1002: ; expected\n    1 Error(s)'

const stubEngine = (on: any, result: { text: string; isError?: boolean }) => {
  mock.clock(on)
  const toasts: string[] = []
  on('tool.call', { tool: 'Bash' }, async () => ({ result: { stdout: result.text }, text: result.text, isError: result.isError === true }))
  on('ui.toast', async (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return toasts
}

test('toasts at the third consecutive failed build', async ($, on) => {
  const toasts = stubEngine(on, { text: FAILED, isError: true })
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'dotnet build App.slnx' })
  expect(toasts).toEqual([])
  await $.tool.call({ tool: 'Bash', command: 'dotnet build App.slnx' })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('3 consecutive dotnet build failures')
})

test('a green run resets the streak', async ($, on) => {
  mock.clock(on)
  let text = FAILED
  const toasts: string[] = []
  on('tool.call', { tool: 'Bash' }, async () => ({ result: { stdout: text }, text, isError: text === FAILED }))
  on('ui.toast', async (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const run = () => $.tool.call({ tool: 'Bash', command: 'dotnet test App.slnx' })
  await run()
  await run()
  text = 'Passed!  - Failed:     0, Passed:    12'
  await run()
  text = FAILED
  await run()
  await run()
  expect(toasts).toEqual([])
})

test('ignores commands that are not dotnet build or test', async ($, on) => {
  const toasts = stubEngine(on, { text: FAILED, isError: true })
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  expect(toasts).toEqual([])
})

test('build_status:false registers nothing', { options: { build_status: false } }, async ($, on) => {
  const toasts = stubEngine(on, { text: FAILED, isError: true })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'dotnet build App.slnx' })
  expect(toasts).toEqual([])
})
