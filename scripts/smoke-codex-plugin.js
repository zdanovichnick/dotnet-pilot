#!/usr/bin/env node
'use strict';
// Optional installed-CLI check. Uses a disposable CODEX_HOME, never the user's profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'dist', 'plugins');
fs.mkdirSync(outputRoot, { recursive: true });
const temp = fs.mkdtempSync(path.join(outputRoot, '.codex-smoke-'));
function run(args) {
  const result = spawnSync('codex', args, {
    cwd: root, env: { ...process.env, CODEX_HOME: temp },
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `codex ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}
try {
  run(['plugin', 'marketplace', 'add', path.join(root, 'dist/plugins/codex'), '--json']);
  const installed = run(['plugin', 'add', 'dotnet-pilot@dotnet-pilot-marketplace', '--json']);
  const listed = run(['plugin', 'list', '--marketplace', 'dotnet-pilot-marketplace', '--json']);
  assert.equal(installed.name, 'dotnet-pilot');
  assert(listed.installed.some(plugin => plugin.name === 'dotnet-pilot' && plugin.installed && plugin.enabled));
  console.log(JSON.stringify({ installed, listed }, null, 2));
  const manifests = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'plugin.json') manifests.push(full);
    }
  }
  walk(temp);
  assert(manifests.some(file => JSON.parse(fs.readFileSync(file, 'utf8')).name === 'dotnet-pilot'),
    'Installed plugin manifest was not cached');
  const cached = path.dirname(manifests.find(file => JSON.parse(fs.readFileSync(file, 'utf8')).name === 'dotnet-pilot'));
  assert(fs.existsSync(path.join(cached, 'skills/dnp-project-init/SKILL.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(cached, 'mcp.json'), 'utf8')).mcpServers.roslyn.command, 'dnp-roslyn');
  console.log('Codex marketplace registration, installation, listing, and cached manifest: PASS');
} finally {
  // temp is an absolute path created by mkdtemp in this workspace's ignored output.
  assert.equal(path.dirname(temp), outputRoot);
  fs.rmSync(temp, { recursive: true, force: true });
}
