import { test, expect } from 'claude-code/testing'

import { ageOf, bySeverity, layerViolations, parseReview, parseSolutionMap, userStateDir } from './dashboard-data'

const MAP = JSON.stringify({
  projects: [
    { name: 'Shop.Domain', layer: 'domain', references: [] },
    { name: 'Shop.Application', layer: 'application', references: ['Shop.Domain'] },
    { name: 'Shop.Infrastructure', layer: 'infrastructure', references: ['Shop.Domain', 'Shop.Application'] },
    { name: 'Shop.Api', layer: 'api', references: ['Shop.Application', 'Shop.Infrastructure'] },
    { name: 'Shop.Tests', layer: 'test', references: ['Shop.Api', 'Shop.Domain'] },
  ],
})

test('a clean solution map has no layer violations', async () => {
  expect(layerViolations(parseSolutionMap(MAP))).toEqual([])
})

test('domain referencing infrastructure, and application referencing infrastructure, are violations', async () => {
  const projects = parseSolutionMap(
    JSON.stringify({
      projects: [
        { name: 'D', layer: 'domain', references: ['I'] },
        { name: 'A', layer: 'application', references: ['I', 'D'] },
        { name: 'I', layer: 'infrastructure', references: [] },
      ],
    }),
  )
  expect(layerViolations(projects)).toEqual([
    { from: 'D', to: 'I', rule: 'domain must not reference infrastructure' },
    { from: 'A', to: 'I', rule: 'application must not reference infrastructure' },
  ])
})

test('an unknown layer reads as other and an unparseable map reads as empty', async () => {
  expect(parseSolutionMap(JSON.stringify({ projects: [{ name: 'X', layer: 'weird' }] }))).toEqual([{ name: 'X', layer: 'other', references: [] }])
  expect(parseSolutionMap('not json')).toEqual([])
  expect(parseSolutionMap(JSON.stringify({ projects: {} }))).toEqual([])
})

test('a BOM before the JSON is tolerated', async () => {
  expect(parseSolutionMap(`\uFEFF${MAP}`)).toHaveLength(5)
})

test('a saved review parses its counts and findings', async () => {
  const review = parseReview(
    JSON.stringify({
      runId: 'r1',
      depth: 'standard',
      fileCount: 3,
      requested: 5,
      returned: 4,
      broken: true,
      confirmed: [
        { severity: 'low', file: 'A.cs', line: 2, category: 'style', title: 'nit' },
        { severity: 'high', file: 'B.cs', category: 'security', title: 'sql injection' },
      ],
      unconfirmed: [],
      refuted: [{}, {}],
      failed: [{ unit: 's1' }],
    }),
  )
  expect(review?.refuted).toBe(2)
  expect(review?.failed).toBe(1)
  expect(review?.broken).toBe(true)
  expect(bySeverity(review?.confirmed ?? []).map(f => f.location)).toEqual(['B.cs', 'A.cs:2'])
})

test('a review file without a runId is ignored', async () => {
  expect(parseReview('{}')).toBeUndefined()
  expect(parseReview('nope')).toBeUndefined()
})

test('the user state dir follows the flattened cwd', async () => {
  expect(userStateDir('C:/Users/me/', 'D:\\Projects\\Foo')).toBe('C:/Users/me/.claude/projects/D--Projects-Foo')
})

test('ages read in seconds, minutes and hours', async () => {
  expect(ageOf(10_000, 4_000)).toBe('6s ago')
  expect(ageOf(600_000, 0)).toBe('10m ago')
  expect(ageOf(7_300_000, 0)).toBe('2h ago')
})
