#!/usr/bin/env node
// Smoke test for dnp-roslyn MCP server — exercises all tools via JSON-RPC over stdio.
// Usage: node tests/smoke-test.js --solution <path-to-your.slnx>
//
// Requires dnp-roslyn to be installed as a global tool.
// Exits 0 if all tools respond, 1 if any fail.

const { spawn } = require('child_process');

const solutionIdx = process.argv.indexOf('--solution');
if (solutionIdx === -1 || !process.argv[solutionIdx + 1]) {
  console.error('Usage: node tests/smoke-test.js --solution <path-to.sln>');
  process.exit(1);
}
const solutionPath = process.argv[solutionIdx + 1];

const proc = spawn('dnp-roslyn', ['--solution', solutionPath], { stdio: ['pipe', 'pipe', 'pipe'] });
proc.stderr.on('data', () => {});

let buf = '';
const responses = {};
proc.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.id) responses[obj.id] = obj;
    } catch {}
  }
});

function send(obj) {
  proc.stdin.write(JSON.stringify(obj) + '\n');
}

let nextId = 1;
function call(method, params = {}) {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return id;
}

// Phase 1: Initialize
const initId = call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'smoke-test', version: '1.0' }
});

setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  // Phase 2: List tools
  call('tools/list');
}, 1000);

// Discover file paths dynamically from get_solution_structure
let firstCsFile = null;
let firstInterfaceFile = null;

setTimeout(() => {
  // Phase 3: Call workspace/DI tools first (they trigger solution load)
  call('tools/call', { name: 'get_solution_structure', arguments: {} });
  call('tools/call', { name: 'get_ef_models', arguments: {} });
  call('tools/call', { name: 'check_architecture_violations', arguments: { style: 'clean' } });
  call('tools/call', { name: 'check_di_completeness', arguments: {} });
  call('tools/call', { name: 'find_di_registrations', arguments: {} });
  call('tools/call', { name: 'find_di_consumers', arguments: {} });
}, 5000);

setTimeout(() => {
  // Try to discover a .cs file path from solution structure response
  const structResp = responses[3];
  if (structResp?.result?.content?.[0]?.text) {
    try {
      const structure = JSON.parse(structResp.result.content[0].text);
      const projects = structure.projects || [];
      for (const proj of projects) {
        if (proj.path && proj.documentCount > 0) {
          const projDir = proj.path.replace(/\/[^/]+\.csproj$/, '');
          firstCsFile = projDir + '/Program.cs';
          break;
        }
      }
    } catch {}
  }

  if (!firstCsFile) {
    firstCsFile = 'src/Program.cs';
  }

  // Phase 4: Call file-level tools
  call('tools/call', { name: 'get_class_outline', arguments: { filePath: firstCsFile, className: '' } });
  call('tools/call', { name: 'get_method_body', arguments: { filePath: firstCsFile, methodName: 'Main' } });
  call('tools/call', { name: 'find_references', arguments: { filePath: firstCsFile, symbolName: 'Program' } });
  call('tools/call', { name: 'find_implementations', arguments: { filePath: firstCsFile, symbolName: 'Program' } });
}, 15000);

setTimeout(() => {
  let passed = 0;
  let failed = 0;

  // Check tools list
  const toolsResp = responses[2];
  const tools = toolsResp?.result?.tools || [];
  console.log(`\n  Tools registered: ${tools.length}/11`);
  if (tools.length >= 11) passed++; else failed++;

  // Check each tool call
  const toolNames = [
    'get_solution_structure', 'get_ef_models', 'check_architecture_violations',
    'check_di_completeness', 'find_di_registrations', 'find_di_consumers',
    'get_class_outline', 'get_method_body', 'find_references', 'find_implementations'
  ];

  for (let i = 0; i < toolNames.length; i++) {
    const id = i + 3; // tool calls start at id 3
    const resp = responses[id];
    const name = toolNames[i];

    if (resp?.result?.content?.[0]?.text) {
      const text = resp.result.content[0].text;
      const isError = text.startsWith('An error') || text.includes('not found');
      // File-level tools may return "not found" for dynamically guessed paths — that's acceptable
      if (isError && !['find_implementations', 'get_class_outline', 'get_method_body', 'find_references'].includes(name)) {
        console.log(`  FAIL  ${name}: ${text.substring(0, 100)}`);
        failed++;
      } else {
        const len = text.length;
        console.log(`  PASS  ${name} (${len} chars)`);
        passed++;
      }
    } else if (resp?.error) {
      console.log(`  FAIL  ${name}: ${JSON.stringify(resp.error).substring(0, 100)}`);
      failed++;
    } else {
      console.log(`  WAIT  ${name}: no response yet`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  proc.kill();
  process.exit(failed > 0 ? 1 : 0);
}, 45000);
