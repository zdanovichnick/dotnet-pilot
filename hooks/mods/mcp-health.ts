import { read, update } from 'claude-code'
import type { Engine, On, SessionStartInput } from 'claude-code'

import type { McpServerHealth } from '../../types'
import { pressureSegment } from './pressure'
import { isDotNetProject } from './routing'
import { statusLine } from './status-line'

const healthState = { plugin: 'dotnet-pilot', key: 'mcpHealth' } as const
// Same ref as pressure.ts's; the engine's scan needs the literal in the file that reads it.
const pressureState = { plugin: 'dotnet-pilot', key: 'pressure' } as const

export const SERVERS = ['roslyn'] as const

// The lowest dnp-roslyn that serves every mcp__roslyn__* tool the agents whitelist: 0.5.0 added
// find_symbol, find_callers, find_dead_code, detect_antipatterns and detect_circular_dependencies.
export const MIN_ROSLYN_VERSION = '0.5'

export const PROBE_TIMEOUT_MS = 45000
const VERSION_TIMEOUT_MS = 10000
const DOCTOR_TIMEOUT_MS = 20000
const EXCERPT_LINES = 20

// get_solution_structure compiles every project; this walks project references only, and still
// fails when the solution does not load.
const PROBE_TOOL = 'detect_circular_dependencies'

const INSTALL = 'dotnet tool install -g DotnetPilot.Mcp.Roslyn'
const UPDATE = 'dotnet tool update -g DotnetPilot.Mcp.Roslyn'
// `$.mcp.connect` never respawns a server whose start failed; only Reconnect in `/mcp` does.
const RECONNECT = 'Reconnect roslyn in `/mcp`, then `/dnp-mcp retry` re-checks it.'
const DOCTOR_THEN_RETRY = `Run \`dnp-roslyn doctor\` in the solution directory and fix what it reports. ${RECONNECT}`

export const ADVICE: Record<string, string> = {
  unapproved: "Approve the plugin's MCP server in `/mcp`.",
  disabled: 'Enabled is off for roslyn in `/mcp`; turn it on.',
  policy: 'Blocked by managed policy. Ask an admin.',
  auth: 'Needs authentication (not expected for a stdio server); check `/mcp`.',
  unlisted: "Packaging bug: the plugin's `.mcp.json` lacks the server. Reinstall dotnet-pilot.",
  // A spawn failure cannot tell a missing tool from one whose folder is not on this process's PATH.
  'not installed': `\`dnp-roslyn\` could not be started. Install it with \`${INSTALL}\`, then ${RECONNECT} If it is installed, add the .NET global tools folder (\`~/.dotnet/tools\`) to PATH and restart Claude Code.`,
  'no MSBuild': `Install the .NET SDK (or Visual Studio Build Tools). ${RECONNECT}`,
  'no solution': 'Open Claude Code at the solution root, or call `reload_solution` with `solutionPath` set to the solution.',
  'version below minimum': `\`${UPDATE}\` (needs ${MIN_ROSLYN_VERSION} or later)`,
  'solution load failed': `dnp-roslyn could not load the solution; the doctor excerpt in \`/dnp-mcp\` says why. ${DOCTOR_THEN_RETRY}`,
  unresponsive: `The server started but did not answer within ${PROBE_TIMEOUT_MS / 1000} s; \`/dnp-mcp retry\` probes it again. If it stays silent, run \`dnp-roslyn doctor\` in the solution directory.`,
  'probe failed': `The server answered with an error. ${DOCTOR_THEN_RETRY}`,
  unprobed: 'Connected; solution loading is unchecked because `mcp__roslyn__*` is not allowed without a prompt. Allow it in `/permissions` to let `/dnp-mcp retry` probe the server.',
  'failure cached':
    'Claude Code skipped the start: it remembers a failed start for 15 minutes in every folder, and the failure may have come from another project. Reconnect roslyn in `/mcp` to start it now.',
  'doctor timed out': DOCTOR_THEN_RETRY,
  failed: DOCTOR_THEN_RETRY,
}

export const adviceOf = (reason: string | undefined) => (reason === undefined ? undefined : ADVICE[reason] ?? DOCTOR_THEN_RETRY)

type Verdict = Pick<McpServerHealth, 'state' | 'reason' | 'message' | 'doctor'>

const excerpt = (...texts: string[]) =>
  texts.join('\n').split(/\r?\n/).filter(l => l.trim() !== '').slice(0, EXCERPT_LINES).join('\n')

export const parseVersion = (text: string): number[] | undefined => {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text)
  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

export const isBelowMinimum = (version: number[]) => {
  const min = parseVersion(MIN_ROSLYN_VERSION) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (version[i] !== min[i]) return version[i] < min[i]
  }
  return false
}

const MSBUILD_MISSING = /No MSBuild instance found/i
const FAILURE_CACHED = /recent failure cached/i
// dnp-roslyn 0.5.3+ stays up outside a solution and answers every tool with this.
const NO_SOLUTION_LOADED = /No solution is loaded/i

// The model-facing tool name, by the same normalization `$.mcp.call` accepts for a server name.
export const probeToolName = (server: string) => `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__${PROBE_TOOL}`

async function runVersion($: Engine, cwd: string) {
  try {
    const r = await $.process.run(['dnp-roslyn', 'version'], { cwd, timeoutMs: VERSION_TIMEOUT_MS })
    return { started: true as const, stdout: r.stdout, stderr: r.stderr }
  } catch {
    return { started: false as const }
  }
}

// Runs when the connect failed: version first (a missing tool cannot start at all), then doctor.
async function diagnose($: Engine, cwd: string): Promise<Verdict> {
  const version = await runVersion($, cwd)
  if (!version.started) return { state: 'down', reason: 'not installed' }
  if (MSBUILD_MISSING.test(version.stderr)) return { state: 'down', reason: 'no MSBuild', doctor: excerpt(version.stderr) }
  const parsed = parseVersion(version.stdout)
  if (parsed !== undefined && isBelowMinimum(parsed)) return { state: 'down', reason: 'version below minimum', doctor: excerpt(version.stdout) }

  let out: string
  try {
    const r = await $.process.run(['dnp-roslyn', 'doctor'], { cwd, timeoutMs: DOCTOR_TIMEOUT_MS })
    out = excerpt(r.stdout, r.stderr)
  } catch {
    return { state: 'down', reason: 'doctor timed out' }
  }
  if (MSBUILD_MISSING.test(out)) return { state: 'down', reason: 'no MSBuild', doctor: out }
  if (/Solution:\s+NOT FOUND/.test(out)) return { state: 'down', reason: 'no solution', doctor: out }
  if (/Failed to load solution/.test(out)) return { state: 'down', reason: 'solution load failed', doctor: out }
  return { state: 'down', reason: 'failed', doctor: out }
}

const errorText = (content: readonly unknown[]) => {
  const text = content
    .map(b => (typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .join(' ')
    .trim()
  return text === '' ? undefined : text.slice(0, 300)
}

function withTimeout<T>($: Engine, ms: number, work: Promise<T>) {
  return new Promise<T | 'timeout'>((resolve, reject) => {
    const timer = $.clock.after(ms, () => resolve('timeout'))
    work.then(
      v => { timer.cancel(); resolve(v) },
      err => { timer.cancel(); reject(err) },
    )
  })
}

async function probe($: Engine, server: string, cwd: string): Promise<Verdict> {
  // `$.mcp.call` goes through the permission layer: probing on `ask` would open a dialog at session
  // start, and a headless run denies it, which says nothing about the server.
  const { decision, reason } = await $.tool.check({ tool: probeToolName(server), input: {} })
  let unprobed: Verdict | undefined
  if (decision === 'allow') {
    let result
    try {
      result = await withTimeout($, PROBE_TIMEOUT_MS, $.mcp.call(server, PROBE_TOOL, {}))
    } catch (err) {
      return { state: 'down', reason: 'probe failed', message: err instanceof Error ? err.message : undefined }
    }
    if (result === 'timeout') return { state: 'down', reason: 'unresponsive' }
    if (result.isError) {
      const text = errorText(result.content)
      return { state: 'down', reason: text !== undefined && NO_SOLUTION_LOADED.test(text) ? 'no solution' : 'probe failed', message: text }
    }
  } else {
    unprobed = { state: 'ok', reason: 'unprobed', message: reason }
  }

  // Connected; an old build still lacks tools the agents whitelist, and that outranks an unprobed server.
  const version = await runVersion($, cwd)
  const parsed = version.started ? parseVersion(version.stdout) : undefined
  if (parsed !== undefined && isBelowMinimum(parsed)) {
    return { state: 'ok', reason: 'version below minimum', doctor: version.started ? excerpt(version.stdout) : undefined }
  }
  return unprobed ?? { state: 'ok' }
}

async function showStatus($: Engine, withPressure: boolean) {
  const pressure = withPressure ? pressureSegment((await read($, pressureState))?.score ?? 0) : undefined
  await $.ui.status(statusLine(pressure, await read($, healthState)))
}

async function record($: Engine, server: string, verdict: Verdict) {
  const entry: McpServerHealth = { server, checkedMs: await $.clock.now(), ...verdict }
  for (const key of ['reason', 'message', 'doctor'] as const) if (entry[key] === undefined) delete entry[key]
  await update($, healthState, prev => ({
    servers: [...(prev?.servers ?? []).filter(s => s.server !== server), entry],
  }))
  return entry
}

async function checkServer($: Engine, name: string, cwd: string, withPressure: boolean) {
  const r = await $.mcp.connect(name)
  let verdict: Verdict
  if (r.isConnected) verdict = await probe($, r.server, cwd)
  else if (r.reason === 'failed') {
    verdict = { ...(await diagnose($, cwd)), message: r.message || undefined }
    // doctor found nothing wrong here: the engine did not try, it replayed a failure it cached.
    if (verdict.reason === 'failed' && FAILURE_CACHED.test(r.message)) verdict = { ...verdict, reason: 'failure cached' }
  }
  else verdict = { state: 'down', reason: r.reason, message: r.message || undefined }
  const entry = await record($, name, verdict)
  await showStatus($, withPressure)
  return entry
}

let inFlight = false

// 'always' at session start; 'newly down' after a failed tool call, so a server that was already
// reported down is not toasted again on every failing call.
type ToastWhen = 'always' | 'newly down' | 'never'

async function checkAll($: Engine, cwd: string, withPressure: boolean, toast: ToastWhen) {
  if (inFlight) return undefined
  inFlight = true
  try {
    const before = await read($, healthState)
    const entries: McpServerHealth[] = []
    for (const name of SERVERS) {
      const entry = await checkServer($, name, cwd, withPressure)
      entries.push(entry)
      const wasDown = before?.servers.some(s => s.server === name && s.state === 'down') === true
      const shouldToast = toast === 'always' || (toast === 'newly down' && entry.state === 'down' && !wasDown)
      if (shouldToast && entry.reason !== undefined && entry.reason !== 'unprobed') {
        $.ui.toast(`${name} ${entry.state === 'ok' ? 'outdated' : `unavailable (${entry.reason})`}: ${adviceOf(entry.reason)}`)
      }
    }
    return entries
  } finally {
    inFlight = false
  }
}

const describe = (s: McpServerHealth) => {
  const head = `${s.server}: ${s.state}${s.reason === undefined ? '' : ` (${s.reason})`}`
  const lines = [head]
  if (s.message !== undefined) lines.push(`  message: ${s.message}`)
  const advice = adviceOf(s.reason)
  if (advice !== undefined) lines.push(`  fix: ${advice}`)
  if (s.doctor !== undefined) lines.push('  dnp-roslyn output:', ...s.doctor.split('\n').map(l => `    ${l}`))
  return lines.join('\n')
}

export const registerMcpHealth = (on: On, opts: { pressure: boolean }) => {
  on('command.run', { command: 'dnp-mcp' }, async ($, e) => {
    if (e.args.trim() === 'retry') {
      const entries = await checkAll($, await $.session.cwd(), opts.pressure, 'never')
      if (entries === undefined) return { text: 'An MCP health check is already running; `/dnp-mcp` shows its result when it ends.' }
      return { text: entries.map(describe).join('\n') }
    }
    const health = await read($, healthState)
    if (health === undefined || health.servers.length === 0) {
      return { text: 'MCP health not checked yet (only checked at session start in a .NET project). `/dnp-mcp retry` checks now.' }
    }
    return { text: health.servers.map(describe).join('\n') }
  })

  // tool.call, not classic.PostToolUseFailure: an enterprise's builtin plugin seated outermost hooks
  // classic.* and continues past user-tier hooks there. Only servers already checked are re-checked,
  // so a non-.NET session never starts one here.
  on('tool.call', { tool: /^mcp__(?:[A-Za-z0-9-]+_)*roslyn__/ }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError === true) {
      const health = await read($, healthState)
      if ((health?.servers.length ?? 0) > 0) {
        void $.session.cwd().then(cwd => checkAll($, cwd, opts.pressure, 'newly down')).catch(() => undefined)
      }
    }
    return ran
  }).catch(($, e, next) => next(e))
}

// The tool.call matcher above, written there as a literal because the engine reads matchers
// statically. `mcp__<server>__<tool>` normalized as probeToolName does: a plugin's server
// `plugin:<plugin>:roslyn` becomes `plugin_<plugin>_roslyn`.
export const SERVER_TOOL = /^mcp__(?:[A-Za-z0-9-]+_)*roslyn__/

// Run by session-start.ts, which holds the module's one unmatched session.start hook. A function
// declaration, because the engine follows `$` across an import only into one.
export async function mcpHealthSessionStart($: Engine, e: SessionStartInput, opts: { pressure: boolean }) {
  $.command.register({
    name: 'dnp-mcp',
    description: 'Show Roslyn MCP health; `/dnp-mcp retry` re-checks it',
    argumentHint: '[retry]',
    immediate: true,
  })
  if (!(await isDotNetProject($, e.cwd))) return
  // Not awaited: the probe and doctor can outlast the session.start hook's budget.
  void checkAll($, e.cwd, opts.pressure, 'always').catch(() => undefined)
}
