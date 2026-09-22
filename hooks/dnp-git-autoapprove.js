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
// normal prompt; a false approve could run an unvetted command). Nothing is ever
// denied: an unapproved command emits nothing.
//   - The Claude Code multi-line commit is approved only in its exact shape:
//     `git commit [safe flags] -m "$(cat <<'EOF'\n<body>\nEOF\n)"` — quoted
//     delimiter (so the body is never expanded), one terminator line, nothing
//     before `git` or after the closing `)"`.
//   - Every other command is tokenized and must be a single `git <subcommand>`
//     or `gh <group> <verb>` from the allowlists below. Any shell metacharacter
//     that could chain, substitute, redirect, expand or glob rejects it.
//   - Per-subcommand option bans cover flags that run another program
//     (`--exec`, `-x`, `--upload-pack`, `--receive-pack`, `--ext-diff`, merge
//     strategies), write arbitrary files (`--output`), or discard work (force
//     push, branch -D, stash drop). Long options are matched by prefix because
//     git accepts unambiguous abbreviations (`--forc` is `--force`).
//   - `reset`, `restore`, `clean`, `config` and `gh api` are absent; `checkout`
//     is approved only as `checkout -b <branch> [<start>]`.
//   - Only the Bash tool is handled; PowerShell's `;`/`&` semantics differ and
//     its commands keep the normal prompt.
//
// Gated by `.planning/config.json` -> `hooks.git_autoapprove` (default-on when
// the file is absent). Set it to `false` to restore manual confirmation.

const { hookEnabled } = require('./_lib/config');

const HOOK_NAME = 'dnp-git-autoapprove';

const GLOBAL_BANNED_LONG = ['output', 'ext-diff', 'exec', 'upload-pack', 'receive-pack'];

const REMOTE_URL = /:\/\/|::|^[^\s/]+@[^\s/]+:/;

const GIT_RULES = {
  status: {},
  diff: {},
  log: {},
  show: {},
  'rev-parse': {},
  describe: {},
  add: {},
  commit: { long: ['no-verify'], short: 'n' },
  branch: { long: ['force'], short: 'DfMC' },
  switch: { long: ['force', 'force-create', 'discard-changes'], short: 'fC' },
  checkout: { check: args => args[0] === '-b' && (args.length === 2 || args.length === 3) &&
    args.slice(1).every(a => !a.startsWith('-')) },
  stash: { check: args => !['drop', 'clear'].includes(args[0]) },
  tag: { long: ['delete', 'force'], short: 'df' },
  remote: { check: args => args.length === 0 || ['-v', '--verbose', 'show', 'get-url'].includes(args[0]) },
  fetch: { long: ['force'], short: 'uf', remote: true },
  pull: { long: ['force', 'strategy', 'no-verify'], short: 'ufs', remote: true },
  push: {
    long: ['force', 'force-with-lease', 'force-if-includes', 'delete', 'mirror', 'prune', 'no-verify'],
    short: 'fd',
    remote: true,
    check: args => !args.some(a => a.startsWith('+') || a.startsWith(':')),
  },
  merge: { long: ['strategy', 'no-verify'], short: 's' },
  rebase: { long: ['strategy'], short: 'xs' },
  'cherry-pick': { long: ['strategy'] },
};

const GH_RULES = {
  pr: ['create', 'view', 'list', 'checks', 'diff', 'status'],
  run: ['list', 'view'],
  issue: ['view', 'list'],
  repo: ['view'],
};
// `--body-file` would post the contents of any local file to GitHub. gh does
// not abbreviate long options, so these match exactly.
const GH_BANNED_LONG = ['body-file'];
const GH_BANNED_SHORT = 'F';

// Commit flags accepted between `git commit` and `-m` in the heredoc form.
const HEREDOC_SAFE_FLAGS = new Set(['-a', '--all', '--amend', '-s', '--signoff', '-q', '--quiet',
  '-v', '--verbose', '--allow-empty']);
const HEREDOC_COMMIT =
  /^git[ \t]+commit((?:[ \t]+-[-\w]+)*)[ \t]+-m[ \t]+"\$\(cat[ \t]+<<'([A-Za-z_]\w*)'\n([\s\S]*)\n\2\n\)"$/;

// Rejected before tokenizing — anywhere in the command, even inside quotes.
// `$` covers every expansion, `{}` brace expansion, `*?[` globs (a file named
// `--force` would expand into a flag), `\` escapes the tokenizer does not model.
const UNSAFE_CHARS = /[|&;<>`$\\{}*?[\]\r\n]/;

function isHeredocCommit(cmd) {
  const m = cmd.match(HEREDOC_COMMIT);
  if (!m) return false;
  const [, flags, delim, body] = m;
  if (flags.trim() && !flags.trim().split(/[ \t]+/).every(f => HEREDOC_SAFE_FLAGS.has(f))) return false;
  if (body.split('\n').some(line => line === delim)) return false;
  return parensBalanced(body);
}

// bash 3.2 (macOS /bin/bash) finds the end of `$(...)` by counting parens,
// heredoc or not, so an unbalanced `)` in the body could end the substitution
// early and run the rest of the body as shell.
function parensBalanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

// Whitespace split honouring '...' and "..." (their contents are already free
// of UNSAFE_CHARS). Returns null on an unbalanced quote.
function tokenize(cmd) {
  const tokens = [];
  let cur = null;
  let quote = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur = cur ?? '';
    } else if (/\s/.test(ch)) {
      if (cur !== null) tokens.push(cur);
      cur = null;
    } else {
      cur = (cur ?? '') + ch;
    }
  }
  if (quote) return null;
  if (cur !== null) tokens.push(cur);
  return tokens;
}

function optionsBanned(args, bannedLong, bannedShort, abbreviates = true) {
  for (const a of args) {
    if (a === '--') break;
    if (a.startsWith('--')) {
      const name = a.slice(2).split('=')[0];
      if (name && bannedLong.some(b => (abbreviates ? b.startsWith(name) : b === name))) return true;
    } else if (bannedShort && /^-[A-Za-z]/.test(a) && [...a.slice(1)].some(c => bannedShort.includes(c))) {
      return true;
    }
  }
  return false;
}

function gitApprovable(args) {
  if (!Object.hasOwn(GIT_RULES, args[0])) return false;
  const rule = GIT_RULES[args[0]];
  const rest = args.slice(1);
  if (optionsBanned(rest, [...GLOBAL_BANNED_LONG, ...(rule.long || [])], rule.short)) return false;
  if (rule.remote && rest.some(a => REMOTE_URL.test(a))) return false;
  return rule.check ? rule.check(rest) : true;
}

function ghApprovable(args) {
  if (!Object.hasOwn(GH_RULES, args[0]) || !GH_RULES[args[0]].includes(args[1])) return false;
  return !optionsBanned(args.slice(2), GH_BANNED_LONG, GH_BANNED_SHORT, false);
}

function isAutoApprovable(command) {
  const cmd = (command || '').trim();
  if (!cmd) return false;

  if (/^git[ \t]+commit\b/.test(cmd) && cmd.includes('<<')) return isHeredocCommit(cmd);

  if (UNSAFE_CHARS.test(cmd)) return false;
  const tokens = tokenize(cmd);
  if (!tokens || tokens.length < 2) return false;
  if (tokens[0] === 'git') return gitApprovable(tokens.slice(1));
  if (tokens[0] === 'gh') return ghApprovable(tokens.slice(1));
  return false;
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
    if (data.tool_name && data.tool_name !== 'Bash') process.exit(0);

    const cwd = data.cwd || process.cwd();
    if (!hookEnabled(cwd, 'git_autoapprove')) process.exit(0);

    const command = data.tool_input?.command || '';
    if (isAutoApprovable(command)) {
      allow('safe git/gh command — auto-approved to skip the permission prompt');
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
