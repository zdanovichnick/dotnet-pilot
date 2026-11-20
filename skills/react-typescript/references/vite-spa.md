# React + Vite SPA with an ASP.NET API

## Dev proxy is dev only

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'https://localhost:7001', changeOrigin: true, secure: false },
    },
  },
})
```

- `server.proxy` configures the Vite **dev server**. The production build is static files; it
  has no proxy. In production the app is either served from the same origin as the API (ASP.NET
  static files or a reverse proxy) or it calls another origin and the API needs CORS.
- Check the existing proxy keys before adding a route. A new prefix that no key matches is served
  by Vite, which answers with `index.html` and a `200`; the client then fails parsing HTML as JSON.
- A `rewrite` that strips `/api` means the browser path and the ASP.NET route differ. Write the
  client path the way the neighbouring calls do.
- With a non-relative `base`, each proxy key carries that base as a prefix.

## Environment variables

- Only names prefixed `VITE_` are exposed, on `import.meta.env`, and always as **strings**
  (`'false'` is truthy). They are inlined at build time.
- Declare new ones in `src/vite-env.d.ts` under `ImportMetaEnv`. That file must not contain an
  `import`, or the augmentation stops working.
- Nothing in a Vite bundle is secret. A key the browser can read is public.

## CORS, when the origins differ

The fix is on the API (`AddCors` + `UseCors`, with the SPA origin named, and `AllowCredentials`
when a cookie is sent), not a client-side workaround. `fetch` with `credentials: 'include'` and a
wildcard origin on the server is rejected by the browser.

## Type checking and tests

- `vite build` does not type-check. Use the repo's typecheck script, usually `tsc --noEmit` or
  `tsc -b`.
- Vitest reads `vite.config.ts` (or `vitest.config.ts`): path aliases and the `jsdom`/`happy-dom`
  environment come from there. Follow the existing setup file for Testing Library matchers.
- Client-side routing means a deep link works in dev and returns 404 in production unless the
  host falls back to `index.html` (`MapFallbackToFile` on ASP.NET). A new route does not need a
  server change if that fallback already exists.
