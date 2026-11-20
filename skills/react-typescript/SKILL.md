---
name: react-typescript
description: Working in an existing React + TypeScript client of an ASP.NET API — detecting its framework, package manager, test runner and conventions, and the Next.js / Vite gotchas at the API boundary.
when_to_use: Before writing or changing React/TypeScript code in a frontend that calls a .NET API — to detect Next.js vs Vite, the package manager, the test runner, the data-fetching and styling conventions, and how the app reaches the API.
---

# React + TypeScript

The frontend counterpart of `convention-learner`: learn what the app already does, then match it.
An existing choice always wins over a default from this file.

## Detection

Read `package.json` and the lockfile first. They answer most of it.

| Question | Where to look |
|----------|---------------|
| Framework | `next` dependency → Next.js; an `app/` folder → App Router, `pages/` → Pages Router. `vite` + `react` and no `next` → Vite SPA |
| Package manager | `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lock`/`bun.lockb` → bun, `package-lock.json` → npm. Never mix them: a second lockfile is a broken install for the next person |
| Scripts | `scripts` in `package.json`: the real names for test, lint, typecheck, type generation. Run those, not a guessed command |
| Test runner | `vitest` or `jest` dependency; `@testing-library/react`; `playwright`/`cypress` for end-to-end; `msw` for network mocks |
| TypeScript strictness | `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, path aliases (`@/*`) |
| Data fetching | `@tanstack/react-query`, `swr`, RTK Query, or plain `fetch` in Server Components. Follow the one in use |
| API client | A generated `schema.d.ts`, `openapi-fetch`, orval, NSwag output, or a hand-written wrapper. Find the wrapper and call through it |
| Forms and validation | `react-hook-form`, `zod`, `yup`, `formik` |
| Styling | Tailwind config, CSS Modules, styled-components/emotion, a component library (shadcn/ui, MUI, Mantine, Ant) |
| Folder style | Feature folders (`features/orders/…`) or type folders (`components/`, `hooks/`). File naming: `OrderList.tsx` or `order-list.tsx` |
| Repo rules | The frontend's own `CLAUDE.md` / `AGENTS.md`, ESLint and Prettier config. In a two-repository setup the session did not load them |

Read two or three neighbouring components and one test before writing. State what was detected
in one line, then match it.

## References

Load only the one that matches the framework:

| File | Covers |
|------|--------|
| `references/nextjs.md` | Server/client boundary, env variables, rewrites to the API, what unit tests cannot cover |
| `references/vite-spa.md` | Dev proxy vs production, `VITE_` env variables, CORS |

## Gotchas at the API boundary

1. **Types come from the seam module, not from the component.** See `skills/api-contract/SKILL.md`.
   A component that declares its own copy of a response type hides contract drift.
2. **`fetch` does not reject on 4xx/5xx.** Check `response.ok`, and read the error body as
   `ProblemDetails`. A wrapper that calls `response.json()` on a `204` throws.
3. **`as` is not validation.** `(await res.json()) as Order` asserts; it does not check. The
   generated types are the check at build time. Add a runtime schema only where the project
   already uses one.
4. **Every request needs its loading, empty and error path.** The contract lists the error
   statuses; each one is a branch in the UI, not a `console.error`.
5. **Cancel what the user left.** Pass the `AbortSignal` the data library gives you; a late
   response must not overwrite newer state.
6. **Auth follows the existing wrapper.** A cookie session needs `credentials: 'include'` and
   server-side CORS with credentials; a bearer token belongs in the wrapper, never in a component.
7. **Do not start the dev server** to check work. Use the typecheck, test and lint scripts; a
   dev server does not exit.

## Tests

- Test behaviour through the rendered output: query by role and label, act as a user would,
  assert on what the user sees. No assertions on component internals or state.
- Mock at the network (`msw`, or the project's fetch mock) with payloads that match the contract
  exactly. A mock that returns a shape the API does not is a green test for a broken screen.
- One test per state the contract creates: success, empty, each error status that has its own UI.
- Never change an existing test to make it pass.

## Do / Don't

| Do | Don't |
|----|-------|
| Use the scripts and package manager the repo already has | Add a second lockfile, generator, data library or component library |
| Keep `strict` type errors at zero; fix the type | Silence with `any`, `as unknown as`, `// @ts-ignore` |
| Reuse the shared components and tokens | Hard-code a colour, spacing value or one-off button |
| Put contract types in one seam module | Re-declare response types per component |
