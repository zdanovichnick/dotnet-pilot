#!/usr/bin/env node
// Consistency check for the plugin's cross-file invariants. Each `check`
// pushes a problem string; exit 1 if any accumulated. Runs on Node alone.
//
//   node hooks/__tests__/check-consistency.js
//
// Invariants (each states a fact that lives in more than one file):
//   - one version across plugin.json, marketplace.json, STATUSLINE_VERSION
//     and the banner utility:help prints
//   - utility:help lists every command, agent, skill and hook, with counts
//   - every hooks/dnp-*.js is registered in hooks.json, and vice versa
//   - hook timeouts are seconds (a value >= 600 is almost certainly ms)
//   - every hook resolves its toggle through _lib/config.js
//   - harness fixtures use the real PostToolUse field (`tool_response`)
//   - the mod module's build markers equal dnp-build-verify.js's, and both the
//     Node routing hook and the routing mod read hooks/_lib/routing.md
//   - every agent and command declares `effort:`; none pairs it with haiku;
//     every `model:` (frontmatter or workflow literal) is a family alias
//   - agent `tools:` use documented forms only (no `Bash(...)`, no
//     AskUserQuestion, no `permissionMode` — plugin subagents ignore them)
//   - every /dotnet-pilot:<cat>:<name> reference resolves to a command file,
//     every /dotnet-pilot:<name> to a workflow, and README lists every
//     command and agent

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const problems = [];
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

// Claude Code substitutes a blocked family alias with the newest permitted
// model of that family and warns; a dated ID gets no such fallback.
const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];
const MODEL_ALIAS = new RegExp(`^(${MODEL_ALIASES.join('|')})$`);
const modelValue = fm => (fm.model || '').replace(/^["']|["']$/g, '');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function readJson(p) {
  const text = read(p);
  if (text === null) { problems.push(`${rel(p)}: missing`); return null; }
  try { return JSON.parse(text); } catch (e) { problems.push(`${rel(p)}: invalid JSON (${e.message})`); return null; }
}
function listFiles(dir, filter) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFiles(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

// --- versions ---
const plugin = readJson(path.join(ROOT, '.claude-plugin', 'plugin.json'));
const marketplace = readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json'));
const statuslineSrc = read(path.join(ROOT, 'statusline', 'dnp-statusline.js')) || '';
const statuslineVersion = /STATUSLINE_VERSION\s*=\s*'([^']+)'/.exec(statuslineSrc)?.[1];
const versions = {
  'plugin.json': plugin?.version,
  'marketplace.json plugins[0]': marketplace?.plugins?.[0]?.version,
  'STATUSLINE_VERSION': statuslineVersion,
};
const distinct = new Set(Object.values(versions).filter(Boolean));
if (distinct.size !== 1 || Object.values(versions).some(v => !v)) {
  problems.push(`version mismatch: ${Object.entries(versions).map(([k, v]) => `${k}=${v ?? 'missing'}`).join(', ')}`);
}
if (plugin && 'workflows' in plugin) {
  problems.push('plugin.json declares `workflows`, which replaces the default workflows/*.js scan — remove it or keep it complete');
}

// --- hooks ---
const hooksDir = path.join(ROOT, 'hooks');
const hooksJson = readJson(path.join(hooksDir, 'hooks.json'));
const hookScripts = listFiles(hooksDir, f => /[\\/]hooks[\\/]dnp-[^\\/]+\.js$/.test(f)).map(f => path.basename(f));
const registered = new Set();
for (const [event, groups] of Object.entries(hooksJson?.hooks || {})) {
  for (const group of groups) {
    for (const h of group.hooks || []) {
      const m = /hooks\/(dnp-[a-z-]+\.js)/.exec(h.command || '');
      if (!m) { problems.push(`hooks.json ${event}: unrecognised command "${h.command}"`); continue; }
      registered.add(m[1]);
      if (!hookScripts.includes(m[1])) problems.push(`hooks.json ${event}: ${m[1]} does not exist`);
      if (!/\$\{CLAUDE_PLUGIN_ROOT\}/.test(h.command)) problems.push(`hooks.json ${event}: ${m[1]} path must use \${CLAUDE_PLUGIN_ROOT}`);
      if (typeof h.timeout !== 'number' || h.timeout <= 0 || h.timeout >= 600) {
        problems.push(`hooks.json ${event}: ${m[1]} timeout ${h.timeout} — the unit is seconds`);
      }
      if (h.async === true) problems.push(`hooks.json ${event}: ${m[1]} is async, so its additionalContext would be dropped`);
    }
  }
}
for (const script of hookScripts) {
  if (!registered.has(script)) problems.push(`hooks/${script} is not registered in hooks.json`);
  const src = read(path.join(hooksDir, script)) || '';
  if (!/require\(['"]\.\/_lib\/config['"]\)/.test(src)) problems.push(`hooks/${script} does not import ./_lib/config`);
}
const harness = read(path.join(hooksDir, '__tests__', 'run.js')) || '';
if (/\btool_result\b/.test(harness)) problems.push('hooks/__tests__/run.js: fixtures use `tool_result`; PostToolUse sends `tool_response`');

// --- agents & commands ---
const agentFiles = listFiles(path.join(ROOT, 'agents'), f => /dnp-[^\\/]+\.md$/.test(f));
const agentNames = [];
for (const file of agentFiles) {
  const fm = frontmatter(read(file));
  const name = path.basename(file, '.md');
  agentNames.push(name);
  if (!fm) { problems.push(`${rel(file)}: no frontmatter`); continue; }
  if (fm.name !== name) problems.push(`${rel(file)}: frontmatter name "${fm.name}" != file name`);
  if (!fm.effort) problems.push(`${rel(file)}: missing effort:`);
  if (fm.effort && /^haiku/.test(fm.model || '')) problems.push(`${rel(file)}: effort: is dropped on haiku`);
  if (fm.model && !MODEL_ALIAS.test(modelValue(fm))) problems.push(`${rel(file)}: model: "${fm.model}" is not a family alias (${MODEL_ALIASES.join('|')})`);
  if (fm.permissionMode) problems.push(`${rel(file)}: permissionMode is ignored for plugin subagents`);
  const tools = (fm.tools || '').split(',').map(t => t.trim()).filter(Boolean);
  for (const t of tools) {
    if (/^Bash\(/.test(t)) problems.push(`${rel(file)}: tools uses "${t}" — subagent tools accept exact names only`);
    if (t === 'AskUserQuestion') problems.push(`${rel(file)}: AskUserQuestion never reaches a subagent`);
  }
}

const commandFiles = listFiles(path.join(ROOT, 'commands'), f => f.endsWith('.md'));
const commandKeys = [];
for (const file of commandFiles) {
  const cat = path.basename(path.dirname(file));
  const name = path.basename(file, '.md');
  commandKeys.push(`${cat}:${name}`);
  const fm = frontmatter(read(file));
  if (!fm) { problems.push(`${rel(file)}: no frontmatter`); continue; }
  if (!fm.description) problems.push(`${rel(file)}: missing description:`);
  if (!fm.effort) problems.push(`${rel(file)}: missing effort:`);
  if (fm.effort && /^haiku/.test(fm.model || '')) problems.push(`${rel(file)}: effort: is dropped on haiku`);
  if (fm.model && !MODEL_ALIAS.test(modelValue(fm))) problems.push(`${rel(file)}: model: "${fm.model}" is not a family alias (${MODEL_ALIASES.join('|')})`);
}

const workflowFiles = listFiles(path.join(ROOT, 'workflows'), f => f.endsWith('.js'));
const workflowNames = workflowFiles.map(f => {
  const m = /name:\s*['"]([^'"]+)['"]/.exec(read(f) || '');
  return m ? m[1] : path.basename(f, '.js');
});
for (const file of workflowFiles) {
  for (const m of (read(file) || '').matchAll(/\bmodel:\s*['"]([^'"]+)['"]/g)) {
    if (!MODEL_ALIAS.test(m[1])) problems.push(`${rel(file)}: model '${m[1]}' is not a family alias (${MODEL_ALIASES.join('|')})`);
  }
}

// --- skills ---
const skillNames = fs.existsSync(path.join(ROOT, 'skills')) ? fs.readdirSync(path.join(ROOT, 'skills')) : [];
for (const dir of skillNames) {
  const skill = path.join(ROOT, 'skills', dir, 'SKILL.md');
  const fm = frontmatter(read(skill));
  if (!fm) { problems.push(`skills/${dir}/SKILL.md: missing or no frontmatter`); continue; }
  if (fm.name !== dir) problems.push(`skills/${dir}/SKILL.md: frontmatter name "${fm.name}" != directory`);
  if (!fm.description) problems.push(`skills/${dir}/SKILL.md: missing description:`);
}

// --- help ---
// utility:help is the printed roster; it must name everything the directories hold.
const helpPath = path.join(ROOT, 'commands', 'utility', 'help.md');
const help = read(helpPath) || '';
if (plugin?.version && !help.includes(`DotnetPilot v${plugin.version}`)) {
  problems.push(`${rel(helpPath)}: banner does not read "DotnetPilot v${plugin.version}"`);
}
const rosters = [
  ['COMMANDS', commandKeys, 'command'],
  ['AGENTS', agentNames, 'agent'],
  ['SKILLS', skillNames, 'skill'],
  ['HOOKS', hookScripts.map(s => s.replace(/\.js$/, '')), 'hook'],
];
for (const [heading, names, kind] of rosters) {
  const claim = new RegExp(`^${heading} \\((\\d+)\\)`, 'm').exec(help);
  if (!claim) problems.push(`${rel(helpPath)}: no "${heading} (N)" heading`);
  else if (Number(claim[1]) !== names.length) problems.push(`${rel(helpPath)}: claims ${claim[1]} ${kind}s; repo holds ${names.length}`);
  for (const name of names) {
    if (!help.includes(name)) problems.push(`${rel(helpPath)}: does not list ${kind} ${name}`);
  }
}

// --- references ---
// help.md's "did you mean" table and CHANGELOG.md legitimately name removed commands.
const exempt = new Set(['commands/utility/help.md', 'CHANGELOG.md']);
const refSources = [
  path.join(ROOT, 'README.md'), path.join(ROOT, 'CLAUDE.md'), path.join(ROOT, 'statusline', 'dnp-statusline.js'),
  ...listFiles(hooksDir, f => f.endsWith('.js')), ...commandFiles, ...agentFiles,
  ...listFiles(path.join(ROOT, 'skills'), f => f.endsWith('.md')),
  ...listFiles(path.join(ROOT, 'workflows'), f => f.endsWith('.js')),
  ...listFiles(path.join(ROOT, 'rules'), f => f.endsWith('.md')),
];
// A line that says something was retired/removed/replaced is history, not a
// live reference, and may name things that no longer exist.
const HISTORY_LINE = /\b(retired|removed|deleted|renamed|replaced|folded|gone|were|was)\b/i;
// Hook log prefixes look like agent names (`[dnp-scope-guard]`) but are not.
const HOOK_PREFIX = /^dnp-(build-verify|stop-verify|subagent-result|scope-guard|di-check|di-registration-check|migration-guard|commit-format|git-autoapprove|post-edit-format|dotnet-priority|code-analyzer-redirect|sync-global-claude-md|statusline-sync|roslyn|statusline.*)$/;
for (const file of refSources) {
  if (exempt.has(rel(file))) continue;
  const text = read(file);
  if (text === null) continue;
  for (const line of text.split(/\r?\n/)) {
    if (HISTORY_LINE.test(line)) continue;
    for (const m of line.matchAll(/\/dotnet-pilot:([a-z-]+)(?::([a-z-]+))?\b/g)) {
      if (m[2]) {
        if (!commandKeys.includes(`${m[1]}:${m[2]}`)) problems.push(`${rel(file)}: references missing command /dotnet-pilot:${m[1]}:${m[2]}`);
      } else if (!workflowNames.includes(m[1])) {
        problems.push(`${rel(file)}: references missing workflow /dotnet-pilot:${m[1]}`);
      }
    }
    for (const m of line.matchAll(/`(dnp-[a-z-]+)`/g)) {
      const name = m[1];
      if (HOOK_PREFIX.test(name) || hookScripts.includes(`${name}.js`) || workflowNames.includes(name)) continue;
      if (!agentNames.includes(name)) problems.push(`${rel(file)}: references missing agent ${name}`);
    }
  }
}
const readme = read(path.join(ROOT, 'README.md')) || '';
for (const key of commandKeys) {
  if (!readme.includes(key)) problems.push(`README.md does not list command ${key}`);
}
for (const name of agentNames) {
  if (!readme.includes(`\`${name}\``)) problems.push(`README.md does not list agent ${name}`);
}
const commandCountClaims = [...readme.matchAll(/list (\d+) commands/g)].map(m => Number(m[1]));
for (const n of commandCountClaims) {
  if (n !== commandKeys.length) problems.push(`README.md claims ${n} commands; commands/ holds ${commandKeys.length}`);
}

// --- mods ---
// hooks/mods/build-classify.ts duplicates the marker tables of hooks/dnp-build-verify.js: a mod
// module has no Node and cannot require the CommonJS hook. They must classify identically.
for (const m of hooksJson?.modules || []) {
  if (!fs.existsSync(path.join(hooksDir, m))) problems.push(`hooks.json modules: ${m} does not exist`);
}
const markerTables = src => {
  const norm = s => s.replace(/;\s*$/gm, '').replace(/\s+/g, ' ').trim();
  const pick = re => { const hit = re.exec(src); return hit ? norm(hit[0]) : null; };
  return {
    command: pick(/const DOTNET_CMD = .*$/m),
    fail: pick(/const FAIL_MARKERS = \[[\s\S]*?\n\];?/),
    success: pick(/const SUCCESS_MARKERS = \[[\s\S]*?\n\];?/),
  };
};
const nodeMarkers = markerTables(read(path.join(hooksDir, 'dnp-build-verify.js')) || '');
const modMarkers = markerTables(read(path.join(hooksDir, 'mods', 'build-classify.ts')) || '');
for (const k of Object.keys(nodeMarkers)) {
  if (!nodeMarkers[k] || nodeMarkers[k] !== modMarkers[k]) {
    problems.push(`hooks/mods/build-classify.ts: ${k} markers differ from hooks/dnp-build-verify.js`);
  }
}
if (!fs.existsSync(path.join(hooksDir, '_lib', 'routing.md'))) problems.push('hooks/_lib/routing.md is missing');
if (!/routing\.md/.test(read(path.join(hooksDir, 'dnp-dotnet-priority.js')) || '')) {
  problems.push('hooks/dnp-dotnet-priority.js does not read the shared _lib/routing.md');
}
if (!/routing\.md/.test(read(path.join(hooksDir, 'mods', 'routing.ts')) || '')) {
  problems.push('hooks/mods/routing.ts does not read the shared _lib/routing.md');
}

// --- report ---
if (problems.length) {
  console.error(`check-consistency: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`check-consistency: ok (${hookScripts.length} hooks, ${agentNames.length} agents, ${commandKeys.length} commands, ${workflowNames.length} workflows, version ${plugin.version})`);
