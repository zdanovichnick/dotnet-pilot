## Host runtime

Paths in this package resolve from the installed plugin, not the consumer solution.
Read only the workflow, specialist checklists, and pattern skills relevant to the request.

- Execute specialist checklists in the current agent. Routing markers identify the next
  checklist to read; they do not require a particular model or a registered subagent.
  Native agents may be used when the host and the user's task authorize delegation.
- Discover the Roslyn server's exposed tools by their function names. Hosts may prefix
  tool names with the plugin and server names. A `roslyn.<name>` reference means the
  corresponding exposed tool, not a literal tool identifier. If unavailable, use the
  documented CLI/file inspection fallback and report semantic checks as skipped.
- Use the host's file search, reading, editing, shell, and user question capabilities.
  Do not assume Claude tool names or a particular shell. On Windows use PowerShell
  syntax; use a temporary UTF-8 file with `gh pr create --body-file <path>` for PR text.
- Resolve `.planning/` from `DNP_PLANNING_DIR` when configured (relative paths resolve
  from the consumer solution root), otherwise `<solution-root>/.planning/`.
  A bare `solution-map.json` reference means the file in that resolved directory.
  Never read or write Claude's user settings. If the cache is absent, discover the solution
  with the project-init skill. Before creating state, ensure it is ignored by Git
  (use `.git/info/exclude` for a local checkout if appropriate).
- Hooks are not installed by this package. Explicitly run build/test verification,
  DI checks when services change, and migration inspection when migrations change.
- Generate migrations with `dotnet ef migrations add`; inspect generated `Up()` and
  idempotent SQL. Ask which context to use when ambiguous. Do not silently apply a
  migration to a shared database. Commit, push, and PR steps depend on the user's
  requested scope; a workflow invocation alone does not authorize unrelated publishing.
- Report checks actually run and their results. Missing tools, a non-buildable solution,
  and skipped checks must remain visible in the result.
