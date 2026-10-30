#!/usr/bin/env node
'use strict';

// Dependency-free host packages. Source content and version stay in the Claude plugin.
// node scripts/build-host-plugins.js [--check]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'plugins');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const json = value => JSON.stringify(value, null, 2) + '\n';
const source = JSON.parse(read('.claude-plugin/plugin.json'));
const runtime = read('packaging/hosts/runtime.md');
const excluded = new Set(['quality/review.md', 'utility/help.md', 'utility/statusline.md']);
const slug = file => `dnp-${file.replace(/\.md$/, '').replaceAll('/', '-')}`;

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(e => {
    const full = path.join(dir, e.name);
    assert(!e.isSymbolicLink(), `Symlinks are not packaged: ${full}`);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}
function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert(match, 'Expected YAML frontmatter');
  const field = key => {
    const value = new RegExp(`^${key}: (.+)$`, 'm').exec(match[1])?.[1];
    assert(value, `Missing ${key}`);
    return value.startsWith('"') ? JSON.parse(value) : value;
  };
  return { field, header: match[1], body: text.slice(match[0].length).trim() };
}
const commands = walk(path.join(ROOT, 'commands')).filter(f => f.endsWith('.md') && !excluded.has(f));
const commandNames = new Set(commands.map(slug));

function adapt(text) {
  return text
    .replace(/\/dotnet-pilot:([\w-]+):([\w-]+)/g, (_, category, name) => {
      const id = `dnp-${category}-${name}`;
      if (excluded.has(`${category}/${name}.md`)) return `Claude-only ${category}/${name} (unavailable in this package)`;
      assert(commandNames.has(id), `Unsupported command reference: ${id}`);
      return id;
    })
    .replace(/mcp__roslyn__(\w+)/g, 'roslyn.$1')
    .replace(/\((?:sonnet|opus|haiku),?\s*(?:effort\s+\w+)?\)/gi, '')
    .replace(/\((?:sonnet|opus|haiku),\s*\n\s*>?\s*effort\s+\w+\)/gi, '')
    .replace(/`AskUserQuestion`/g, 'the host user-question capability')
    .replace(/\bspawning anything\b/g, 'starting')
    .replace(/\bre-spawning\b/g, 'restarting the checklist')
    .replace(/\bSpawn the selected TDD agent\b/g, 'Apply the selected TDD checklist')
    .replace(/\bre-spawn the same agent\b/g, 'resume the same specialist checklist')
    .replace(/\bspawns you\b/g, 'applies this checklist')
    .replace(/\bSpawn\b/g, 'Apply the specialist checklist')
    .replace(/\bre-spawn\b/g, 'resume the specialist checklist')
    .replace(/\bspawn\b/g, 'apply the specialist checklist')
    .replace(/\bspawning\b/g, 'starting the checklist')
    .replace(/\bspawns no agent\b/g, 'runs directly')
    .replace(/\*\*Delegates to\*\*/g, '**Specialist checklists**')
    .replace(/^8\. Commit the migration files with:.*$/m,
      '8. Report the migration files and suggest a commit message. Commit only if the user requested it.')
    .replace(/Feed the body on stdin[\s\S]*?\nPass `--draft` if that flag was provided\./,
      'Write the reviewed PR body to a temporary UTF-8 file, then run:\n\n' +
      '```text\ngh pr create --title "<title>" --base <base-branch> --body-file <absolute-body-file>\n```\n\n' +
      'Pass `--draft` if requested. Use the host shell syntax and delete only your temporary body file afterward.')
    .replace(/\bsonnet\b|\bopus\b|\bhaiku\b/gi, 'host-selected model');
}

function packageFiles(host) {
  const files = new Map();
  const put = (file, content) => { assert(!files.has(file), `Duplicate: ${file}`); files.set(file, content); };
  const common = Object.fromEntries(['name', 'version', 'author', 'homepage', 'repository', 'license', 'keywords'].map(k => [k, source[k]]));
  common.description = '.NET development workflows, pattern skills, and Roslyn semantic analysis for local C# solutions.';
  if (host === 'codex') {
    put('plugin.json', json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...common,
      extensions: { 'com.openai': { requires_local_executor: true } } }));
  } else {
    put('.cursor-plugin/plugin.json', json({ ...common, displayName: 'DotnetPilot',
      skills: './skills/', commands: './commands/', agents: './agents/', mcpServers: './mcp.json' }));
  }
  const mcp = JSON.parse(read('.mcp.json'));
  mcp.$schema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
  mcp.mcpServers.roslyn.type = 'stdio';
  put('mcp.json', json(mcp));
  put('LICENSE', read('LICENSE'));
  put('README.md', read('docs/HOST-PLUGINS.md'));

  for (const file of walk(path.join(ROOT, 'skills'))) {
    if (!file.endsWith('.md')) continue;
    const text = read(`skills/${file}`);
    if (file.endsWith('/SKILL.md')) {
      const fm = frontmatter(text);
      put(`skills/${file}`, `---\nname: ${fm.field('name')}\ndescription: ${JSON.stringify(fm.field('description'))}\n---\n\n${adapt(fm.body)}\n`);
    } else put(`skills/${file}`, adapt(text));
  }

  const referenceRoot = 'skills/dotnet-pilot/references';
  for (const dir of ['knowledge', 'templates']) {
    for (const file of walk(path.join(ROOT, dir))) {
      if (!/\.(md|json)$/.test(file)) continue;
      // Templates are reference material, not host startup configuration.
      put(`${referenceRoot}/${dir}/${file}`, dir === 'knowledge' ? adapt(read(`${dir}/${file}`)) : read(`${dir}/${file}`));
    }
  }
  const agents = walk(path.join(ROOT, 'agents')).filter(f => f.endsWith('.md'));
  for (const file of agents) {
    const fm = frontmatter(read(`agents/${file}`));
    const skills = /\nskills:\n((?:  - .*\n)+)/.exec('\n' + fm.header + '\n')?.[1].trim();
    const body = `${runtime}\n\n${skills ? `Relevant pattern skills (load as needed):\n${skills}\n\n` : ''}${adapt(fm.body)}\n`;
    put(`${referenceRoot}/agents/${file}`, body);
    if (host === 'cursor') put(`agents/${file}`, `---\nname: ${fm.field('name')}\ndescription: ${JSON.stringify(fm.field('description'))}\n---\n\n${body}`);
  }

  for (const file of commands) {
    const fm = frontmatter(file === 'project/init.md' ? read('packaging/hosts/init.md') : read(`commands/${file}`));
    const name = slug(file);
    const ref = `references/commands/${file}`;
    const body = `${runtime}\n\n${adapt(fm.body)}\n`;
    put(`skills/dotnet-pilot/${ref}`, body);
    const entry = `---\nname: ${name}\ndescription: ${JSON.stringify(fm.field('description'))}\n---\n\n` +
      `Follow [the ${name} workflow](../dotnet-pilot/${ref}). Resolve that link relative to this skill file.\n` +
      'Specialist checklists are in `../dotnet-pilot/references/agents/`; pattern skills are sibling folders.\n' +
      'Execute checklists directly unless delegation is authorized. Use the current request for arguments.\n';
    put(`skills/${name}/SKILL.md`, entry);
    if (host === 'cursor') put(`commands/${name}.md`, `---\nname: ${name}\ndescription: ${JSON.stringify(fm.field('description'))}\n---\n\n` +
      `Follow [the workflow](../skills/dotnet-pilot/${ref}), including its host runtime instructions.\n` +
      'Paths resolve relative to this command file. Specialist checklists are under `../skills/dotnet-pilot/references/agents/`.\n' +
      'Use the current request for arguments and execute checklists directly unless delegation is authorized.\n');
  }
  put('skills/dotnet-pilot/SKILL.md', `---\nname: dotnet-pilot\ndescription: "Initialize and navigate DotnetPilot workflows for C# solution scaffolding, TDD, DI, architecture, and EF migration checks."\n---\n\n` +
    `# DotnetPilot ${source.version}\n\n${runtime}\n\n## Workflows\n\n` +
    commands.map(file => `- [${slug(file)}](references/commands/${file})`).join('\n') +
    '\n\n## Specialist checklists\n\n' + agents.map(file => `- [${file.slice(0, -3)}](references/agents/${file})`).join('\n') +
    '\n\nPattern skills live in sibling folders. Start with `../dotnet-project-init/SKILL.md` and\n' +
    '`../convention-learner/SKILL.md` for an unfamiliar solution. Read `references/knowledge/`\n' +
    'for architecture decisions and package guidance, and `references/templates/` for project starters.\n');
  validate(files, host);
  return files;
}

function validate(files, host) {
  const manifest = JSON.parse(files.get(host === 'codex' ? 'plugin.json' : '.cursor-plugin/plugin.json'));
  assert.equal(manifest.version, source.version);
  assert.equal(manifest.name, source.name);
  assert.equal(JSON.parse(files.get('mcp.json')).mcpServers.roslyn.command, 'dnp-roslyn');
  for (const [file, text] of files) {
    if (file.endsWith('.json')) JSON.parse(text);
    if (!file.endsWith('.md') || file === 'README.md' || file.includes('/templates/')) continue;
    assert(!/CLAUDE_PLUGIN|~\/\.claude|AskUserQuestion|mcp__roslyn__/.test(text), `Host dependency in ${file}`);
    if (file.endsWith('/SKILL.md')) {
      const fm = frontmatter(text);
      assert.equal(fm.field('name'), path.posix.basename(path.posix.dirname(file)));
    }
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(https?:|#)/.test(match[1])) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1].split('#')[0]));
      assert(files.has(target), `Broken link in ${file}: ${match[1]}`);
    }
  }
  assert(![...files.keys()].some(f => f.startsWith('hooks/') || f.startsWith('mods/')));
}

function assertNoSymlinks(dir) {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    if (fs.existsSync(current)) assert(!fs.lstatSync(current).isSymbolicLink(), `Output path is a symlink: ${current}`);
    if (path.dirname(current) === current) break;
  }
}

function build(check = false, outputRoot = OUT) {
  assertNoSymlinks(outputRoot);
  for (const host of ['codex', 'cursor']) {
    const files = new Map([...packageFiles(host)].map(([file, content]) => [`dotnet-pilot/${file}`, content]));
    const marketplace = host === 'codex'
      ? { name: 'dotnet-pilot-marketplace', interface: { displayName: 'DotnetPilot' },
        plugins: [{ name: 'dotnet-pilot', source: { source: 'local', path: './dotnet-pilot' } }] }
      : { name: 'dotnet-pilot-marketplace', owner: source.author,
        plugins: [{ name: 'dotnet-pilot', source: './dotnet-pilot' }] };
    files.set(host === 'codex' ? '.agents/plugins/marketplace.json' : '.cursor-plugin/marketplace.json', json(marketplace));
    const dir = path.join(outputRoot, host);
    // Never silently leave stale, discoverable components from a previous build.
    if (fs.existsSync(dir)) {
      assert(!fs.lstatSync(dir).isSymbolicLink(), `Output is a symlink: ${dir}`);
      const unexpected = walk(dir).filter(file => !files.has(file));
      assert.equal(unexpected.length, 0, `Unexpected output files; move these aside before rebuilding: ${unexpected.join(', ')}`);
    }
    for (const [file, text] of files) {
      const target = path.join(dir, file);
      if (check) assert.equal(fs.readFileSync(target, 'utf8'), text, `Stale output: ${target}`);
      else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); }
    }
    console.log(`${check ? 'Checked' : 'Built'} ${host}: ${files.size} files, ${commands.length} workflows (${source.version})`);
  }
}
if (require.main === module) {
  assert(process.argv.slice(2).every(arg => arg === '--check'), 'Usage: node scripts/build-host-plugins.js [--check]');
  build(process.argv.includes('--check'));
}
module.exports = { build, packageFiles, adapt };
