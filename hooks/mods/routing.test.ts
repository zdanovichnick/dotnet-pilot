import { test, expect, mock } from 'claude-code/testing'

const COMPOSE_ARGS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

const stubEngine = (on: any, files: string[]) => {
  on('session.cwd', async () => ({ value: 'C:/repo/src' }))
  on('fs.list', async (_$: unknown, e: { path: string }) => ({
    value: e.path.replaceAll('\\', '/') === 'C:/repo' ? files.map(name => ({ name, kind: 'file' })) : [],
  }))
  on('fs.read', async () => ({ value: 'ROUTING TEXT\n' }))
  on('prompt.compose', async () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' }] }))
}

test('adds one session section in a .NET project, found by walking up', async ($, on) => {
  stubEngine(on, ['App.slnx'])
  const { sections } = await $.prompt.compose(COMPOSE_ARGS)
  const added = sections.filter(s => s.id === 'dotnet-pilot:routing')
  expect(added.length).toBe(1)
  expect(added[0].text).toBe('ROUTING TEXT')
  expect(added[0].scope).toBe('session')
})

test('adds nothing outside a .NET project', async ($, on) => {
  stubEngine(on, ['package.json'])
  const { sections } = await $.prompt.compose(COMPOSE_ARGS)
  expect(sections.map(s => s.id)).toEqual(['base'])
})

test('routing:false adds nothing', { options: { routing: false } }, async ($, on) => {
  stubEngine(on, ['App.slnx'])
  const { sections } = await $.prompt.compose(COMPOSE_ARGS)
  expect(sections.map(s => s.id)).toEqual(['base'])
})
