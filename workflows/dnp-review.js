export const meta = {
  name: 'dnp-review',
  description: 'Sharded .NET code review: haiku scouts per diff shard, opus confirmers per finding, one deterministic digest',
  whenToUse: 'Started by /dotnet-pilot:quality:review after its preflight has written diff shards and a manifest; it has nothing to read without those args.',
  phases: [
    { title: 'Scout', detail: 'one haiku reader per shard, primed with the matching skill packs', model: 'haiku' },
    { title: 'Confirm', detail: 'one adversarial opus check per deduplicated finding; security / performance / DI / architecture findings go to their specialist agent', model: 'opus' },
    { title: 'Report', detail: 'deterministic digest; a narrator only when three or more findings survive', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// Tables. Everything that decides *what* gets reviewed and *how* lives here so
// two runs over the same manifest make the same decisions.
// ---------------------------------------------------------------------------

const SEVERITIES = ['critical', 'high', 'medium', 'low']
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

const CATEGORIES = {
  correctness: {
    packs: ['error-handling'],
    hint: 'Trace the actual control flow; a bug must be reachable from the changed code, not hypothetical.',
  },
  async: {
    packs: ['modern-csharp'],
    hint: 'Confirm the blocking call or missing CancellationToken sits on a request/service path, not a console or test entry point.',
  },
  di: {
    packs: ['clean-architecture'],
    hint: 'Search every *Extensions.cs and Program.cs for the registration before calling it missing; check both lifetimes of a suspected captive dependency.',
    agentType: 'dotnet-pilot:dnp-di-wiring-checker',
  },
  ef: {
    packs: ['ef-core-patterns'],
    hint: 'Check whether the query is read-only (AsNoTracking) and whether the loop really issues one query per iteration.',
  },
  security: {
    packs: ['authentication', 'aspnet-api-patterns'],
    hint: 'Name the trust boundary: attacker-controlled input has to reach the sink for this to be real.',
    agentType: 'dotnet-pilot:dnp-security-auditor',
  },
  performance: {
    packs: ['caching', 'ef-core-patterns'],
    hint: 'Decide whether the path is hot; allocations in startup or one-shot code are not findings.',
    agentType: 'dotnet-pilot:dnp-performance-analyst',
  },
  architecture: {
    packs: ['clean-architecture', 'ddd'],
    hint: 'Verify the project reference direction in the .csproj files, not just the namespace of the type.',
    agentType: 'dotnet-pilot:dnp-architect',
  },
  testing: {
    packs: ['testing-dotnet'],
    hint: 'A missing test is a finding only when the change adds behaviour with no covering test in the diff or the repository.',
  },
  logging: {
    packs: ['logging'],
    hint: 'PII or a secret in a log call must be a real value flowing in, not a correlation id or a type name.',
  },
  style: {
    packs: ['modern-csharp'],
    hint: 'Confirm only when the code contradicts the convention of the surrounding file.',
  },
}
const CATEGORY_NAMES = Object.keys(CATEGORIES)

const BASE_PACKS = ['modern-csharp']
const MAX_PACKS_PER_SCOUT = 4
const PATH_PACKS = [
  { pattern: /(^|\/)(Controllers?|Endpoints?|Middleware|Filters)\//i, packs: ['aspnet-api-patterns', 'error-handling'] },
  { pattern: /(^|\/)(Program|Startup)\.cs$|Extensions\.cs$/i, packs: ['aspnet-api-patterns', 'clean-architecture'] },
  { pattern: /DbContext|(^|\/)(Data|Persistence|Repositories|Configurations)\/|EntityTypeConfiguration/i, packs: ['ef-core-patterns'] },
  { pattern: /(^|\/)[^/]*Tests?\//i, packs: ['testing-dotnet'] },
  { pattern: /Auth|Identity|Jwt|Token|Claims/i, packs: ['authentication'] },
  { pattern: /Cach/i, packs: ['caching'] },
  { pattern: /Polly|Resilien|HttpClient|Retry/i, packs: ['resilience'] },
  { pattern: /(^|\/)Domain\/|Aggregate|ValueObject|(^|\/)Entities\//i, packs: ['ddd', 'clean-architecture'] },
  { pattern: /(^|\/)Features\//i, packs: ['vertical-slice'] },
  { pattern: /Logg|Serilog|Telemetry|Tracing|OpenTelemetry/i, packs: ['logging', 'opentelemetry'] },
  { pattern: /appsettings[^/]*\.json$/i, packs: ['authentication', 'logging'] },
]

const SKIP_RULES = [
  { name: 'generated code', pattern: /\.(g|generated|designer)\.cs$|\.Designer\.cs$|AssemblyInfo\.cs$|GlobalUsings\.g\.cs$/i },
  { name: 'EF migration', pattern: /(^|\/)Migrations\// },
  { name: 'build output', pattern: /(^|\/)(bin|obj)\// },
  { name: 'lockfile', pattern: /(^|\/)(packages\.lock\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|composer\.lock|Cargo\.lock)$/i },
  { name: 'minified asset', pattern: /\.min\.(js|css)$/i },
  { name: 'not .NET source', pattern: /\.(tsx?|jsx?|mjs|cjs|css|scss|less|html?|md|svg|png|jpe?g|gif|ico|woff2?|ttf|map|snap)$/i },
]

// maxAgents bounds every spawn in the run, retries included; maxScouts bounds
// shard readers so confirmers keep a share of the budget. The shard inventory
// arrives in args from the preflight, so no agent is spent relaying it.
const DEPTH = {
  quick: { maxAgents: 6, maxScouts: 6, confirm: false, route: false, lenses: false },
  standard: { maxAgents: 11, maxScouts: 6, confirm: true, route: true, lenses: false },
  deep: { maxAgents: 20, maxScouts: 7, confirm: true, route: true, lenses: true },
}

const LENSES = [
  { name: 'security', categories: ['security'], packs: ['authentication', 'aspnet-api-patterns'] },
  { name: 'performance', categories: ['performance', 'ef', 'async'], packs: ['caching', 'ef-core-patterns'] },
  { name: 'architecture', categories: ['architecture', 'di'], packs: ['clean-architecture', 'ddd'] },
  { name: 'testing', categories: ['testing'], packs: ['testing-dotnet'] },
]

const REQUIRED_ARGS = ['manifestPath', 'diffPath', 'shardsDir', 'repoRoot', 'skillsDir', 'runId', 'fileCount', 'depth', 'roslynAvailable']
// Two readers rarely agree on the exact line of one issue; findings in the same
// file and category this close together are treated as one.
const DEDUP_LINE_TOLERANCE = 2
const NARRATOR_MIN_CONFIRMED = 3
const NARRATOR_MAX_LINES = 12
// A confirmation has to point at something a reader can open.
const CITATION = /[\w\-.\/\\]+\.[A-Za-z0-9]+:\d+/

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    line: { type: 'integer' },
    category: { type: 'string', enum: CATEGORY_NAMES },
    severity: { type: 'string', enum: SEVERITIES },
    title: { type: 'string' },
    evidence: { type: 'string' },
    skill: { type: 'string' },
  },
  required: ['file', 'category', 'severity'],
}

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    shard: { type: 'string' },
    findings: { type: 'array', items: FINDING_SCHEMA },
  },
  required: ['shard', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted'] },
    method: { type: 'string' },
    reason: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['verdict', 'method'],
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0 }
function joinPath(base, ...parts) {
  const sep = base.includes('\\') ? '\\' : '/'
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep)
}
function skillFile(skillsDir, pack) { return joinPath(skillsDir, pack, 'SKILL.md') }
function shardName(shardPath) { return String(shardPath).split(/[\\/]/).pop().replace(/\.patch$/i, '') }
function oneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim() }
function clampLines(text, max) { return String(text).trim().split('\n').slice(0, max).join('\n') }
function location(f) { return f.line == null ? f.file : `${f.file}:${f.line}` }
function shortAgent(agentType) { return String(agentType).split(':').pop() }

function findingOrder(a, b) {
  return cmp(a.file, b.file)
    || cmp(a.line == null ? -1 : a.line, b.line == null ? -1 : b.line)
    || cmp(a.category, b.category)
    || cmp(a.title || '', b.title || '')
}
function severityOrder(a, b) {
  return cmp(SEVERITY_RANK[a.severity], SEVERITY_RANK[b.severity]) || findingOrder(a, b)
}
function findingKey(f) { return `${f.file}|${f.line == null ? '-' : f.line}|${f.category}` }

// Remembers every kept finding by file and category; a new one folds into an
// earlier one when both lack a line or their lines are within the tolerance.
function makeDeduper() {
  const kept = new Map()
  return function isDuplicate(f) {
    const group = `${f.file}|${f.category}`
    if (!kept.has(group)) kept.set(group, [])
    const lines = kept.get(group)
    const dup = lines.some(l => (l == null || f.line == null) ? l === f.line : Math.abs(l - f.line) <= DEDUP_LINE_TOLERANCE)
    if (!dup) lines.push(f.line)
    return dup
  }
}
function skipRuleFor(file) { return SKIP_RULES.find(r => r.pattern.test(file)) || null }

function packsFor(files, extra) {
  const ordered = [...BASE_PACKS]
  for (const file of files) {
    for (const rule of PATH_PACKS) {
      if (!rule.pattern.test(file)) continue
      for (const pack of rule.packs) if (!ordered.includes(pack)) ordered.push(pack)
    }
  }
  for (const pack of extra || []) if (!ordered.includes(pack)) ordered.push(pack)
  return ordered
}

function evenSplit(total, buckets) {
  const out = []
  for (let i = 0; i < buckets; i++) out.push(Math.floor(total / buckets) + (i < total % buckets ? 1 : 0))
  return out
}

// Scouts sometimes answer with a bare file name or an absolute path; map it
// back onto a path the manifest knows, or null when it is outside the shard.
function resolveFile(given, fileSet, repoRoot) {
  let p = String(given).replace(/\\/g, '/').replace(/^\.\//, '')
  const root = String(repoRoot).replace(/\\/g, '/').replace(/\/+$/, '')
  if (root && p.toLowerCase().startsWith(root.toLowerCase() + '/')) p = p.slice(root.length + 1)
  if (!fileSet) return p
  if (fileSet.has(p)) return p
  const suffix = '/' + p
  const hits = [...fileSet].filter(known => known.endsWith(suffix))
  return hits.length === 1 ? hits[0] : null
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function scoutPrompt(unit, ctx, attempt) {
  const packs = packsFor(unit.files)
  const kept = packs.slice(0, MAX_PACKS_PER_SCOUT)
  if (packs.length > kept.length) log(`${unit.name}: skill packs capped at ${MAX_PACKS_PER_SCOUT}, dropped ${packs.slice(MAX_PACKS_PER_SCOUT).join(', ')}`)
  const ignored = unit.shards.flatMap(s => s.files.filter(p => !s.active.includes(p)))
  return [
    'You are a .NET code-review scout. Read the diff shard file(s) below and return candidate findings as structured output. Precision over volume: every finding needs a concrete line you can point at, because each one is checked against the source afterwards.',
    '',
    'Shard patch file(s):',
    ...unit.shards.map(s => `- ${s.path}`),
    unit.files.length
      ? `Files in scope (repo-relative): ${unit.files.join(', ')}`
      : 'Files in scope: every file in the patch; the shard inventory was unusable, so report repo-relative paths exactly as the patch headers spell them.',
    ignored.length ? `Ignore these paths even though they appear in the patch: ${ignored.join(', ')}` : null,
    `Repository root: ${ctx.repoRoot}. Open the real file under it whenever the patch lacks context, and report "line" as the current line number in that file (the number Read prints), not an offset inside the diff.`,
    '',
    'Read these skill packs first; they define what counts as a finding in this codebase:',
    ...kept.map(p => `- ${skillFile(ctx.skillsDir, p)}`),
    '',
    `Categories (exactly one per finding): ${CATEGORY_NAMES.join(', ')}. Severity: ${SEVERITIES.join(' | ')}.`,
    'Rules: only issues introduced or touched by the changed lines; one finding per issue; "title" in twelve words or fewer; "evidence" quotes the offending line; "skill" names the pack a finding rests on when one applies; a missing test counts only when new behaviour has no covering test in the diff or repository; a style finding only when it contradicts the surrounding file. An empty findings array is the correct answer for a clean shard.',
    `Set "shard" to "${unit.name}".`,
    attempt ? 'Second attempt; the first returned nothing.' : null,
  ].filter(Boolean).join('\n')
}

function lensPrompt(lens, ctx, attempt) {
  return [
    `You are a .NET code-review scout looking through one lens: ${lens.name}. Read the whole diff and report only ${lens.categories.join('/')} findings as structured output.`,
    `Diff: ${ctx.diffPath}`,
    `Repository root: ${ctx.repoRoot}. Open real files for context and report "line" as the current line number in the file, not an offset inside the diff.`,
    'Ignore generated code, Migrations/, bin/ and obj/ output, lockfiles and non-.NET assets (ts/tsx/js/css/html/md/images); findings there are discarded.',
    'Read first:',
    ...lens.packs.map(p => `- ${skillFile(ctx.skillsDir, p)}`),
    `Categories allowed: ${lens.categories.join(', ')}. Severity: ${SEVERITIES.join(' | ')}.`,
    'Rules: only issues introduced or touched by the changed lines; one finding per issue; "title" in twelve words or fewer; "evidence" quotes the offending line. An empty findings array is the correct answer when the lens finds nothing.',
    `Set "shard" to "lens:${lens.name}".`,
    attempt ? 'Second attempt; the first returned nothing.' : null,
  ].filter(Boolean).join('\n')
}

function confirmPrompt(f, ctx, attempt) {
  const cat = CATEGORIES[f.category]
  return [
    'You are checking a candidate finding that a fast scout flagged in a diff. Scouts over-report, so judge it on the evidence in the source, not on how the finding is worded.',
    'Confirm it when the code you opened shows the defect on the changed lines. Refute it when the code does not bear it out: the problem is pre-existing and untouched by the change, hypothetical, or already handled by a caller, filter or middleware. Either way "method" cites the path:line you read; a confirmation without a file:line citation is counted as refuted.',
    '',
    `Finding: ${JSON.stringify({ file: f.file, line: f.line, category: f.category, severity: f.severity, title: f.title, evidence: f.evidence })}`,
    `Source file: ${joinPath(ctx.repoRoot, ...f.file.split('/'))}`,
    `Diff context: ${f.shardPath || ctx.diffPath}`,
    `Category guidance: ${cat.hint}`,
    `Reference: ${cat.packs.map(p => skillFile(ctx.skillsDir, p)).join(', ')}`,
    f.routedTo ? `Scope: you are the ${shortAgent(f.routedTo)} specialist for this one finding; judge it alone, with no solution-wide audit or report.` : null,
    ctx.roslyn
      ? 'Roslyn: mcp__roslyn__* tools can be loaded with ToolSearch when a semantic check (references, DI registrations, call sites) settles the question faster than grep.'
      : 'Roslyn: mcp__roslyn__* tools are not available in this session; use Read and Grep.',
    'Return: verdict; method (how you checked, with path:line); reason (why it is refuted, or the residual doubt if confirmed); fix (one line, only when confirmed).',
    attempt ? 'Second attempt; the first returned nothing.' : null,
  ].filter(Boolean).join('\n')
}

function narratorPrompt(confirmed) {
  const compact = confirmed.map(f => ({ file: f.file, line: f.line, severity: f.severity, category: f.category, title: f.title, fix: f.fix || undefined }))
  return [
    `Confirmed code-review findings for one change set, as JSON:\n${JSON.stringify(compact)}`,
    '',
    `Write at most ${NARRATOR_MAX_LINES} lines of plain prose for the developer who made the change: the dominant theme or two, the single riskiest item and why, and the order in which to fix things. No headings, no bullet-per-finding restatement, no praise, no preamble. Your text is the return value.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Agent ledger: every spawn goes through runKeyed so caps, retries and
// failures are counted in one place and nothing is dropped silently.
// ---------------------------------------------------------------------------

const ledger = { cap: 0, spawns: 0, requested: 0, returned: 0, failed: [] }
function slotsLeft() { return ledger.cap - ledger.spawns }

async function runKeyed(unit, spawn, critical) {
  ledger.requested += 1
  const reasons = []
  let result = null
  for (let attempt = 0; attempt < 2 && result == null; attempt++) {
    if (slotsLeft() <= 0) {
      reasons.push(attempt === 0 ? 'agent cap reached before it could start' : 'no slot left for a retry')
      break
    }
    ledger.spawns += 1
    try {
      result = await spawn(attempt)
    } catch (err) {
      result = null
      reasons.push(`threw: ${err && err.message ? err.message : String(err)}`)
    }
    if (result == null) {
      if (reasons.length === attempt) reasons.push('returned nothing')
      if (attempt === 0 && slotsLeft() > 0) log(`${unit}: ${reasons[reasons.length - 1]}; retrying once`)
    }
  }
  if (result == null) {
    const reason = reasons.join('; ')
    ledger.failed.push({ unit, critical: Boolean(critical), reason })
    log(`${unit}: FAILED (${reason})`)
    return null
  }
  ledger.returned += 1
  return result
}

// ---------------------------------------------------------------------------
// Inventory: the preflight's shards and files arrive in args. Validate them,
// and fall back without hiding it.
// ---------------------------------------------------------------------------

// Accepts the array itself or, defensively, a JSON string of it.
function argArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    return null
  }
}

// Fatal problems mean the inventory cannot drive the scouts; soft ones are
// files it lists but no shard covers, which the report names as gaps without
// throwing away everything else.
function inventoryProblems(inv, expected) {
  if (!inv) {
    const fatal = ['args.files or args.shards is missing or not an array']
    return { fatal, soft: [], all: fatal }
  }
  const fatal = []
  const soft = []
  if (inv.files.length !== expected) fatal.push(`args.files lists ${inv.files.length} files, fileCount says ${expected}`)
  const badFiles = inv.files.filter(f => !f || typeof f.path !== 'string' || !f.path).length
  if (badFiles) fatal.push(`${badFiles} file entr${badFiles === 1 ? 'y has' : 'ies have'} no path`)
  const sharded = new Set()
  for (const sh of inv.shards) {
    if (!sh || typeof sh.path !== 'string' || !sh.path) { fatal.push('a shard has no path'); continue }
    if (!Array.isArray(sh.files) || !sh.files.length || sh.files.some(p => typeof p !== 'string')) fatal.push(`shard ${sh.path} lists no valid files`)
    else for (const p of sh.files) sharded.add(p)
  }
  if (fatal.length) return { fatal, soft, all: fatal }
  const known = new Set(inv.files.map(f => f.path))
  for (const f of inv.files) if (!f.binary && !sharded.has(f.path)) soft.push(`${f.path} is in no shard`)
  for (const p of sharded) if (!known.has(p)) fatal.push(`${p} is sharded but not listed in files`)
  return { fatal, soft, all: [...fatal, ...soft] }
}

function normalizeShards(shards) {
  return shards
    .map(sh => ({
      name: sh.name || shardName(sh.path),
      path: sh.path,
      files: [...new Set(sh.files)].sort(cmp),
      lineCount: Number.isInteger(sh.lineCount) ? sh.lineCount : 0,
    }))
    .sort((a, b) => cmp(a.name, b.name))
}

function shardsFromFileMap(files) {
  const byPath = new Map()
  for (const f of files) {
    if (f.binary || !f.shardPath) continue
    if (!byPath.has(f.shardPath)) byPath.set(f.shardPath, { path: f.shardPath, files: [], lineCount: 0 })
    const sh = byPath.get(f.shardPath)
    sh.files.push(f.path)
    sh.lineCount += Number.isInteger(f.lineCount) ? f.lineCount : 0
  }
  return byPath.size ? [...byPath.values()] : null
}

function inventory(ctx, a) {
  const files = argArray(a.files)
  const shards = argArray(a.shards)
  const problems = inventoryProblems(files && shards ? { files, shards } : null, ctx.fileCount)
  if (!problems.fatal.length) {
    if (problems.soft.length) log(`inventory: ${problems.soft.length} file(s) sit in no shard; the report lists them under coverage gaps`)
    return { shards: normalizeShards(shards), files, note: null }
  }

  const usableFiles = files ? files.filter(f => f && typeof f.path === 'string' && f.path) : []
  const grouped = usableFiles.length === ctx.fileCount ? shardsFromFileMap(usableFiles) : null
  if (grouped) {
    log(`inventory: ${problems.fatal[0]}; using the per-file shardPath grouping instead of the shards list`)
    return { shards: normalizeShards(grouped), files: usableFiles, note: 'shard list rebuilt from per-file shardPath entries' }
  }

  const reason = `shard inventory unusable: ${problems.fatal.slice(0, 3).join('; ')} (manifest: ${ctx.manifestPath})`
  ledger.failed.push({ unit: 'inventory', critical: true, reason })
  log(`inventory: ${reason}; reviewing diff.patch as a single unit with no file inventory`)
  return {
    shards: [{ name: 'diff', path: ctx.diffPath, files: usableFiles.map(f => f.path), lineCount: 0 }],
    files: usableFiles,
    note: reason,
    inventoryUnknown: true,
  }
}

// ---------------------------------------------------------------------------
// Scout units: apply skip rules, then fold shards into at most maxScouts
// readers (largest shard first into the least-loaded unit).
// ---------------------------------------------------------------------------

// Seats kept for the stages that run after the first scout wave: the lens
// sweeps and, when findings are confirmed, the narrator.
function scoutReserve(depthCfg) {
  return (depthCfg.lenses ? LENSES.length : 0) + (depthCfg.confirm ? 1 : 0)
}

function buildScoutUnits(shards, depthCfg, inventoryUnknown) {
  const skipped = new Map()
  const classified = shards.map(s => {
    const active = s.files.filter(p => {
      const rule = skipRuleFor(p)
      if (rule) skipped.set(p, rule.name)
      return !rule
    })
    return { ...s, active: inventoryUnknown && !active.length ? s.files : active }
  })
  const live = classified.filter(s => s.active.length || inventoryUnknown)
  for (const s of classified) if (!s.active.length && !inventoryUnknown) log(`${s.name}: not scouted; every file in it matches a skip rule`)

  // Every first attempt needs a seat, so the unit count comes from the slots
  // actually left, not from maxScouts alone.
  const count = Math.min(depthCfg.maxScouts, Math.max(1, slotsLeft() - scoutReserve(depthCfg)), live.length)
  const units = []
  for (let i = 0; i < count; i++) units.push({ index: i, shards: [], lineCount: 0 })
  const ordered = live.slice().sort((a, b) => b.lineCount - a.lineCount || cmp(a.name, b.name))
  for (const s of ordered) {
    let target = units[0]
    for (const u of units) if (u.lineCount < target.lineCount) target = u
    target.shards.push(s)
    target.lineCount += s.lineCount
  }
  if (live.length > count) log(`${live.length} shards folded into ${count} scout units (depth cap ${depthCfg.maxAgents} agents)`)
  for (const u of units) {
    u.shards.sort((a, b) => cmp(a.name, b.name))
    u.name = u.shards.length === 1 ? u.shards[0].name : `${u.shards[0].name}+${u.shards.length - 1}`
    u.files = u.shards.flatMap(s => s.active)
    u.fileSet = inventoryUnknown ? null : new Set(u.files)
  }
  return { units, skipped }
}

function normalizeFindings(raw, unit, ctx) {
  const out = []
  let dropped = 0
  const list = raw && Array.isArray(raw.findings) ? raw.findings : []
  for (const f of list) {
    if (!f || typeof f.file !== 'string') { dropped++; continue }
    const file = resolveFile(f.file, unit.fileSet, ctx.repoRoot)
    if (!file || skipRuleFor(file)) { dropped++; continue }
    const category = CATEGORY_NAMES.includes(f.category) ? f.category : 'correctness'
    const severity = SEVERITIES.includes(f.severity) ? f.severity : 'medium'
    const line = Number.isInteger(f.line) && f.line > 0 ? f.line : null
    const shard = unit.shards.find(s => s.files.includes(file)) || unit.shards[0]
    out.push({
      file,
      line,
      category,
      severity,
      title: oneLine(f.title) || `${category} issue`,
      evidence: oneLine(f.evidence),
      skill: oneLine(f.skill),
      source: unit.name,
      shardPath: shard ? shard.path : null,
      verdict: 'pending',
      note: '',
    })
  }
  if (dropped) log(`${unit.name}: dropped ${dropped} finding(s) that were malformed, outside the unit's files, or on skipped paths`)
  return out
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

async function confirmFinding(f, ctx, depthCfg) {
  const cat = CATEGORIES[f.category]
  const routed = depthCfg.route && cat.agentType ? cat.agentType : null
  const opts = {
    label: `confirm ${f.file.split('/').pop()}:${f.line == null ? '?' : f.line} ${f.category}`,
    phase: 'Confirm',
    // Overrides a routed agent's frontmatter model: the confirmer is the precision gate.
    model: 'opus',
    schema: VERDICT_SCHEMA,
  }
  if (routed) opts.agentType = routed
  f.routedTo = routed
  if (slotsLeft() <= 0) {
    f.verdict = 'unconfirmed'
    f.note = 'agent cap reached'
    return f
  }
  const verdict = await runKeyed(`confirm:${f.key}`, attempt => agent(confirmPrompt(f, ctx, attempt), opts), false)
  if (!verdict) {
    f.verdict = 'unconfirmed'
    f.note = 'confirmer returned nothing'
    return f
  }
  f.method = oneLine(verdict.method)
  f.reason = oneLine(verdict.reason)
  f.fix = oneLine(verdict.fix)
  if (verdict.verdict === 'confirmed' && !CITATION.test(f.method)) {
    f.verdict = 'refuted'
    f.reason = `confirmer cited no file:line (${f.method.slice(0, 80)})`
    log(`confirm:${f.key}: confirmation discarded, no file:line citation`)
  } else {
    f.verdict = verdict.verdict
  }
  return f
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function coverageGaps(state) {
  const gaps = []
  const byRule = new Map()
  for (const [file, rule] of state.skipped) {
    if (!byRule.has(rule)) byRule.set(rule, [])
    byRule.get(rule).push(file)
  }
  for (const rule of [...byRule.keys()].sort(cmp)) gaps.push(`skipped by rule (${rule}): ${byRule.get(rule).sort(cmp).join(', ')}`)

  const binary = state.files.filter(f => f.binary).map(f => f.path).sort(cmp)
  if (binary.length) gaps.push(`binary, not reviewed: ${binary.join(', ')}`)
  if (!state.inventoryUnknown) {
    const scouted = new Set(state.units.flatMap(u => u.files))
    const uncovered = state.files.filter(f => !f.binary && !state.skipped.has(f.path) && !scouted.has(f.path)).map(f => f.path).sort(cmp)
    if (uncovered.length) gaps.push(`in no shard, not reviewed: ${uncovered.join(', ')}`)
  }

  if (state.inventoryNote) gaps.push(`inventory: ${state.inventoryNote}`)
  for (const fail of state.failed) {
    if (fail.unit.startsWith('scout:')) {
      const unit = state.units.find(u => `scout:${u.name}` === fail.unit)
      gaps.push(`not reviewed, scout ${fail.unit.slice(6)} failed (${fail.reason}): ${unit ? unit.files.join(', ') : 'files unknown'}`)
    } else if (fail.unit.startsWith('lens:')) {
      gaps.push(`${fail.unit} sweep failed (${fail.reason}); shard-scout coverage is reported separately`)
    } else if (fail.unit === 'narrator') {
      gaps.push(`narrator failed (${fail.reason})`)
    }
  }
  const capped = state.unconfirmed.filter(f => f.note === 'agent cap reached').length
  if (capped) gaps.push(`${capped} finding(s) not confirmed: depth ${state.depth} allows ${state.cap} agents`)
  const failedConfirms = state.unconfirmed.filter(f => f.note === 'confirmer returned nothing').length
  if (failedConfirms) gaps.push(`${failedConfirms} finding(s) not confirmed: confirmer returned nothing`)
  if (state.depth === 'quick' && state.unconfirmed.length) gaps.push('depth quick runs scouts only; nothing above was verified against the source')
  return gaps
}

function renderFinding(f, withVerification) {
  const lines = [`- **${f.severity.toUpperCase()}** \`${location(f)}\` ${f.category} — ${f.title}${!withVerification && f.note ? ` _(${f.note})_` : ''}`]
  if (f.evidence) lines.push(`  - evidence: ${f.evidence}`)
  if (withVerification && f.method) lines.push(`  - verified: ${f.method}${f.routedTo ? ` (${shortAgent(f.routedTo)})` : ''}`)
  if (withVerification && f.fix) lines.push(`  - fix: ${f.fix}`)
  return lines
}

function renderMarkdown(state) {
  const out = []
  out.push(`## dnp-review ${state.runId} — depth ${state.depth} · ${state.fileCount} files · ${state.shardCount} shards · agents ${state.returned}/${state.requested} returned · ${state.confirmed.length} confirmed · ${state.refuted.length} refuted · ${state.unconfirmed.length} unconfirmed${state.broken ? ' · COVERAGE INCOMPLETE' : ''}`)
  out.push('', `### Confirmed (${state.confirmed.length})`)
  if (!state.confirmed.length) out.push('none')
  for (const f of state.confirmed) out.push(...renderFinding(f, true))
  out.push('', `### Refuted: ${state.refuted.length}`)
  out.push('', `### Unconfirmed (${state.unconfirmed.length})`)
  if (!state.unconfirmed.length) out.push('none')
  for (const f of state.unconfirmed) out.push(...renderFinding(f, false))
  out.push('', '### Coverage gaps')
  const gaps = coverageGaps(state)
  if (!gaps.length) out.push('none')
  for (const g of gaps) out.push(`- ${g}`)
  out.push('', '### Narrator')
  out.push(state.narrator ? state.narrator : `(${state.narratorNote})`)
  return out.join('\n') + '\n'
}

function finish(state) {
  state.requested = ledger.requested
  state.returned = ledger.returned
  state.failed = ledger.failed.slice().sort((a, b) => cmp(a.unit, b.unit))
  state.broken = state.failed.some(f => f.critical)
  state.confirmed = state.findings.filter(f => f.verdict === 'confirmed').sort(findingOrder)
  state.refuted = state.findings.filter(f => f.verdict === 'refuted').sort(findingOrder)
  state.unconfirmed = state.findings.filter(f => f.verdict !== 'confirmed' && f.verdict !== 'refuted').sort(findingOrder)
  for (const f of state.unconfirmed) if (f.verdict === 'pending') f.verdict = 'unconfirmed'
  const markdown = renderMarkdown(state)
  const summary = `dnp-review ${state.runId}: agents ${state.returned}/${state.requested} returned, ${state.failed.length} failed${state.broken ? ' (coverage incomplete)' : ''}; ${state.confirmed.length} confirmed / ${state.refuted.length} refuted / ${state.unconfirmed.length} unconfirmed`
  return {
    ok: state.ok,
    runId: state.runId,
    depth: state.depth,
    fileCount: state.fileCount,
    shardCount: state.shardCount,
    requested: state.requested,
    returned: state.returned,
    failed: state.failed,
    broken: state.broken,
    confirmed: state.confirmed,
    refuted: state.refuted,
    unconfirmed: state.unconfirmed,
    summary,
    markdown,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const a = args && typeof args === 'object' ? args : {}
  const missing = REQUIRED_ARGS.filter(k => a[k] === undefined || a[k] === null || a[k] === '')
  if (!missing.length && !DEPTH[a.depth]) missing.push(`depth (got "${a.depth}", expected quick|standard|deep)`)
  if (missing.length) {
    return {
      ok: false,
      runId: a.runId || null,
      requested: 0,
      returned: 0,
      failed: [],
      broken: true,
      confirmed: [],
      refuted: [],
      unconfirmed: [],
      summary: 'dnp-review did not start: missing args',
      markdown: `Run /dotnet-pilot:quality:review instead of starting this workflow directly; its preflight writes the diff shards and manifest this script needs. Missing or invalid args: ${missing.join(', ')}.\n`,
    }
  }

  const depth = a.depth
  const depthCfg = DEPTH[depth]
  const ctx = {
    manifestPath: a.manifestPath,
    diffPath: a.diffPath,
    shardsDir: a.shardsDir,
    repoRoot: a.repoRoot,
    skillsDir: a.skillsDir,
    runId: a.runId,
    fileCount: Number(a.fileCount),
    roslyn: a.roslynAvailable === true || a.roslynAvailable === 'true',
  }
  ledger.cap = depthCfg.maxAgents

  const state = {
    ok: true,
    runId: ctx.runId,
    depth,
    cap: depthCfg.maxAgents,
    fileCount: ctx.fileCount,
    shardCount: 0,
    files: [],
    units: [],
    skipped: new Map(),
    findings: [],
    inventoryNote: null,
    inventoryUnknown: false,
    narrator: null,
    narratorNote: 'skipped: no findings',
  }

  if (!ctx.fileCount) {
    state.narratorNote = 'skipped: nothing to review'
    log('nothing to review: the manifest lists no files')
    return finish(state)
  }

  const inv = inventory(ctx, a)
  state.files = inv.files
  state.inventoryNote = inv.note
  state.inventoryUnknown = Boolean(inv.inventoryUnknown)
  state.shardCount = inv.shards.length

  // Scout units and confirm quotas are fixed before any scout runs so the set
  // of findings that gets confirmed does not depend on which shard finishes first.
  const { units, skipped } = buildScoutUnits(inv.shards, depthCfg, state.inventoryUnknown)
  state.units = units
  state.skipped = skipped
  log(`${inv.shards.length} shards → ${units.length} scout unit(s); ${skipped.size} file(s) skipped by rule; depth ${depth} (≤${depthCfg.maxAgents} agents)`)

  const reservedAfterScouts = units.length + (depthCfg.lenses ? LENSES.length : 0) + 1
  const confirmSlots = depthCfg.confirm ? Math.max(0, slotsLeft() - reservedAfterScouts) : 0
  const quota = evenSplit(confirmSlots, Math.max(1, units.length))
  const isDuplicate = makeDeduper()

  const scoutStage = async (unit) => {
    const raw = await runKeyed(
      `scout:${unit.name}`,
      attempt => agent(scoutPrompt(unit, ctx, attempt), { label: `scout ${unit.name}`, phase: 'Scout', model: 'haiku', schema: SCOUT_SCHEMA }),
      true,
    )
    if (!raw) return null
    const fresh = []
    let dupes = 0
    for (const f of normalizeFindings(raw, unit, ctx)) {
      if (isDuplicate(f)) { dupes++; continue }
      f.key = findingKey(f)
      fresh.push(f)
    }
    if (dupes) log(`${unit.name}: ${dupes} duplicate finding(s) folded`)
    log(`${unit.name}: ${fresh.length} candidate finding(s)`)
    state.findings.push(...fresh)
    return { unit, findings: fresh }
  }

  const confirmStage = async (scouted, unit, index) => {
    if (!scouted) return null
    const ranked = scouted.findings.slice().sort(severityOrder)
    const now = ranked.slice(0, quota[index])
    if (ranked.length > now.length) log(`${unit.name}: ${ranked.length - now.length} finding(s) wait for the shared confirm pass`)
    await parallel(now.map(f => () => confirmFinding(f, ctx, depthCfg)))
    return scouted
  }

  phase('Scout')
  const stages = depthCfg.confirm ? [scoutStage, confirmStage] : [scoutStage]
  const shardWork = pipeline(units, ...stages)

  // Lens sweeps read the whole diff, so their findings can only be deduped
  // against the shard scouts once every shard scout has answered.
  const lensWork = depthCfg.lenses
    ? parallel(LENSES.map(lens => () => runKeyed(
      `lens:${lens.name}`,
      attempt => agent(lensPrompt(lens, ctx, attempt), { label: `lens ${lens.name}`, phase: 'Scout', model: 'haiku', schema: SCOUT_SCHEMA }),
      false,
    ).then(raw => ({ lens, raw }))))
    : Promise.resolve([])
  const [, lensResults] = await Promise.all([shardWork, lensWork])

  const activeFiles = state.inventoryUnknown ? null : new Set(units.flatMap(u => u.files))
  const lensUnit = { name: 'lens', shards: units.flatMap(u => u.shards), fileSet: activeFiles }
  for (const r of lensResults.filter(Boolean)) {
    if (!r.raw) continue
    let fresh = 0
    let dupes = 0
    let offLens = 0
    for (const f of normalizeFindings(r.raw, lensUnit, ctx)) {
      if (!r.lens.categories.includes(f.category)) { offLens++; continue }
      if (isDuplicate(f)) { dupes++; continue }
      f.key = findingKey(f)
      f.source = `lens:${r.lens.name}`
      state.findings.push(f)
      fresh++
    }
    log(`lens ${r.lens.name}: ${fresh} new finding(s), ${dupes} already seen${offLens ? `, ${offLens} outside the lens categories dropped` : ''}`)
  }

  // Shared confirm pass: whatever the per-unit quotas left over, in a fixed
  // severity-then-location order, with one seat kept for the narrator.
  if (depthCfg.confirm) {
    phase('Confirm')
    const pending = state.findings.filter(f => f.verdict === 'pending').sort(severityOrder)
    const seats = Math.max(0, slotsLeft() - 1)
    const now = pending.slice(0, seats)
    const capped = pending.slice(seats)
    for (const f of capped) { f.verdict = 'unconfirmed'; f.note = 'agent cap reached' }
    if (capped.length) log(`${capped.length} finding(s) left unconfirmed by the depth cap (${depth}: ${depthCfg.maxAgents} agents)`)
    await parallel(now.map(f => () => confirmFinding(f, ctx, depthCfg)))
  } else {
    for (const f of state.findings) { f.verdict = 'unconfirmed'; f.note = 'quick depth: scouts only' }
  }

  // Report
  phase('Report')
  const confirmed = state.findings.filter(f => f.verdict === 'confirmed').sort(findingOrder)
  if (confirmed.length < NARRATOR_MIN_CONFIRMED) {
    state.narratorNote = `skipped: ${confirmed.length} confirmed finding(s), the narrator needs ${NARRATOR_MIN_CONFIRMED}`
  } else if (slotsLeft() <= 0) {
    state.narratorNote = 'skipped: agent cap reached'
    log('narrator skipped: agent cap reached')
  } else {
    const text = await runKeyed('narrator', () => agent(narratorPrompt(confirmed), { label: 'narrator', phase: 'Report', model: 'sonnet' }), false)
    if (text) state.narrator = clampLines(text, NARRATOR_MAX_LINES)
    else state.narratorNote = 'narrator returned nothing'
  }

  return finish(state)
}

return await main()
