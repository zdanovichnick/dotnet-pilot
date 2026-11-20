---
description: "Build a feature that needs both an ASP.NET API change and a React/TypeScript UI change — fixes the API contract first, runs a backend and a frontend agent in parallel, then proves the two sides agree."
argument-hint: "<task-description> [--ui <path>] [--complexity easy|hard]"
effort: medium
---

# Full-stack feature

`/dotnet-pilot:fullstack:feature` implements one feature across an ASP.NET API and its React +
TypeScript client. The UI can be a folder in the API repository or a separate repository.

> **Delegates to**: `dnp-tdd-developer-easy` or `dnp-tdd-developer-hard` for the API, and
> `dnp-frontend-developer` (sonnet, effort medium) for the UI, both spawned in the same message;
> `dnp-architect` for an architectural `[HALT` question.

Use it when the task needs both sides. API only → `/dotnet-pilot:dotnet:tdd`. UI only, with no
contract change → brief `dnp-frontend-developer` directly.

## Execution

### 1. Discover

With no task description, stop and ask for one.

- **Solution**: `.planning/solution-map.json`, else `mcp__roslyn__get_solution_structure`. The
  session must be open in the API repository; Roslyn needs the solution at or above the cwd.
- **Frontend root**, first match wins:
  1. `--ui <path>`
  2. `frontend.path` in `.planning/config.json` (relative values resolve against the cwd)
  3. a `package.json` in this repository, outside `node_modules`, that depends on `react`
  4. ask the user for the path with `AskUserQuestion`, and offer to save it as `frontend.path`
- Resolve it to an absolute path. Confirm it exists and its `package.json` depends on `react`.
  Creating a new frontend app is out of scope: stop and say so.
- If the root is outside this session's working directories, **stop before spawning anything** and
  tell the user to run `/add-dir <path>` (or restart with `claude --add-dir <path>`), then rerun.
  An agent cannot answer a permission prompt.
- From the root, detect per the `react-typescript` skill: Next.js or Vite, package manager,
  test / typecheck / lint script names, data library, the existing API client style.
- `git -C <root> rev-parse --show-toplevel` against the solution's toplevel: same repository or
  two. The report in step 7 depends on it.

### 2. Check the contract pipeline

Find how TypeScript types are produced from the API (the `api-contract` skill has the detail):

1. a script in the frontend's `package.json` that generates them — use it;
2. else a build-time OpenAPI document (`OpenApiGenerateDocumentsOnBuild` in the API `.csproj`)
   plus `openapi-typescript`;
3. else ask the user once: set the pipeline up now (it adds a NuGet package and an npm
   dev-dependency), or run this time with hand-written types and report drift as **unverified**.

When the existing script downloads the document from a deployed environment, it cannot see the new
endpoint. Generate from the document the local build produced and pass that file as the input.
When the UI repository keeps a committed copy of the document, update that copy and name it in
the report.

### 3. Write the contract

Write it in the `api-contract` format — route, verb, auth, request and response JSON with wire
names, every status code, the `ProblemDetails` cases — and show it to the user. If a point is
ambiguous and only the user can settle it, ask now; a question after the spawn costs both agents.
The contract goes inline into both briefs. No file is written.

**Design check.** The task designs something when it adds or visibly changes a screen, page,
component, form or layout. Wiring a new field into UI that already exists is not design work.

- Design → the frontend brief says: apply the `ui-ux-design` skill and put the design note first
  in the report. Name any design source the user gave (mockup, Figma link, screenshot).
- No design → the brief says: match the existing UI, no design note.

### 4. Spawn both agents in one message

Both `Agent` calls go in the **same** message so they run concurrently. Neither waits for the
other; the contract is what keeps them aligned.

**Backend** — `dnp-tdd-developer-easy` or `dnp-tdd-developer-hard`, chosen by the complexity
routing in `/dotnet-pilot:dotnet:tdd` applied to the API half only. Brief:

- the task and the contract, verbatim
- solution structure, test project and conventions, architecture style (as `dotnet:tdd` step 4)
- boundary: edit only the solution's .NET projects; never touch `<frontend root>`
- the contract is fixed: a needed change is a `[HALT`, not an edit

**Frontend** — `dnp-frontend-developer`. Brief:

- the task and the same contract, verbatim
- the frontend root as an **absolute path**, copied from step 1, and whether it is another repository
- detected framework, package manager, script names, data library, API client style
- the seam module path to create or extend, where the contract's types are declared
- the design instruction from step 3
- boundary: edit only under the frontend root

### 5. Handle the verdicts

Per agent, as `/dotnet-pilot:dotnet:tdd` steps 5–6: `[ROUTING:` → spawn the hard agent with the
brief plus the reasons; `[PARTIAL:` → report what is done and what is left; `[HALT:` → put the
question to the user with `AskUserQuestion` (through `dnp-architect` first when it is
architectural), then re-spawn that agent with the answer.

One rule is specific to this command: **when an answer changes the contract, re-brief the other
agent too**, with the changed contract and the diff. If that agent has already finished, re-spawn
it with its own report and the diff. A contract that changed on one side only is the failure this
command exists to prevent.

### 6. Reconcile and verify

Run each as its own command. Never chain them: a chained `dotnet build && tsc` hides which side
failed.

1. `dotnet build <sln> --nologo -v q`
2. `dotnet test <sln> --no-build --nologo`
3. Generate the TypeScript types (step 2's pipeline) from the local build's document.
4. Point the seam module's types at the generated ones, replacing the hand-written declarations.
5. Typecheck the frontend (its script, else `tsc --noEmit -p <root>`).
6. Frontend tests, then lint when a script exists.

Target the frontend with the package manager's directory flag (`npm --prefix <root> run …`,
`pnpm -C <root> …`, `yarn --cwd <root> …`).

A type error in step 5 is **contract drift**. Compare the generated type with the contract to find
the side that departed from it, and re-spawn that side with the compiler output and the contract.
Do not fix drift by editing the seam module to match whatever the API returned.

In the hand-written-types mode, skip 3–4 and report drift as **unverified**.

### 7. Report

- the contract as built
- per side: files changed, tests added, build / test / typecheck / lint results
- the design note, when there was one
- drift status: **verified** (generated types compile against the UI) or **unverified**
- two repositories: `git -C <repo> status --short` for each, and the merge order — the API change
  ships first or stays backward compatible, because the UI depends on it

Nothing here commits, pushes or opens a pull request in either repository.
