// Build-outcome state shared by dnp-build-verify (writer), dnp-stop-verify and
// statusline/dnp-statusline.js (readers).
//
// One file per working directory under os.tmpdir():
//   dnp-build-fail-<sha1(cwd)>.json
// Full-length digest, not a prefix slice: sibling project roots share a long
// path prefix, so truncating the hash would collide their files. The file name
// predates schema v2 and is kept so the standalone statusline copy keeps reading
// it without a matching upgrade.
//
// Schema v2: { v: 2, count, lastFail, lastSuccess, lastCommand, lastKind }
//   count        consecutive failures; 0 after a green build/test
//   lastFail     ISO time of the most recent failure, or null
//   lastSuccess  ISO time of the most recent green build/test, or null
//   lastCommand  the dotnet command that produced the latest outcome
//   lastKind     'build' | 'test'
// A green result WRITES count:0 instead of deleting the file, so readers can
// tell "built and green" from "never built here".

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STALE_MS = 60 * 60 * 1000;

function statePath(cwd) {
  const hash = crypto.createHash('sha1').update(cwd).digest('hex');
  return path.join(os.tmpdir(), `dnp-build-fail-${hash}.json`);
}

function readState(cwd) {
  try {
    const data = JSON.parse(fs.readFileSync(statePath(cwd), 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return {
      v: data.v || 1,
      count: data.count || 0,
      lastFail: data.lastFail || null,
      lastSuccess: data.lastSuccess || null,
      lastCommand: data.lastCommand || null,
      lastKind: data.lastKind || null,
    };
  } catch {
    return null;
  }
}

function writeState(cwd, state) {
  try {
    fs.writeFileSync(statePath(cwd), JSON.stringify({ v: 2, ...state }));
  } catch { /* temp dir unavailable — state is best-effort */ }
}

function isFresh(iso, now = Date.now()) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t < STALE_MS;
}

// Returns the new consecutive-failure count. A failure older than STALE_MS
// starts a fresh streak rather than extending a stale one.
function recordFailure(cwd, command, kind) {
  const prev = readState(cwd);
  const count = prev && isFresh(prev.lastFail) ? prev.count + 1 : 1;
  writeState(cwd, {
    count,
    lastFail: new Date().toISOString(),
    lastSuccess: prev ? prev.lastSuccess : null,
    lastCommand: command,
    lastKind: kind,
  });
  return count;
}

function recordSuccess(cwd, command, kind) {
  const prev = readState(cwd);
  writeState(cwd, {
    count: 0,
    lastFail: prev ? prev.lastFail : null,
    lastSuccess: new Date().toISOString(),
    lastCommand: command,
    lastKind: kind,
  });
}

module.exports = { statePath, readState, recordFailure, recordSuccess, isFresh, STALE_MS };
