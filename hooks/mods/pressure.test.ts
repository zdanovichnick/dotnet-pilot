import { test, expect, mock } from 'claude-code/testing'

import { integrityReasons, isTestFile, labelOf } from './pressure'

const FAILED = 'Build FAILED.\n  error CS1002: ; expected\n    1 Error(s)'
const TESTS_FAILED = 'Failed!  - Failed:     2, Passed:    10'
const GREEN = 'Passed!  - Failed:     0, Passed:    12'
const COMPOSE_ARGS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

const stubEngine = (on: any) => {
  mock.clock(on)
  const out = { toasts: [] as string[], status: [] as (string | undefined)[], text: FAILED }
  on('tool.call', { tool: 'Bash' }, async () => ({ result: { stdout: out.text }, text: out.text, isError: out.text !== GREEN }))
  on('tool.call', { tool: 'Edit' }, async () => ({ result: {}, text: 'ok' }))
  on('ui.toast', async (_$: unknown, e: { text: string }) => {
    out.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', async (_$: unknown, e: { text: string | undefined }) => {
    out.status.push(e.text)
    return { value: undefined }
  })
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('fs.list', async () => ({ value: [{ name: 'package.json', kind: 'file' }] }))
  on('prompt.compose', async () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
  return out
}

const build = ($: any) => $.tool.call({ tool: 'Bash', command: 'dotnet build App.slnx' })
const runTests = ($: any) => $.tool.call({ tool: 'Bash', command: 'dotnet test App.slnx' })
const edit = ($: any, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string })

test('labels follow the thresholds', async () => {
  expect(labelOf(0)).toBe('steady')
  expect(labelOf(29)).toBe('steady')
  expect(labelOf(30)).toBe('strained')
  expect(labelOf(59)).toBe('strained')
  expect(labelOf(60)).toBe('high')
  expect(labelOf(100)).toBe('high')
})

test('recognises test files by folder and suffix', async () => {
  expect(isTestFile('D:/repo/tests/OrderTests.cs')).toBe(true)
  expect(isTestFile('D:/repo/App.Tests/OrderServiceTests.cs')).toBe(true)
  expect(isTestFile('/repo/src/App/OrderService.cs')).toBe(false)
})

test('integrity reasons name skipped, removed and commented assertions', async () => {
  expect(integrityReasons('[Fact]\npublic void X()', '[Fact(Skip = "flaky")]\npublic void X()')).toEqual(['adds Skip/Ignore to a test'])
  expect(integrityReasons('Assert.Equal(1, total);', 'var _ = total;')).toEqual(['removes the assertion'])
  expect(integrityReasons('Assert.Equal(1, total);', '// Assert.Equal(1, total);')).toEqual(['comments out an assertion'])
  expect(integrityReasons('Assert.Equal(1, total);', 'Assert.Equal(2, total);')).toEqual([])
})

test('red runs raise the score and a green run lowers it', async ($, on) => {
  const out = stubEngine(on)
  await build($)
  expect(out.status.at(-1)).toBe('pressure 25 steady')
  out.text = TESTS_FAILED
  await runTests($)
  expect(out.status.at(-1)).toBe('pressure 55 strained')
  out.text = GREEN
  await runTests($)
  expect(out.status.at(-1)).toBe('pressure 10 steady')
})

test('a loosening test edit after a red run toasts but does not block by default', async ($, on) => {
  const out = stubEngine(on)
  await build($)
  const ran = await edit($, 'D:/repo/App.Tests/OrderTests.cs', 'Assert.Equal(1, total);', '// Assert.Equal(1, total);')
  expect(ran.deny).toBe(undefined)
  expect(out.toasts.length).toBe(1)
  expect(out.toasts[0]).toContain('not the test')
})

test('the same edit with no red run recorded is not flagged', async ($, on) => {
  const out = stubEngine(on)
  await edit($, 'D:/repo/App.Tests/OrderTests.cs', 'Assert.Equal(1, total);', '// Assert.Equal(1, total);')
  expect(out.toasts).toEqual([])
})

test('pressure_test_guard_block denies a loosening test edit once the score is high', { options: { pressure_test_guard_block: true } }, async ($, on) => {
  const out = stubEngine(on)
  await build($)
  out.text = TESTS_FAILED
  await runTests($)
  await runTests($)
  const ran = await edit($, 'D:/repo/App.Tests/OrderTests.cs', '[Fact]\npublic void X()', '[Fact(Skip = "later")]\npublic void X()')
  expect(typeof ran.deny).toBe('string')
  expect(out.toasts.at(-1)).toContain('Blocked')
})

test('the prompt section appears only while the score is high', async ($, on) => {
  const out = stubEngine(on)
  const ids = async () => (await $.prompt.compose(COMPOSE_ARGS)).sections.map((s: { id: string }) => s.id)
  expect(await ids()).toEqual(['base'])
  out.text = TESTS_FAILED
  await runTests($)
  await runTests($)
  expect(await ids()).toEqual(['base', 'dotnet-pilot:pressure'])
  out.text = GREEN
  await runTests($)
  expect(await ids()).toEqual(['base'])
})

test('pressure:false registers nothing', { options: { pressure: false } }, async ($, on) => {
  const out = stubEngine(on)
  await build($)
  await build($)
  await build($)
  expect(out.status).toEqual([])
})
