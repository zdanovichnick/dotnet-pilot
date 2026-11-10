export type Layer = 'domain' | 'application' | 'infrastructure' | 'api' | 'test' | 'other'

export type MapProject = { name: string; layer: Layer; references: string[] }

export type Violation = { from: string; to: string; rule: string }

export type ReviewFinding = { severity: string; location: string; category: string; title: string }

export type ReviewSummary = {
  runId: string
  depth: string
  fileCount: number
  requested: number
  returned: number
  broken: boolean
  confirmed: ReviewFinding[]
  unconfirmed: ReviewFinding[]
  refuted: number
  failed: number
}

const LAYERS: readonly Layer[] = ['domain', 'application', 'infrastructure', 'api', 'test', 'other']

// What each layer may reference, per skills/clean-architecture/SKILL.md. api, test and other are
// unrestricted: the composition root references Infrastructure by design.
const ALLOWED: Partial<Record<Layer, readonly Layer[]>> = {
  domain: [],
  application: ['domain'],
  infrastructure: ['domain', 'application'],
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return undefined
  }
}

export const flattenCwd = (cwd: string) => cwd.replace(/:/g, '-').replace(/[\\/]/g, '-').replace(/^-+/, '')

export const userStateDir = (home: string, cwd: string) => `${home.replace(/[\\/]+$/, '')}/.claude/projects/${flattenCwd(cwd)}`

export const parseSolutionMap = (text: string): MapProject[] => {
  const root = parseJson(text)
  if (!isRecord(root) || !Array.isArray(root.projects)) return []
  const projects: MapProject[] = []
  for (const p of root.projects) {
    if (!isRecord(p) || typeof p.name !== 'string') continue
    const layer = LAYERS.find(l => l === p.layer) ?? 'other'
    const references = Array.isArray(p.references) ? p.references.filter((r): r is string => typeof r === 'string') : []
    projects.push({ name: p.name, layer, references })
  }
  return projects
}

export const layerViolations = (projects: readonly MapProject[]): Violation[] => {
  const layerOf = new Map(projects.map(p => [p.name, p.layer]))
  const out: Violation[] = []
  for (const p of projects) {
    const allowed = ALLOWED[p.layer]
    if (allowed === undefined) continue
    for (const ref of p.references) {
      const target = layerOf.get(ref)
      if (target === undefined || target === 'test' || target === 'other' || allowed.includes(target)) continue
      out.push({ from: p.name, to: ref, rule: `${p.layer} must not reference ${target}` })
    }
  }
  return out
}

const finding = (raw: unknown): ReviewFinding | undefined => {
  if (!isRecord(raw)) return undefined
  const file = typeof raw.file === 'string' ? raw.file : '?'
  const line = typeof raw.line === 'number' ? `:${raw.line}` : ''
  return {
    severity: typeof raw.severity === 'string' ? raw.severity : '?',
    location: `${file}${line}`,
    category: typeof raw.category === 'string' ? raw.category : '',
    title: typeof raw.title === 'string' ? raw.title : '',
  }
}

const findings = (raw: unknown) => (Array.isArray(raw) ? raw.map(finding).filter((f): f is ReviewFinding => f !== undefined) : [])

const count = (raw: unknown) => (Array.isArray(raw) ? raw.length : typeof raw === 'number' ? raw : 0)

export const parseReview = (text: string): ReviewSummary | undefined => {
  const r = parseJson(text)
  if (!isRecord(r) || typeof r.runId !== 'string') return undefined
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    runId: r.runId,
    depth: typeof r.depth === 'string' ? r.depth : '?',
    fileCount: num(r.fileCount),
    requested: num(r.requested),
    returned: num(r.returned),
    broken: r.broken === true,
    confirmed: findings(r.confirmed),
    unconfirmed: findings(r.unconfirmed),
    refuted: count(r.refuted),
    failed: count(r.failed),
  }
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

export const bySeverity = (list: readonly ReviewFinding[]) =>
  [...list].sort((a, b) => {
    const rank = (s: string) => {
      const i = SEVERITY_ORDER.indexOf(s.toLowerCase())
      return i === -1 ? SEVERITY_ORDER.length : i
    }
    return rank(a.severity) - rank(b.severity)
  })

export const ageOf = (nowMs: number, thenMs: number) => {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
