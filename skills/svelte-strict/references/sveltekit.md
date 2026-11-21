# SvelteKit

`svs env` records the Kit version. Kit 3 changed several APIs (checked
against the official CHANGELOG); write for the installed major only.

| Topic | Kit 2 | Kit 3 |
|---|---|---|
| lib alias | `$lib` | `#lib` (explicit module extensions) |
| page store | `$app/state` (≥ 2.12.0) — `$app/stores` deprecated | `$app/stores` removed |
| CSRF | `csrf.checkOrigin` | `checkOrigin` removed, `csrf.trustedOrigins` only |
| cookie `path` | required | defaults to `/` |
| server-only modules | `$lib/server`, `*.server.*` | any `/server/` directory outside `src/routes` |
| Svelte config | `svelte.config.js` | passed through the Vite plugin |
| path helpers | `resolve()`/`asset()` from `$app/paths` (≥ 2.26.0) | same; `base`, `assets`, `resolveRoute` removed |

## Data loading (gated)

- `load` uses the `fetch` it receives: cookies are forwarded and SSR responses are inlined (`load-use-event-fetch`).
- `redirect()` and `error()` throw: never inside a `try` whose `catch` does not rethrow (`no-swallowed-redirect`).
- `load` and `actions` are typed from `./$types` (`kit-typed-load`); route components use `PageProps`/`LayoutProps` (≥ 2.16.0, `kit-typed-page-props`).
- Secrets only in server files: `$env/*/private` is rejected anywhere a client bundle can reach.
- Review: universal `load` returns serializable data only; independent awaits run in parallel; `depends`/`invalidate` keys match.

## Forms

- A POST `<form>` uses `use:enhance` from `$app/forms`, or spreads a remote `form` (`form-post-enhance`).
- Validate every action input on the server (review `server-input`); `fail(status, data)` for validation errors.
- Remote functions (≥ 2.27.0, `experimental.remoteFunctions`): any `query`/`command`/`form`/`prerender` that takes an argument passes a Standard Schema first (`remote-needs-schema`).

## SSR and state

- Module-level `$state` reachable from server code is shared by every request (`ssr-shared-state`, gate). Use `createContext` or `event.locals`.
- Module-level state in universal code is shared during SSR (`ssr-module-state`, review): mutate it only in the browser.
- No `window`/`document` at the top level of a component (`svelte/no-top-level-browser-globals`): use effects, attachments, or `onMount`.
- `locals` is written in `handle` only (`locals-only-in-handle`); `handle` always calls `resolve(event)` (`handle-calls-resolve`).
- CSRF protection stays on (`csrf-safe`).

## Navigation

- Internal links and `goto` go through `resolve()` (`svelte/no-navigation-without-resolve`, from Kit 2.26.0).
- Prefer `<a href>` over `goto` for plain navigation.
