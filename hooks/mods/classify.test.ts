import { test, expect } from 'claude-code/testing'

import { classify, commandKind } from './build-classify'

test('commandKind: test wins over build in a chain', () => {
  expect(commandKind('dotnet build X.slnx && dotnet test X.slnx --no-build')).toBe('test')
  expect(commandKind('dotnet.exe build X.slnx')).toBe('build')
  expect(commandKind('git status')).toBeNull()
})

test('classify: markers outrank the exit status', () => {
  expect(classify('Build succeeded.\n    0 Error(s)', 'dotnet build', true)).toBe('success')
  expect(classify('error CS0103: nope', 'dotnet build', false)).toBe('fail')
})

test('classify: bare exit status fails only an unpiped command', () => {
  expect(classify('', 'dotnet build', true)).toBe('fail')
  expect(classify('', 'dotnet build | grep x', true)).toBe('unknown')
  expect(classify('', 'dotnet build', false)).toBe('unknown')
})
