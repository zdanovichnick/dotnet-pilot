#!/usr/bin/env node
// Drives the Roslyn MCP server over stdio against samples/SmokeSolution and checks the findings
// that sample is built to produce (samples/SmokeSolution/README.md lists them).
//
//   node scripts/smoke-roslyn.js [--server <dll|command>] [--solution <path>] [--verbose]
//
// --server defaults to the Release build of the server in this repo, falling back to Debug,
// then to `dnp-roslyn` on PATH. Exit code 0 when every check passes, 1 otherwise.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_BIN = path.join(ROOT, 'mcp', 'dotnet-pilot-mcp-roslyn', 'src', 'DotnetPilot.Mcp.Roslyn', 'bin');
const CALL_TIMEOUT_MS = 180_000;

function parseArgs(argv) {
  const opts = { verbose: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server') opts.server = argv[++i];
    else if (argv[i] === '--solution') opts.solution = argv[++i];
    else if (argv[i] === '--verbose') opts.verbose = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  opts.solution = path.resolve(opts.solution ?? path.join(ROOT, 'samples', 'SmokeSolution', 'SmokeSolution.slnx'));
  if (!opts.server) {
    opts.server = ['Release', 'Debug']
      .map(c => path.join(SERVER_BIN, c, 'net10.0', 'DotnetPilot.Mcp.Roslyn.dll'))
      .find(p => fs.existsSync(p)) ?? 'dnp-roslyn';
  }
  return opts;
}

function startServer(server, solution) {
  const [cmd, args] = server.endsWith('.dll') ? ['dotnet', [server]] : [server, []];
  const child = spawn(cmd, [...args, '--solution', solution], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderr = '';
  let nextId = 0;
  const pending = new Map();

  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', d => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const waiter = pending.get(msg.id);
      if (waiter) { pending.delete(msg.id); waiter.resolve(msg); }
    }
  });
  child.on('exit', code => {
    for (const w of pending.values()) w.reject(new Error(`server exited (${code}): ${stderr.slice(-2000)}`));
    pending.clear();
  });
  child.on('error', err => {
    for (const w of pending.values()) w.reject(err);
    pending.clear();
  });

  const write = msg => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, CALL_TIMEOUT_MS);
    pending.set(id, {
      resolve: m => { clearTimeout(timer); resolve(m); },
      reject: e => { clearTimeout(timer); reject(e); },
    });
    write({ id, method, params });
  });

  return {
    async initialize() {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dnp-smoke', version: '1' } });
      write({ method: 'notifications/initialized' });
    },
    async listTools() {
      const r = await request('tools/list', {});
      return r.result.tools.map(t => t.name);
    },
    async call(name, args = {}) {
      const r = await request('tools/call', { name, arguments: args });
      if (r.error) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
      const text = r.result.content.map(c => c.text).join('\n');
      try { return JSON.parse(text); } catch { return text; }
    },
    stop() { child.kill(); },
  };
}

const EXPECTED_TOOLS = [
  'check_architecture_violations', 'check_di_completeness', 'detect_antipatterns',
  'detect_circular_dependencies', 'find_callers', 'find_dead_code', 'find_di_consumers',
  'find_di_registrations', 'find_implementations', 'find_references', 'find_symbol',
  'get_class_outline', 'get_ef_models', 'get_method_body', 'get_solution_structure', 'reload_solution',
];

async function run(opts) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  const server = startServer(opts.server, opts.solution);

  try {
    await server.initialize();

    const tools = await server.listTools();
    const absent = EXPECTED_TOOLS.filter(t => !tools.includes(t));
    check('tools/list exposes all 16 tools', absent.length === 0, absent.length ? `missing: ${absent.join(', ')}` : `${tools.length} tools`);

    const structure = await server.call('get_solution_structure');
    const projectNames = (structure.projects ?? []).map(p => p.name).sort();
    check('get_solution_structure: 5 projects', projectNames.length === 5, projectNames.join(', '));

    const di = await server.call('check_di_completeness');
    const missing = (di.missing ?? []).map(m => m.interface).sort();
    check('check_di_completeness: only IPaymentGateway is missing', missing.length === 1 && missing[0] === 'IPaymentGateway', `missing: ${missing.join(', ') || '(none)'}`);
    const captive = (di.captive ?? []).map(c => `${c.consumer}->${c.dependency}`);
    check('check_di_completeness: OrderCache captures IOrderRepository', captive.includes('OrderCache->IOrderRepository'), `captive: ${captive.join(', ') || '(none)'}`);
    const scans = di.scans ?? [];
    check('check_di_completeness: one Scrutor scan detected', scans.length === 1, `scans: ${scans.length}`);
    check('check_di_completeness: the scan is resolved', scans.length === 1 && scans[0].status === 'resolved', `status: ${scans[0]?.status ?? '(n/a)'}`);

    const arch = await server.call('check_architecture_violations', { style: '' });
    check('check_architecture_violations: no violations', arch.violationCount === 0, `violations: ${arch.violationCount}`);

    const cycles = await server.call('detect_circular_dependencies');
    check('detect_circular_dependencies: no cycles', cycles.cycleCount === 0, `cycles: ${cycles.cycleCount}`);

    const ef = await server.call('get_ef_models');
    const ctx = (ef.contexts ?? []).find(c => c.name === 'SmokeDbContext');
    const entities = (ctx?.entities ?? []).map(e => e.name).sort().join(',');
    check('get_ef_models: SmokeDbContext maps Order and OrderLine', entities === 'Order,OrderLine', entities || '(no context)');

    const symbol = await server.call('find_symbol', { symbolName: 'OrderService' });
    check('find_symbol: OrderService defined once', symbol.count === 1, `count: ${symbol.count}`);

    const callers = await server.call('find_callers', { filePath: 'src/Smoke.Application/OrderService.cs', methodName: 'PlaceAsync' });
    const callerFiles = (callers.callers ?? []).map(c => c.file).sort();
    check('find_callers: PlaceAsync called from the API and the test', callerFiles.includes('src/Smoke.Api/Program.cs') && callerFiles.includes('tests/Smoke.Tests/OrderServiceTests.cs'), callerFiles.join(', '));

    const dead = await server.call('find_dead_code', { scope: '' });
    const items = dead.items ?? [];
    const keys = items.map(i => `${i.file}:${i.line}:${i.name}`);
    check('find_dead_code: no duplicate items', new Set(keys).size === keys.length, `${keys.length} items, ${new Set(keys).size} distinct`);
    const di_classes = items.filter(i => i.name === 'DependencyInjection');
    check('find_dead_code: DependencyInjection classes are live', di_classes.length === 0, `${di_classes.length} reported`);
  } finally {
    server.stop();
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.solution)) {
    console.error(`solution not found: ${opts.solution}`);
    process.exit(1);
  }
  console.log(`server:   ${opts.server}\nsolution: ${opts.solution}\n`);
  const results = await run(opts);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${opts.verbose || !r.ok ? `  (${r.detail})` : ''}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
