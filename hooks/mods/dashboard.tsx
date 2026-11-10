import { atom, read, update } from 'claude-code'
import type { Engine, On } from 'claude-code'

import type { DashboardTab } from '../../types'
import { labelOf } from './pressure'
import {
  ageOf,
  bySeverity,
  layerViolations,
  parseReview,
  parseSolutionMap,
  userStateDir,
  type MapProject,
} from './dashboard-data'

const PANE = 'dnp-dashboard'
const TABS: readonly { id: DashboardTab; label: string }[] = [
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'review', label: 'Review' },
  { id: 'architecture', label: 'Architecture' },
]
const LAYER_ORDER = ['api', 'infrastructure', 'application', 'domain', 'test', 'other'] as const
const MAX_FINDINGS = 12

// Same refs as pressure.ts, mcp-health.ts and build-status.ts; the engine's scan needs the literal in the file that reads it.
const tabState = atom({ plugin: 'dotnet-pilot', key: 'dashboardTab' } as const, 'telemetry', { shape: 'tab-1' })
const pressureState = { plugin: 'dotnet-pilot', key: 'pressure' } as const
const healthState = { plugin: 'dotnet-pilot', key: 'mcpHealth' } as const
const streakState = { plugin: 'dotnet-pilot', key: 'buildStreak' } as const

const isTab = (value: string): value is DashboardTab => TABS.some(t => t.id === value)

const readText = async ($: Engine, path: string) => {
  const text = await $.fs.read(path).catch(() => undefined)
  return typeof text === 'string' ? text : undefined
}

const homeDir = async ($: Engine) => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

async function loadProjects($: Engine, cwd: string): Promise<MapProject[] | undefined> {
  const local = await readText($, `${cwd}/.planning/solution-map.json`)
  if (local !== undefined) return parseSolutionMap(local)
  const home = await homeDir($)
  if (home === undefined) return undefined
  const scoped = await readText($, `${userStateDir(home, cwd)}/.planning/solution-map.json`)
  return scoped === undefined ? undefined : parseSolutionMap(scoped)
}

async function loadReview($: Engine, cwd: string) {
  const home = await homeDir($)
  if (home === undefined) return undefined
  const text = await readText($, `${userStateDir(home, cwd)}/dnp-review-latest.json`)
  return text === undefined ? undefined : parseReview(text)
}

const severityColor = (severity: string) => {
  const s = severity.toLowerCase()
  return s === 'critical' || s === 'high' ? 'error' : s === 'medium' ? 'warning' : undefined
}

export const registerDashboard = (on: On) => {
  on('command.run', { command: 'dnp-dashboard' }, async ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    if (isTab(wanted)) await update($, tabState, () => wanted)
    await $.ui.open({ id: PANE, title: 'dotnet-pilot' })
    return { text: 'dotnet-pilot dashboard opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const tab = await read($, tabState)
    const now = await $.clock.now()
    const cwd = await $.session.cwd()

    const header = (
      <Box flexDirection="row" gap={1}>
        {TABS.map(t => (
          <Button
            key={t.id}
            variant={t.id === tab ? 'primary' : 'secondary'}
            onPress={() => update($, tabState, () => t.id)}
          >
            {t.label}
          </Button>
        ))}
        <Button key="refresh" plain onPress={() => $.ui.invalidate('ui.render')}>
          refresh
        </Button>
      </Box>
    )

    if (tab === 'review') {
      const review = await loadReview($, cwd)
      if (review === undefined) {
        return (
          <Box flexDirection="column">
            {header}
            <Text dimColor>No review saved for this folder. Run /dotnet-pilot:quality:review; its result lands here.</Text>
          </Box>
        )
      }
      const confirmed = bySeverity(review.confirmed)
      return (
        <Box flexDirection="column">
          {header}
          <Text bold>
            {review.runId} · {review.depth} · {review.fileCount} files · agents {review.returned}/{review.requested}
          </Text>
          <Text>
            {review.confirmed.length} confirmed · {review.refuted} refuted · {review.unconfirmed.length} unconfirmed
          </Text>
          {review.broken && <Text color="warning">Coverage incomplete: some shards were never read.</Text>}
          {review.failed > 0 && <Text dimColor>{review.failed} agent(s) failed.</Text>}
          {confirmed.slice(0, MAX_FINDINGS).map(f => (
            <Text wrap="truncate-end">
              <Text color={severityColor(f.severity)}>{f.severity.toUpperCase()}</Text> {f.location} {f.title}
            </Text>
          ))}
          {confirmed.length > MAX_FINDINGS && <Text dimColor>+{confirmed.length - MAX_FINDINGS} more in the digest</Text>}
        </Box>
      )
    }

    if (tab === 'architecture') {
      const projects = await loadProjects($, cwd)
      if (projects === undefined || projects.length === 0) {
        return (
          <Box flexDirection="column">
            {header}
            <Text dimColor>No solution-map.json found. Run /dotnet-pilot:project:init.</Text>
          </Box>
        )
      }
      const violations = layerViolations(projects)
      return (
        <Box flexDirection="column">
          {header}
          {LAYER_ORDER.map(layer => {
            const members = projects.filter(p => p.layer === layer)
            if (members.length === 0) return null
            return (
              <Box flexDirection="column">
                <Text bold>{layer}</Text>
                {members.map(p => {
                  const bad = violations.filter(v => v.from === p.name)
                  return (
                    <Text wrap="truncate-end">
                      {'  '}
                      {p.name}
                      {p.references.length > 0 && <Text dimColor> → {p.references.join(', ')}</Text>}
                      {bad.length > 0 && <Text color="error"> ✗ {bad.map(v => v.rule).join('; ')}</Text>}
                    </Text>
                  )
                })}
              </Box>
            )
          })}
          <Text color={violations.length > 0 ? 'error' : 'success'}>
            {violations.length > 0 ? `${violations.length} layer violation(s)` : 'No layer violations in project references'}
          </Text>
        </Box>
      )
    }

    const pressure = await read($, pressureState)
    const health = await read($, healthState)
    const streak = await read($, streakState)
    const score = pressure?.score ?? 0
    return (
      <Box flexDirection="column">
        {header}
        <Text bold>
          pressure {score} {labelOf(score)}
          {pressure?.red === true && <Text color="error"> · red run</Text>}
        </Text>
        {(pressure?.events ?? []).slice().reverse().map(ev => (
          <Text wrap="truncate-end" dimColor>
            {ev.delta >= 0 ? '+' : ''}
            {ev.delta} {ev.kind}: {ev.detail} ({ageOf(now, ev.atMs)})
          </Text>
        ))}
        {(pressure?.events.length ?? 0) === 0 && <Text dimColor>No red dotnet run recorded this session.</Text>}
        <Text bold>build</Text>
        <Text color={(streak?.count ?? 0) > 0 ? 'error' : undefined}>
          {(streak?.count ?? 0) > 0
            ? `${streak?.count} consecutive failure(s), last ${ageOf(now, streak?.lastFailMs ?? now)}`
            : 'no failing streak'}
        </Text>
        <Text bold>mcp</Text>
        {(health?.servers.length ?? 0) === 0 && <Text dimColor>Not checked yet (checked at session start in a .NET project).</Text>}
        {(health?.servers ?? []).map(s => (
          <Text wrap="truncate-end" color={s.state === 'down' ? 'error' : s.reason === undefined ? 'success' : 'warning'}>
            {s.server} {s.state}
            {s.reason === undefined ? '' : ` (${s.reason})`} · {ageOf(now, s.checkedMs)}
          </Text>
        ))}
      </Box>
    )
  })
}

// Run by session-start.ts, which holds the module's one unmatched session.start hook. A function
// declaration, because the engine follows `$` across an import only into one.
export async function dashboardSessionStart($: Engine) {
  $.command.register({
    name: 'dnp-dashboard',
    description: 'Open the dotnet-pilot dashboard: telemetry, last review, architecture map',
    argumentHint: '[telemetry|review|architecture]',
    immediate: true,
  })
}
