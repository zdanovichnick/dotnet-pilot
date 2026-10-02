import { read } from 'claude-code'
import type { Engine, On, PromptComposeSection } from 'claude-code'

import { HIGH_AT } from './pressure'

// Same ref as pressure.ts's; the engine's scan needs the literal in the file that reads it.
const pressureState = { plugin: 'dotnet-pilot', key: 'pressure' } as const

const MARKERS = ['.sln', '.slnx', '.csproj']
const MAX_UP = 5

const parentOf = (dir: string) => {
  const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
  if (cut <= 0) return dir
  const parent = dir.slice(0, cut)
  return /^[A-Za-z]:$/.test(parent) ? dir.slice(0, cut + 1) : parent
}

// Walks up from the session directory, as hooks/_lib/dotnet.js does.
export const isDotNetProject = async ($: Engine, start: string) => {
  let dir = start
  for (let i = 0; i <= MAX_UP; i++) {
    const entries = await $.fs.list(dir).catch(() => [])
    if (entries.some(f => MARKERS.some(ext => f.name.endsWith(ext)))) return true
    const parent = parentOf(dir)
    if (parent === dir) break
    dir = parent
  }
  return false
}

const verdicts = new Map<string, boolean>()

// One session-scoped section in place of dnp-dotnet-priority's per-Agent-call nudge; both read hooks/_lib/routing.md.
const routingSection = async ($: Engine): Promise<PromptComposeSection | null> => {
  const cwd = await $.session.cwd()
  let isDotNet = verdicts.get(cwd)
  if (isDotNet === undefined) {
    isDotNet = await isDotNetProject($, cwd)
    verdicts.set(cwd, isDotNet)
  }
  if (!isDotNet) return null

  const text = await $.fs.read(`${$.plugin.root}/hooks/_lib/routing.md`).catch(() => '')
  if (typeof text !== 'string' || text.trim() === '') return null
  return { id: 'dotnet-pilot:routing', text: text.trim(), scope: 'session' }
}

// Surfaced, not suppressed: the research behind pressure.ts advises letting the model name the
// pressure rather than act on it. The section exists only while the score is high.
const pressureSection = async ($: Engine): Promise<PromptComposeSection | null> => {
  const prev = await read($, pressureState)
  if (prev === undefined || prev.score < HIGH_AT) return null
  const text = [
    `## Pressure ${prev.score}/100 (dotnet-pilot)`,
    'Repeated red dotnet runs and re-edits were observed in this session. Before the next edit:',
    '- State the blocker in one sentence. If it cannot be solved cleanly, return `[HALT: <blocker>]` with options instead of working around it.',
    '- Do not alter, skip or delete a test to make the run pass; tests define the expected behaviour.',
    '- Prefer one diagnosed fix over another retry of the same command.',
  ].join('\n')
  return { id: 'dotnet-pilot:pressure', text, scope: 'session' }
}

// The engine allows one unmatched prompt.compose hook per module and never follows `$` across an
// import, so every section source lives in this file.
export const registerCompose = (on: On, enabled: { routing: boolean; pressure: boolean }) => {
  if (!enabled.routing && !enabled.pressure) return

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const added: PromptComposeSection[] = []
    if (enabled.routing) {
      const section = await routingSection($)
      if (section !== null) added.push(section)
    }
    if (enabled.pressure) {
      const section = await pressureSection($)
      if (section !== null) added.push(section)
    }
    return added.length === 0 ? composed : { sections: [...composed.sections, ...added] }
  })
}
