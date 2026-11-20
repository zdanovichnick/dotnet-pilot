## Specialist memory

This checklist keeps project memory in `<solution-root>/.claude/agent-memory/{{name}}/`, the
folder Claude Code uses for the same agent, so every host shares one memory per repository.

- Before the checklist, read `MEMORY.md` in that folder if it exists.
- After it, record only durable project facts: a convention, a decision and its reason, a
  recurring false positive. Write one short Markdown file per fact and add a one-line pointer
  to it in `MEMORY.md`. Update an existing entry rather than adding a duplicate, and keep
  `MEMORY.md` under 200 lines.
- Never store secrets, tokens, connection strings or personal data there.
- This folder is the only place a read-only checklist writes. It is meant to be committed;
  if the user does not want it, skip this section.
