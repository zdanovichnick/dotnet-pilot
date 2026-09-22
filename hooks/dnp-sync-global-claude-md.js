#!/usr/bin/env node
// DotnetPilot Global CLAUDE.md Sync — SessionStart hook
//
// Ensures the user's global ~/.claude/CLAUDE.md carries this plugin version's
// rule block between <!-- DotnetPilot vX.Y.Z --> and <!-- Dotnet-Pilot-END -->.
//
// No block → appended. An older block → replaced in place. The same or a NEWER
// block → left alone, so two installs of different versions never rewrite the
// block back and forth.
//
// Also sets `autoUpdate: true` on the dotnet-pilot marketplace entry in
// ~/.claude/settings.json, but only when that entry already exists with a
// `source` and has no `autoUpdate` of its own. An unreadable or unparseable
// settings file is never rewritten.
//
// Advisory only (exit 0 always) — never blocks.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hookEnabled } = require('./_lib/config');
const { isNewer } = require('./_lib/version');
const { readJsonFile, writeJsonFile } = require('./_lib/json-file');

const MARKER_PREFIX = '<!-- DotnetPilot v';
const MARKER_END = '<!-- Dotnet-Pilot-END -->';
const MARKER_START_RE = /<!-- DotnetPilot v([\w.+-]+) -->/;
const MARKETPLACE_NAME = 'dotnet-pilot-marketplace';

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    let cwd = process.cwd();
    try { cwd = JSON.parse(input).cwd || cwd; } catch { /* payload optional */ }
    if (hookEnabled(cwd, 'sync_global_claude_md')) {
      const claudeDir = path.join(os.homedir(), '.claude');
      syncBlock(claudeDir);
      enableAutoUpdate(claudeDir);
    }
  } catch {
    // Never fail — advisory only
  }
  process.exit(0);
});

function syncBlock(claudeDir) {
  const pluginJsonPath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
  const version = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8')).version;
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  let content = '';
  try {
    content = fs.readFileSync(claudeMdPath, 'utf8');
  } catch {
    // File doesn't exist — will create
  }

  const startMatch = content.match(MARKER_START_RE);
  if (startMatch && !isNewer(version, startMatch[1])) return;

  let template;
  try {
    template = fs.readFileSync(path.join(__dirname, '..', 'rules', 'global-claude-md.md'), 'utf8').trimEnd();
  } catch {
    return;
  }

  const block = `${MARKER_PREFIX}${version} -->\n${template}\n${MARKER_END}`;
  const endIdx = content.indexOf(MARKER_END);

  if (startMatch && endIdx !== -1 && startMatch.index < endIdx) {
    const before = content.substring(0, startMatch.index);
    const after = content.substring(endIdx + MARKER_END.length);
    content = before.trimEnd() + '\n\n' + block + after;
  } else if (content.length > 0) {
    content = content.trimEnd() + '\n\n' + block + '\n';
  } else {
    content = block + '\n';
  }

  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(claudeMdPath, content, 'utf8');
}

function enableAutoUpdate(claudeDir) {
  const settingsPath = path.join(claudeDir, 'settings.json');
  const file = readJsonFile(settingsPath);
  if (!file.ok) return;
  const entry = file.value.extraKnownMarketplaces?.[MARKETPLACE_NAME];
  if (!entry || typeof entry !== 'object' || !entry.source || entry.autoUpdate !== undefined) return;

  entry.autoUpdate = true;
  writeJsonFile(settingsPath, file.value, file.bom);
}
