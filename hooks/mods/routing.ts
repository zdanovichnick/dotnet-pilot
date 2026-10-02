import type { Engine, On } from 'claude-code'

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

// One session-scoped section in place of dnp-dotnet-priority's per-Agent-call nudge; both read hooks/_lib/routing.md.
export const registerRouting = (on: On) => {
  const verdicts = new Map<string, boolean>()

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const cwd = await $.session.cwd()

    let isDotNet = verdicts.get(cwd)
    if (isDotNet === undefined) {
      isDotNet = await isDotNetProject($, cwd)
      verdicts.set(cwd, isDotNet)
    }
    if (!isDotNet) return composed

    const text = await $.fs.read(`${$.plugin.root}/hooks/_lib/routing.md`).catch(() => '')
    if (typeof text !== 'string' || text.trim() === '') return composed

    return { sections: [...composed.sections, { id: 'dotnet-pilot:routing', text: text.trim(), scope: 'session' }] }
  })
}
