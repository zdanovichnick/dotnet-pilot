#!/usr/bin/env node
// DotnetPilot Statusline Sync — SessionStart hook
//
// Keeps the installed statusline script at ~/.claude/dnp-statusline.js current
// with the version shipped in the plugin. A stable ~/.claude path is required
// because ${CLAUDE_PLUGIN_ROOT} is NOT expanded inside statusLine command
// strings, so the script cannot run in place from the plugin directory.
//
// Two responsibilities:
//   1. ALWAYS (idempotent): copy the plugin's statusline/dnp-statusline.js to
//      ~/.claude/dnp-statusline.js when the plugin ships a newer STATUSLINE_VERSION
//      than the installed copy stamps. Fast-path exits when already current.
//   2. GATED on config statusline.auto_enable === true (default OFF): wire
//      ~/.claude/settings.json statusLine to point at the installed script,
//      backing up any pre-existing command once to ~/.claude/dnp-statusline.prev.json.
//
// Advisory only (exit 0 always) — never blocks, never throws.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { statuslineAutoEnable } = require('./_lib/config');
const { isNewer } = require('./_lib/version');
const { readJsonFile, writeJsonFile } = require('./_lib/json-file');

const VERSION_RE = /STATUSLINE_VERSION\s*=\s*'([\w.+-]+)'/;

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  let cwd = process.cwd();
  try {
    const data = JSON.parse(input) || {};
    cwd = data.cwd || (data.workspace && data.workspace.current_dir) || cwd;
  } catch {
    // No/invalid payload — still run with process.cwd() so a reload refreshes the script.
  }
  try {
    sync(cwd);
  } catch {
    // Never fail — advisory only.
  }
  process.exit(0);
});

function sync(cwd) {
  const srcPath = path.join(__dirname, '..', 'statusline', 'dnp-statusline.js');
  let src;
  try {
    src = fs.readFileSync(srcPath, 'utf8');
  } catch {
    return; // source missing — nothing to install
  }

  const claudeDir = path.join(os.homedir(), '.claude');
  const destPath = path.join(claudeDir, 'dnp-statusline.js');

  const srcVersion = versionOf(src);
  const destVersion = fs.existsSync(destPath) ? versionOf(readSafe(destPath)) : null;

  // 1. Refresh the installed script when the plugin ships something newer (or it's absent).
  if (destVersion === null || isNewer(srcVersion, destVersion)) {
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(destPath, src, 'utf8');
  }

  // 2. Optionally wire settings.json — opt-in only.
  if (statuslineAutoEnable(cwd)) {
    wireStatusLine(claudeDir, destPath);
  }
}

function wireStatusLine(claudeDir, destPath) {
  const settingsPath = path.join(claudeDir, 'settings.json');
  const file = readJsonFile(settingsPath);
  if (file.exists && !file.ok) return;
  const settings = file.ok ? file.value : {};

  const command = `node "${destPath}"`;
  const existing = settings.statusLine;

  // Fast path: already ours.
  if (existing && existing.command === command) return;

  // Back up any pre-existing statusLine command exactly once before replacing.
  if (existing && existing.command) {
    const backupPath = path.join(claudeDir, 'dnp-statusline.prev.json');
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    }
  }

  settings.statusLine = { type: 'command', command, refreshInterval: 5 };
  writeJsonFile(settingsPath, settings, file.bom);
}

function versionOf(content) {
  if (!content) return null;
  const m = content.match(VERSION_RE);
  return m ? m[1] : null;
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
