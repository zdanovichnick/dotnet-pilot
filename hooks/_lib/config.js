// Shared config resolution for DotnetPilot hooks.
//
// `.planning/` lives under a user-scoped path: `~/.claude/projects/<flattened>/`.
// Legacy installs (and manual setups) keep `.planning/` inside the repo.
//
// Hooks look repo-local first, then fall back to user-scoped:
//   - Legacy users see zero change.
//   - New users have config picked up automatically after `/DotnetPilot:pipeline:init`.

const fs = require('fs');
const os = require('os');
const path = require('path');

function flattenCwd(cwd) {
  // Replicates Claude Code's memory-system transformation:
  //   D:\Projects\1Poc\dotnet-pilot  ->  D--Projects-1Poc-dotnet-pilot
  //   /home/user/projects/foo         ->  -home-user-projects-foo  (Linux)
  return cwd.replace(/:/g, '-').replace(/[\\/]/g, '-').replace(/^-+/, '');
}

function resolveConfigPath(cwd) {
  // Priority 1: repo-local .planning/config.json
  const local = path.join(cwd, '.planning', 'config.json');
  if (fs.existsSync(local)) return local;

  // Priority 2: user-scoped .planning/config.json (owned by dotnet-pilot-workflow)
  const flat = flattenCwd(cwd);
  const userScoped = path.join(os.homedir(), '.claude', 'projects', flat, '.planning', 'config.json');
  if (fs.existsSync(userScoped)) return userScoped;

  return null;
}

function loadConfig(cwd) {
  const p = resolveConfigPath(cwd);
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function hookEnabled(cwd, hookKey) {
  const config = loadConfig(cwd);
  if (!config) return true; // default-on when no config
  return config.hooks?.[hookKey] !== false;
}

function resolvePlanningDir(cwd) {
  // Useful for hooks that read more than config.json (e.g., STATE.md).
  const local = path.join(cwd, '.planning');
  if (fs.existsSync(local)) return local;

  const flat = flattenCwd(cwd);
  const userScoped = path.join(os.homedir(), '.claude', 'projects', flat, '.planning');
  if (fs.existsSync(userScoped)) return userScoped;

  return null;
}

function projectModelEnabled(cwd) {
  const config = loadConfig(cwd);
  if (!config) return false;
  return config.enableProjectModel === true;
}

module.exports = {
  flattenCwd,
  resolveConfigPath,
  loadConfig,
  hookEnabled,
  projectModelEnabled,
  resolvePlanningDir,
};
