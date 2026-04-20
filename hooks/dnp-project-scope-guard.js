#!/usr/bin/env node
// DotnetPilot Project Scope Guard — PostToolUse hook (Write/Edit)
// Warns when editing files in a project outside the current phase scope.
// Advisory only — never blocks.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { hookEnabled, resolvePlanningDir } = require('./_lib/config');

const HOOK_NAME = 'dnp-scope-guard';
const EXPECTED_PROTOCOL_VERSION = 1;

function emit(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
  }));
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    if (!data || typeof data !== 'object' || !('tool_input' in data)) {
      emit(`[hook-version-mismatch] Expected tool_input in event payload (protocol v${EXPECTED_PROTOCOL_VERSION}).`);
      process.exit(0);
    }

    const cwd = data.cwd || process.cwd();

    // Check if scope guard is enabled and a .planning/ exists somewhere
    const planningDir = resolvePlanningDir(cwd);
    if (!planningDir) process.exit(0);
    if (!hookEnabled(cwd, 'project_scope_guard')) process.exit(0);

    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath) process.exit(0);

    // Read STATE.md to find current phase focus
    const statePath = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(statePath)) process.exit(0);

    const stateContent = fs.readFileSync(statePath, 'utf8');

    // Extract focus_projects from STATE.md frontmatter
    const focusMatch = stateContent.match(/focus_projects:\s*\[([^\]]*)\]/);
    if (!focusMatch) process.exit(0);

    const focusProjects = focusMatch[1]
      .split(',')
      .map(p => p.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    if (focusProjects.length === 0) {
      // One-time nudge tip
      const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 12);
      const markerPath = path.join(os.tmpdir(), `dnp-scope-nudged-${hash}`);
      if (!fs.existsSync(markerPath)) {
        try { fs.writeFileSync(markerPath, '1'); } catch {}
        emit("SCOPE TIP: Add `focus_projects: [ProjectName]` to STATE.md frontmatter to enable project scope guarding for this phase.");
      }
      process.exit(0);
    }

    // Determine which project the edited file belongs to
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Skip common files that are solution-level
    const fileName = path.basename(filePath);
    const solutionLevel = ['.gitignore', '.editorconfig', 'Directory.Packages.props',
      'Directory.Build.props', 'global.json', 'nuget.config'];
    if (solutionLevel.includes(fileName)) process.exit(0);
    if (filePath.includes('.planning')) process.exit(0);

    // Use solution-map.json for exact project boundary matching
    const editedProject = resolveProject(normalizedPath, cwd);
    const belongsToFocus = editedProject && focusProjects.includes(editedProject);

    if (!belongsToFocus && editedProject) {
      emit(`SCOPE ADVISORY: Editing file in \`${editedProject}\` ` +
        `but current phase focuses on [${focusProjects.join(', ')}]. Is this intentional?`);
    }
  } catch (e) {
    process.exit(0);
  }
});

function resolveProject(filePath, cwd) {
  // Try solution-map.json for exact matching (repo-local or user-scoped)
  const planningDir = resolvePlanningDir(cwd);
  const mapPath = planningDir ? path.join(planningDir, 'solution-map.json') : null;
  if (mapPath && fs.existsSync(mapPath)) {
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      if (map.projects) {
        let best = null;
        let bestLen = 0;
        for (const [name, info] of Object.entries(map.projects)) {
          const projDir = path.dirname(info.path).replace(/\\/g, '/');
          if (projDir && filePath.includes('/' + projDir + '/') && projDir.length > bestLen) {
            best = name;
            bestLen = projDir.length;
          }
        }
        if (best) return best;
      }
    } catch {}
  }

  // Fallback: guess from path structure
  const match = filePath.match(/(?:src|tests?)[/\\]([^/\\]+)/);
  return match ? match[1] : null;
}
