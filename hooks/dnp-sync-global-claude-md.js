#!/usr/bin/env node
// DotnetPilot Global CLAUDE.md Sync — PreToolUse hook
//
// On the first tool use after plugin load/reload, ensures the user's global
// ~/.claude/CLAUDE.md contains the current version's rule block between
// <!-- DotnetPilot vX.Y.Z --> and <!-- Dotnet-Pilot-END --> markers.
//
// If the markers don't exist, the block is appended to the end.
// If they exist with an older version, the block is replaced in-place.
// If they exist with the current version, the script exits immediately (fast path).
//
// Advisory only (exit 0 always) — never blocks tool execution.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MARKER_PREFIX = '<!-- DotnetPilot v';
const MARKER_END = '<!-- Dotnet-Pilot-END -->';

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    sync();
  } catch {
    // Never fail — advisory only
  }
  process.exit(0);
});

function sync() {
  const pluginJsonPath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
  const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  const version = plugin.version;
  const markerStart = `${MARKER_PREFIX}${version} -->`;

  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  let content = '';
  try {
    content = fs.readFileSync(claudeMdPath, 'utf8');
  } catch {
    // File doesn't exist — will create
  }

  // Fast path: current version already synced
  if (content.includes(markerStart)) return;

  // Read template
  const templatePath = path.join(__dirname, '..', 'rules', 'global-claude-md.md');
  let template;
  try {
    template = fs.readFileSync(templatePath, 'utf8').trimEnd();
  } catch {
    return; // Template missing — can't sync
  }

  const block = `${markerStart}\n${template}\n${MARKER_END}`;

  // Look for existing DotnetPilot block (any version)
  const escapedPrefix = MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRegex = new RegExp(escapedPrefix + '[\\d.]+ -->');
  const startMatch = content.match(startRegex);
  const endIdx = content.indexOf(MARKER_END);

  if (startMatch && endIdx !== -1 && startMatch.index < endIdx) {
    // Replace existing block (preserve everything before and after)
    const before = content.substring(0, startMatch.index);
    const after = content.substring(endIdx + MARKER_END.length);
    content = before.trimEnd() + '\n\n' + block + after;
  } else {
    // Append to end of file
    if (content.length > 0) {
      content = content.trimEnd() + '\n\n' + block + '\n';
    } else {
      content = block + '\n';
    }
  }

  // Ensure ~/.claude/ exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  fs.writeFileSync(claudeMdPath, content, 'utf8');
}
