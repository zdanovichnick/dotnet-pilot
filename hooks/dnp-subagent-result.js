#!/usr/bin/env node
// DotnetPilot Subagent Result — SubagentStop hook (dotnet-pilot:dnp-* agents)
// Surfaces a worker that halted, returned partial work, or asked to be
// re-routed, so the outcome reaches the user instead of only the orchestrating
// model. Advisory only — emits a systemMessage, never blocks.
//
// SubagentStop's additionalContext goes to the subagent, which has already
// finished, so systemMessage is the only channel that lands anywhere useful.

const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-subagent-result';
const MARKERS = [/\[HALT\b[^\]]*\]/, /\[PARTIAL\b[^\]]*\]/, /\[ROUTING:[^\]]*\]/];

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    if (!data || typeof data !== 'object') process.exit(0);

    const cwd = data.cwd || process.cwd();
    if (!hookEnabled(cwd, 'subagent_result')) process.exit(0);

    const message = typeof data.last_assistant_message === 'string' ? data.last_assistant_message : '';
    const hit = MARKERS.map(re => message.match(re)).find(Boolean);
    if (!hit) process.exit(0);

    const agent = data.agent_type || 'subagent';
    process.stdout.write(JSON.stringify({
      systemMessage: `[${HOOK_NAME}] ${agent} returned ${hit[0].slice(0, 200)}`
    }));
  } catch {
    // advisory: any failure is silence
  }
  process.exit(0);
});
