'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build, packageFiles, adapt } = require('./build-host-plugins');

test('workflow references resolve and excluded Claude workflows are explicit', () => {
  assert.equal(adapt('/dotnet-pilot:dotnet:tdd'), 'dnp-dotnet-tdd');
  assert.match(adapt('/dotnet-pilot:quality:review'), /unavailable/);
  assert.throws(() => adapt('/dotnet-pilot:dotnet:does-not-exist'), /Unsupported command/);
});

test('both packages preserve migration safety and replace host assumptions', () => {
  for (const host of ['codex', 'cursor']) {
    const files = packageFiles(host); // Includes frontmatter, JSON, dependency and link validation.
    const refs = 'skills/dotnet-pilot/references/commands';
    const migration = files.get(`${refs}/dotnet/add-migration.md`);
    assert.match(migration, /dotnet ef migrations add/);
    assert.match(migration, /--context <Context>/);
    assert.match(migration, /--idempotent/);
    assert.match(migration, /Commit only if the user requested it/);
    const init = files.get(`${refs}/project/init.md`);
    assert.match(init, /DNP_PLANNING_DIR/);
    assert.doesNotMatch(init, /\.claude|~\//);
    assert.doesNotMatch(files.get(`${refs}/dotnet/tdd.md`), /AskUserQuestion|sonnet|opus|\bspawn\b/i);
    assert.doesNotMatch(files.get(`${refs}/project/ship.md`), /<<'EOF'|process substitution/i);
    const mcp = JSON.parse(files.get('mcp.json')).mcpServers.roslyn;
    assert.equal(mcp.type, 'stdio');
    assert.equal(mcp.command, 'dnp-roslyn');
    assert.equal([...files.keys()].filter(f => /skills\/[^/]+\/SKILL.md$/.test(f)).length, 29);
    assert(![...files.keys()].some(f => /^(hooks|mods|workflows)\//.test(f)));
    assert(!files.has(`${refs}/quality/review.md`));
    assert(!files.has(`${refs}/utility/statusline.md`));
  }
  const cursor = packageFiles('cursor');
  assert(cursor.has('commands/dnp-dotnet-create-entity.md'));
  assert(cursor.has('agents/dnp-architect.md'));
  assert(!packageFiles('codex').has('agents/dnp-architect.md'));
});

test('check detects tampering, missing files, and stale discoverable components', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dnp-host-packages-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  build(false, temp);
  build(true, temp);
  const target = path.join(temp, 'codex/dotnet-pilot/mcp.json');
  fs.writeFileSync(target, '{}');
  assert.throws(() => build(true, temp), /Stale output/);
  build(false, temp);
  fs.unlinkSync(target);
  assert.throws(() => build(true, temp), /ENOENT/);
  build(false, temp);
  fs.writeFileSync(path.join(temp, 'codex/dotnet-pilot/stale.json'), '{}');
  assert.throws(() => build(false, temp), /Unexpected output files/);
});
