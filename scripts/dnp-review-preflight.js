#!/usr/bin/env node
'use strict';
// Preflight for /dotnet-pilot:quality:review.
//
// The review workflow runs without filesystem access, so everything it needs
// to know about a change set is materialised here: the full patch, one patch
// file per shard, and a manifest of absolute paths that the workflow's agents
// read for themselves. Success prints the manifest JSON on stdout; a fatal
// problem prints {ok:false,error} and exits 2 so the caller can stop cleanly.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// git's well-known empty tree. Diffing against it yields "everything added",
// which is what a root commit or a repository without HEAD needs.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const DEFAULT_SHARD_LINES = 400;
const MAX_BUFFER = 512 * 1024 * 1024;
const DIFF_FLAGS = ['diff', '--no-color', '--no-ext-diff', '--find-renames'];

function fail(message) {
  process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { repo: null, out: null, mode: null, base: null, scope: null, shardLines: DEFAULT_SHARD_LINES };
  const setMode = (mode) => {
    if (opts.mode && opts.mode !== mode) fail(`--${opts.mode} and --${mode} are mutually exclusive`);
    opts.mode = mode;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) fail(`${arg} needs a value`);
      return argv[++i];
    };
    switch (arg) {
      case '--repo': opts.repo = value(); break;
      case '--out': opts.out = value(); break;
      case '--base': setMode('base'); opts.base = value(); break;
      case '--staged': setMode('staged'); break;
      case '--last-commit': setMode('last-commit'); break;
      case '--scope': setMode('scope'); opts.scope = value(); break;
      case '--shard-lines': {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1) fail('--shard-lines must be a positive integer');
        opts.shardLines = n;
        break;
      }
      default: fail(`unknown argument: ${arg}`);
    }
  }
  if (!opts.repo) fail('--repo <dir> is required');
  if (!opts.out) fail('--out <dir> is required');
  if (!opts.mode) opts.mode = 'working-tree';
  return opts;
}

function git(cwd, args, okExits = [0]) {
  const res = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, maxBuffer: MAX_BUFFER, windowsHide: true });
  if (res.error) fail(`git could not be started: ${res.error.message}`);
  return {
    ok: okExits.includes(res.status),
    status: res.status,
    stdout: res.stdout || Buffer.alloc(0),
    stderr: res.stderr ? res.stderr.toString('utf8').trim() : '',
  };
}

function gitText(cwd, args, okExits) {
  const res = git(cwd, args, okExits);
  if (!res.ok) fail(`git ${args.join(' ')} failed (exit ${res.status})${res.stderr ? `: ${res.stderr}` : ''}`);
  return res.stdout.toString('utf8');
}

function listUntracked(repoRoot, scope) {
  const args = ['ls-files', '--others', '--exclude-standard', '-z'];
  if (scope) args.push('--', scope);
  return gitText(repoRoot, args).split('\0').filter(Boolean);
}

// `git diff --no-index` exits 1 when the two sides differ, which is the
// expected outcome here. git treats the literal "/dev/null" as an empty file on
// every platform, Windows included, so no temp file is needed.
function synthesizeUntracked(repoRoot, relPath) {
  const res = git(repoRoot, ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', relPath], [0, 1]);
  if (!res.ok) fail(`could not synthesize a patch for untracked file ${relPath}${res.stderr ? `: ${res.stderr}` : ''}`);
  return res.stdout.toString('utf8');
}

function collectPatch(repoRoot, opts) {
  const hasHead = git(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']).ok;
  const head = hasHead ? 'HEAD' : EMPTY_TREE;
  const detail = { base: null, range: null, scope: null };
  let tracked = '';
  let untrackedPaths = [];

  switch (opts.mode) {
    case 'staged':
      tracked = gitText(repoRoot, [...DIFF_FLAGS, '--cached', head]);
      detail.range = `${head}..index`;
      break;
    case 'last-commit': {
      if (!hasHead) fail('repository has no commits; --last-commit needs one');
      const parent = git(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD~1']).ok ? 'HEAD~1' : EMPTY_TREE;
      tracked = gitText(repoRoot, [...DIFF_FLAGS, parent, 'HEAD']);
      detail.range = `${parent}..HEAD`;
      break;
    }
    case 'base': {
      if (!hasHead) fail('repository has no commits; --base needs one');
      if (!git(repoRoot, ['rev-parse', '--verify', '--quiet', `${opts.base}^{commit}`]).ok) fail(`--base ref not found: ${opts.base}`);
      const mergeBase = git(repoRoot, ['merge-base', opts.base, 'HEAD']);
      if (!mergeBase.ok) fail(`no merge base between ${opts.base} and HEAD${mergeBase.stderr ? `: ${mergeBase.stderr}` : ''}`);
      const sha = mergeBase.stdout.toString('utf8').trim();
      tracked = gitText(repoRoot, [...DIFF_FLAGS, sha, 'HEAD']);
      detail.base = opts.base;
      detail.range = `${sha.slice(0, 12)}..HEAD`;
      break;
    }
    case 'scope':
      tracked = gitText(repoRoot, [...DIFF_FLAGS, head, '--', opts.scope]);
      untrackedPaths = listUntracked(repoRoot, opts.scope);
      detail.scope = opts.scope;
      detail.range = `${head}..working-tree`;
      break;
    default:
      tracked = gitText(repoRoot, [...DIFF_FLAGS, head]);
      untrackedPaths = listUntracked(repoRoot, null);
      detail.range = `${head}..working-tree`;
  }

  const untracked = untrackedPaths.map(p => ({ path: p, text: synthesizeUntracked(repoRoot, p) }));
  return { tracked, untracked, detail };
}

// git quotes paths containing control characters, quotes or backslashes as a
// C string. core.quotepath=false above keeps non-ASCII paths unquoted.
function unquotePath(raw) {
  const s = raw.trim();
  if (!(s.startsWith('"') && s.endsWith('"'))) return s;
  const escapes = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
  return s.slice(1, -1).replace(/\\([0-7]{3}|.)/g, (m, e) => (
    /^[0-7]{3}$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : (escapes[e] !== undefined ? escapes[e] : e)
  ));
}

function stripSide(p) {
  if (p === '/dev/null') return null;
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}

// "diff --git a/X b/X" is the only header line for binary and mode-only
// changes. When both sides are the same path the string splits symmetrically;
// otherwise fall back to the first " b/" separator.
function pathFromHeader(header) {
  const rest = header.slice('diff --git '.length);
  const len = (rest.length - 5) / 2;
  if (Number.isInteger(len) && len > 0 && rest.startsWith('a/')
    && rest.slice(2 + len, 5 + len) === ' b/' && rest.slice(2, 2 + len) === rest.slice(5 + len)) {
    return rest.slice(2, 2 + len);
  }
  const idx = rest.indexOf(' b/');
  return idx > 0 ? unquotePath(rest.slice(0, idx)).replace(/^a\//, '') : rest;
}

function describeChunk(lines) {
  let status = 'M';
  let oldPath = null;
  let newPath = null;
  let renameFrom = null;
  let renameTo = null;
  let binary = false;
  let added = 0;
  let deleted = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) { inHunk = true; continue; }
    if (inHunk) {
      if (line[0] === '+') added++;
      else if (line[0] === '-') deleted++;
      continue;
    }
    if (line.startsWith('new file mode')) status = 'A';
    else if (line.startsWith('deleted file mode')) status = 'D';
    else if (line.startsWith('rename from ')) renameFrom = unquotePath(line.slice(12));
    else if (line.startsWith('rename to ')) { renameTo = unquotePath(line.slice(10)); status = 'R'; }
    else if (line.startsWith('copy to ')) { renameTo = unquotePath(line.slice(8)); status = 'C'; }
    else if (line.startsWith('--- ')) oldPath = stripSide(unquotePath(line.slice(4)));
    else if (line.startsWith('+++ ')) newPath = stripSide(unquotePath(line.slice(4)));
    else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) binary = true;
  }

  const filePath = renameTo || newPath || oldPath || pathFromHeader(lines[0]);
  const previous = renameFrom || (oldPath && oldPath !== filePath ? oldPath : null);
  return {
    path: filePath,
    oldPath: previous,
    status,
    binary,
    added,
    deleted,
    lineCount: lines.length,
    text: lines.join('\n') + '\n',
  };
}

function splitIntoChunks(patchText) {
  if (!patchText) return [];
  const lines = patchText.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const chunks = [];
  for (const line of lines) {
    if (line.startsWith('diff --git ')) chunks.push([line]);
    else if (chunks.length) chunks[chunks.length - 1].push(line);
  }
  return chunks.map(describeChunk);
}

function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// First-fit-decreasing: largest files placed first, each into the first shard
// with room. A file larger than the limit gets a shard of its own; files are
// never split, so a reviewer always sees a whole file's hunks together.
function packShards(files, shardLines) {
  const textual = files.filter(f => !f.binary)
    .slice()
    .sort((a, b) => b.lineCount - a.lineCount || comparePaths(a.path, b.path));
  const shards = [];
  for (const file of textual) {
    let shard = shards.find(s => s.lineCount + file.lineCount <= shardLines);
    if (!shard) {
      shard = { files: [], lineCount: 0 };
      shards.push(shard);
    }
    shard.files.push(file);
    shard.lineCount += file.lineCount;
  }
  return shards;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shard';
}

function timestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const repoArg = path.resolve(opts.repo);
  let stat = null;
  try { stat = fs.statSync(repoArg); } catch { /* reported below */ }
  if (!stat || !stat.isDirectory()) fail(`--repo is not a directory: ${repoArg}`);
  const top = git(repoArg, ['rev-parse', '--show-toplevel']);
  if (!top.ok) fail(`not a git repository: ${repoArg}${top.stderr ? ` (${top.stderr})` : ''}`);
  const repoRoot = path.resolve(top.stdout.toString('utf8').trim());

  const { tracked, untracked, detail } = collectPatch(repoRoot, opts);
  const files = splitIntoChunks(tracked).map(f => ({ ...f, untracked: false }));
  for (const u of untracked) {
    for (const f of splitIntoChunks(u.text)) {
      files.push({ ...f, path: f.path || u.path, status: 'A', untracked: true });
    }
  }
  files.sort((a, b) => comparePaths(a.path, b.path));

  const fullPatch = files.map(f => f.text).join('');
  const digest = crypto.createHash('sha1').update(fullPatch, 'utf8').digest('hex').slice(0, 8);
  const runId = `${timestamp(new Date())}-${digest}`;
  const runDir = path.resolve(opts.out, runId);
  const shardsDir = path.join(runDir, 'shards');
  fs.mkdirSync(shardsDir, { recursive: true });

  const diffPath = path.join(runDir, 'diff.patch');
  fs.writeFileSync(diffPath, fullPatch, 'utf8');

  const shards = packShards(files, opts.shardLines).map((shard, i) => {
    const name = `${String(i + 1).padStart(3, '0')}-${slugify(path.posix.basename(shard.files[0].path))}`;
    const shardPath = path.join(shardsDir, `${name}.patch`);
    fs.writeFileSync(shardPath, shard.files.map(f => f.text).join(''), 'utf8');
    for (const f of shard.files) f.shardPath = shardPath;
    return { name, path: shardPath, files: shard.files.map(f => f.path), lineCount: shard.lineCount };
  });

  const pluginRoot = path.resolve(__dirname, '..');
  const manifestPath = path.join(runDir, 'manifest.json');
  const manifest = {
    ok: true,
    runId,
    mode: opts.mode,
    base: detail.base,
    scope: detail.scope,
    range: detail.range,
    repoRoot,
    createdAt: new Date().toISOString(),
    shardLines: opts.shardLines,
    fileCount: files.length,
    binaryCount: files.filter(f => f.binary).length,
    untrackedCount: files.filter(f => f.untracked).length,
    files: files.map(f => ({
      path: f.path,
      oldPath: f.oldPath || null,
      status: f.status,
      untracked: f.untracked,
      shardPath: f.shardPath || null,
      added: f.added,
      deleted: f.deleted,
      lineCount: f.lineCount,
      binary: f.binary,
    })),
    shards,
    scriptPath: path.join(pluginRoot, 'workflows', 'dnp-review.js'),
    skillsDir: path.join(pluginRoot, 'skills'),
    diffPath,
    shardsDir,
    manifestPath,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(manifest) + '\n');
}

main();
