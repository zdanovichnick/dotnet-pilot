#!/usr/bin/env node
// DotnetPilot Git Auto-Approve — PreToolUse hook (Bash)
//
// Removes the permission round-trip on the commit + PR workflow by returning
// `permissionDecision: "allow"` for safe `git`/`gh` invocations. This is the
// ONE non-advisory hook in the plugin: instead of emitting `additionalContext`,
// it speaks the PreToolUse permission protocol so the command runs without a
// prompt. Everything else stays advisory.
//
// SAFETY MODEL — bias toward *under*-approving (a miss just falls through to the
// normal prompt; a false approve could run an unvetted command):
//   - First token MUST be `git` or `gh`.
//   - The Claude Code multi-line commit (`-m "$(cat <<'EOF' ... EOF)"`) is
//     approved ONLY when the command ENDS at the heredoc terminator — any
//     trailing `&& ...` / `; ...` chaining fails the anchor and is NOT approved.
//   - Any other command containing shell chaining/substitution/redirection
//     (`&&`, `||`, `;`, `|`, backtick, `$(`, `>`, `<`) is NOT approved.
//   - Only an allow-listed set of git/gh subcommands is approved.
//
// Gated by `.planning/config.json` -> `hooks.git_autoapprove` (default-on when
// the file is absent). Set it to `false` to restore manual confirmation.
//
// NOTE: this approves outward-facing actions (`git push`, `gh pr create`) by
// design — per the plugin owner's request. Toggle off per-project if undesired.

const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-git-autoapprove';

// Allow-listed git subcommands (read + write + outward-facing).
const GIT_SUBCMD = /^git\s+(status|diff|log|show|add|commit|branch|switch|checkout|restore|stash|rev-parse|describe|tag|fetch|pull|push|remote|config|cherry-pick|merge|rebase|reset)\b/;
// Allow-listed gh subcommands.
const GH_SUBCMD = /^gh\s+(pr|repo|issue|run|api|auth|browse|release|workflow)\b/;

// Shell constructs that could smuggle a non-git command alongside an approved one.
const DANGEROUS = /(\|\||&&|;|\||`|\$\(|>|<)/;

// The Claude Code default commit: `git commit ... -m "$(cat <<'EOF' ... \nEOF\n)"`.
// Approve only when the heredoc terminator is the tail of the command (no trailing chain).
// `...\n<TERMINATOR>` followed only by whitespace / `)` / quotes to the end of
// the command. A trailing `&& ...` introduces non-whitespace and fails `$`.
const HEREDOC_COMMIT_TAIL =
  /^git\s+commit\b[\s\S]*<<[-~]?\s*(['"]?)([A-Za-z_]\w*)\1[\s\S]*?\n[ \t]*\2[\s)"']*$/;

function isAutoApprovable(command) {
  const cmd = (command || '').trim();
  if (!cmd) return false;
  if (!/^(git|gh)\b/.test(cmd)) return false;

  // Known multi-line commit pattern — checked before the DANGEROUS gate because
  // the heredoc body legitimately contains `$(`, `<<`, etc.
  if (/^git\s+commit\b/.test(cmd) && /<<[-~]?['"]?[A-Za-z_]/.test(cmd)) {
    return HEREDOC_COMMIT_TAIL.test(cmd);
  }

  // Any other command must be a single, un-chained git/gh invocation.
  if (DANGEROUS.test(cmd)) return false;
  return GIT_SUBCMD.test(cmd) || GH_SUBCMD.test(cmd);
}

function allow(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: `[${HOOK_NAME}] ${reason}`
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
    if (!data || typeof data !== 'object' || !('tool_input' in data)) process.exit(0);

    const cwd = data.cwd || process.cwd();
    if (!hookEnabled(cwd, 'git_autoapprove')) process.exit(0);

    const command = data.tool_input?.command || '';
    if (isAutoApprovable(command)) {
      allow('safe git/gh command — auto-approved to skip the permission prompt');
    }
    // Not approvable → emit nothing, fall through to the normal permission flow.
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
