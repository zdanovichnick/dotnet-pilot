# Next.js (App Router) with an ASP.NET API

## Server and client boundary

- A module is a Server Component unless `'use client'` is the first statement of the file, before
  any import. The directive covers the whole module and everything it imports.
- Add `'use client'` only to the file that is the entry point into client code (the component a
  Server Component renders). Its children do not need it. Putting it high in the tree pulls the
  whole subtree into the browser bundle.
- State, effects, event handlers and browser APIs need a Client Component.
- Props that cross from server to client must be serializable. A function prop such as `onClick`
  throws; a Server Function marked `'use server'` crosses as a reference.

## Where the API call runs

| Call site | Runs | Consequence |
|-----------|------|-------------|
| Server Component, Route Handler, Server Function | On the Next.js server | Server-to-server. No CORS. Needs the API's internal base URL and must forward the user's cookie or token itself |
| Client Component | In the browser | Same-origin through a rewrite, or cross-origin with CORS configured on the API |

Pick the place the surrounding code already uses. A screen that fetches in a Server Component and
again in a Client Component has two auth paths to keep correct.

## Environment variables

- Only names prefixed `NEXT_PUBLIC_` reach the browser. They are inlined at build time, so a
  changed value needs a rebuild.
- Everything else is server-only. Add `import 'server-only'` to a module that reads a secret; the
  build then fails if a Client Component imports it.
- An API base URL read in a Client Component must be `NEXT_PUBLIC_…`, or the call goes to
  `undefined/api/...`.

## Reaching the API without CORS

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'https://localhost:7001/api/:path*' }]
  },
}

export default nextConfig
```

Check for an existing rewrite before adding one, and check that the new route's prefix is covered
by it. A route the rewrite does not match returns the Next.js 404 page, which the client then
fails to parse as JSON.

## Tests

- Vitest and Jest do not support `async` Server Components. Unit-test synchronous Server
  Components and Client Components; cover an `async` one with the project's end-to-end tests, or
  move its logic into a plain function and test that.
- A Client Component test needs no Next.js runtime, but `next/navigation` hooks must be mocked the
  way the neighbouring tests mock them.

## Type checking

`next build` type-checks, but it also builds. Use the repo's typecheck script, or
`tsc --noEmit -p <frontend root>`, to check types alone.
