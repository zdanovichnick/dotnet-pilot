#!/usr/bin/env node
// DotnetPilot Build Verify — PostToolUse + PostToolUseFailure hook (Bash|PowerShell)
// Classifies `dotnet build` / `dotnet test` output, records the outcome in the
// shared build-state file (hooks/_lib/build-state.js) and, on failure, injects
// the top error lines as additionalContext. Advisory only — never blocks.
//
// The outcome is inferred from the output TEXT, not from an exit code:
//   - the Bash tool's success result carries no exit code at all;
//   - a build piped through `2>&1 | grep` exits with grep's status, so the
//     compiler can fail while the tool call "succeeds", and a clean build can
//     land on PostToolUseFailure because grep matched nothing.
// Non-zero exits arrive on PostToolUseFailure as a string `error` field
// ("Error: Exit code N\n<output>"). That text is classified the same way; the
// exit code alone counts as a failure only when the command is not piped.

const { hookEnabled } = require('./_lib/config');
const { recordFailure, recordSuccess } = require('./_lib/build-state');

const HOOK_NAME = 'dnp-build-verify';
const EXPECTED_PROTOCOL_VERSION = 1;

const DOTNET_CMD = /\bdotnet(?:\.exe)?\s+(build|test)\b/g;

const FAIL_MARKERS = [
  /Build FAILED/,
  /\berror\s+[A-Z]{2,6}\d{3,5}\b/,
  /Failed!\s+-\s+Failed:\s+[1-9]/,
  /Test Run Failed\./,
  /Test summary:.*\bfailed:\s*[1-9]/i,
  /\b[1-9]\d*\s+Error\(s\)/,
];
const SUCCESS_MARKERS = [
  /Build succeeded/,
  /\b0 Error\(s\)/,
  /Passed!\s+-\s+Failed:\s+0\b/,
  /Test Run Successful\./,
  /Test summary:.*\bfailed:\s*0\b/i,
];
const ERROR_LINE = /\berror\s+[A-Z]{2,6}\d{3,5}\b|Build FAILED|Failed!\s+-\s+Failed:|Test summary:|Test Run Failed/;

function emit(eventName, message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: `[${HOOK_NAME}] ${message}`
    }
  }));
}

// 'test' wins when a chained command runs both, since the test summary is the
// outcome that matters then.
function commandKind(command) {
  let kind = null;
  for (const m of command.matchAll(DOTNET_CMD)) {
    kind = m[1] === 'test' ? 'test' : (kind || 'build');
  }
  return kind;
}

function responseText(data, isFailureEvent) {
  if (isFailureEvent) return typeof data.error === 'string' ? data.error : '';
  const r = data.tool_response;
  if (r == null) return '';
  if (typeof r === 'string') return r;
  return [r.stdout, r.stderr, r.output].filter(s => typeof s === 'string').join('\n');
}

function classify(text, command, isFailureEvent) {
  if (FAIL_MARKERS.some(re => re.test(text))) return 'fail';
  if (SUCCESS_MARKERS.some(re => re.test(text))) return 'success';
  const piped = /\|/.test(command);
  if (isFailureEvent && !piped && /^Error: Exit code [1-9]/m.test(text)) return 'fail';
  return 'unknown';
}

function topErrors(text) {
  const seen = new Set();
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!ERROR_LINE.test(line) || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length === 10) break;
  }
  return lines;
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const eventName = (data && data.hook_event_name) || 'PostToolUse';

    if (!data || typeof data !== 'object' || !('tool_input' in data)) {
      emit(eventName, `[hook-version-mismatch] Expected tool_input in event payload (protocol v${EXPECTED_PROTOCOL_VERSION}).`);
      process.exit(0);
    }

    const cwd = data.cwd || process.cwd();
    if (!hookEnabled(cwd, 'build_verify')) process.exit(0);

    const command = (data.tool_input && data.tool_input.command) || '';
    const kind = commandKind(command);
    if (!kind) process.exit(0);

    const isFailureEvent = eventName === 'PostToolUseFailure';
    if (data.is_interrupt || (data.tool_response && data.tool_response.interrupted)) process.exit(0);

    const text = responseText(data, isFailureEvent);
    const outcome = classify(text, command, isFailureEvent);

    if (outcome === 'unknown') process.exit(0);
    if (outcome === 'success') {
      recordSuccess(cwd, command, kind);
      process.exit(0);
    }

    const failCount = recordFailure(cwd, command, kind);
    const label = kind === 'test' ? 'TEST FAILURE' : 'BUILD FAILURE';
    const shortCmd = command.split(/\s+/).slice(0, 4).join(' ');
    let message = `${label}: \`${shortCmd}\` failed.`;

    const errors = topErrors(text);
    if (errors.length > 0) {
      message += '\n\nTop errors:\n' + errors.map(e => `  - ${e}`).join('\n');
    }
    if (failCount >= 3) {
      message += `\n\nWARNING: ${failCount} consecutive build failures. Consider stopping to diagnose the root cause.`;
    }
    if (failCount >= 5) {
      message += '\n\nESCALATION: 5+ consecutive failures. Strongly recommend pausing execution and informing the user.';
    }

    emit(eventName, message);
  } catch (e) {
    process.exit(0);
  }
});
