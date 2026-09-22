// Read-modify-write helpers for user JSON files the hooks touch
// (~/.claude/settings.json). A file that exists but does not parse — a BOM
// added by an editor is tolerated, a trailing comma or a half-written file is
// not — must never be replaced, or the user's other settings are lost.

const fs = require('fs');

// { exists: false } | { exists: true, ok: false } | { exists: true, ok: true, value, bom }
function readJsonFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { exists: false };
  }
  const bom = raw.startsWith('﻿') ? '﻿' : '';
  try {
    const value = JSON.parse(raw.slice(bom.length));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { exists: true, ok: false };
    return { exists: true, ok: true, value, bom };
  } catch {
    return { exists: true, ok: false };
  }
}

// Writes via rename so a concurrent reader never sees a half-written file.
function writeJsonFile(filePath, value, bom = '') {
  const tmpPath = `${filePath}.dnp-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, bom + JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    return false;
  }
}

module.exports = { readJsonFile, writeJsonFile };
