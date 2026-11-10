import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'dotnet-pilot',
  component: 'Pane',
  requestId: 'dnp-dashboard',
  surface: 'terminal',
  props: { title: 'dotnet-pilot', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const MAP = JSON.stringify({
  projects: [
    { name: 'Shop.Domain', layer: 'domain', references: ['Shop.Infrastructure'] },
    { name: 'Shop.Infrastructure', layer: 'infrastructure', references: ['Shop.Domain'] },
  ],
})

const stub = (on: any, files: Record<string, string>) => {
  mock.clock(on)
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async () => ({ value: 'C:/Users/me' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    const key = e.path.replace(/\\/g, '/')
    if (!(key in files)) throw new Error('ENOENT')
    return { value: files[key] }
  })
}

test('telemetry opens first and says nothing was recorded', async ($, on) => {
  stub(on, {})
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /pressure 0 steady/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No red dotnet run/ })).toBeDefined()
  await ui.unmount()
})

test('the architecture tab flags a domain project that references infrastructure', async ($, on) => {
  stub(on, { 'C:/repo/.planning/solution-map.json': MAP })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'architecture' })
  expect(await ui.find({ type: 'Text', text: /domain must not reference infrastructure/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 layer violation/ })).toBeDefined()
  await ui.unmount()
})

test('the architecture tab without a map points at project:init', async ($, on) => {
  stub(on, {})
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'architecture' })
  expect(await ui.find({ type: 'Text', text: /project:init/ })).toBeDefined()
  await ui.unmount()
})

test('the review tab shows the saved run and its confirmed findings', async ($, on) => {
  stub(on, {
    'C:/Users/me/.claude/projects/C--repo/dnp-review-latest.json': JSON.stringify({
      runId: 'run-1',
      depth: 'standard',
      fileCount: 2,
      requested: 4,
      returned: 4,
      confirmed: [{ severity: 'high', file: 'Api/Orders.cs', line: 9, category: 'security', title: 'unvalidated id' }],
      unconfirmed: [],
      refuted: [],
      failed: [],
    }),
  })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'review' })
  expect(await ui.find({ type: 'Text', text: /run-1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Api\/Orders\.cs:9/ })).toBeDefined()
  await ui.unmount()
})

test('the review tab without a saved run says how to produce one', async ($, on) => {
  stub(on, {})
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'review' })
  expect(await ui.find({ type: 'Text', text: /quality:review/ })).toBeDefined()
  await ui.unmount()
})
