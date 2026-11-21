# State decision table (Svelte 5)

Pick the first row that matches. The "Rule" column names what `svs verify`
checks; "review" rows are in the report checklist.

| Need | Use | Rule |
|---|---|---|
| A value read by the template, a `$derived` or an `$effect` | `let x = $state(v)` | `svelte/no-unnecessary-state-wrap` (plain `let` otherwise) |
| A large object that is only ever replaced (API response) | `$state.raw(v)` | review `state-raw` |
| A value computed from other state or props | `$derived(expr)` / `$derived.by(fn)` | `prefer-writable-derived`, `derived-with-function`, `prop-derived-without-derived` |
| A computed value the user can temporarily override (optimistic UI) | assign to the `$derived` (writable since svelte 5.25.0) | — |
| `Map`, `Set`, `Date`, `URL`, `URLSearchParams` that must be reactive | `SvelteMap`, `SvelteSet`, `SvelteDate`, `SvelteURL`… from `svelte/reactivity` | `svelte/prefer-svelte-reactivity` |
| State shared by a component subtree (SSR-safe, per request) | `createContext` (svelte ≥ 5.40.0) or `setContext`/`getContext` | `ssr-shared-state` |
| State shared across the client app | class with `$state` fields in a `.svelte.ts`, exported as an instance or factory | `no-export-primitive-state`, `ssr-module-state` (review) |
| External source: WebSocket, media query, DOM API, RxJS | `createSubscriber` (svelte ≥ 5.7.0) or a `readable` store | review `external-source` |
| Page data in SvelteKit | `$app/state` (`page`, `navigating`, `updated`) | `no-restricted-imports` on `$app/stores` (kit ≥ 2.12.0; removed in kit 3) |
| A side effect on the outside world (DOM, analytics, a library) | `$effect` with a cleanup, or `{@attach}` for a DOM node | `effect-needs-cleanup`, `effect-fetch-needs-abort` |

## Stores

Stores still work in Svelte 5. Keep `readable`, `derived`, `fromStore`,
`toStore` and `get` for external sources and interop (`store-usage`, review).
A `writable` used as plain shared state is legacy (`no-store-as-state`, gate):
replace it with a class with `$state` fields. Existing stores in legacy code
are not blocking (baseline); they show up in `svs legacy-report`.

## Reactivity traps (all gated)

- Destructuring a `$state` object or the props object at top level copies the values once (`no-destructure-reactive`). `let { a } = $props()` itself is fine.
- `let color = type === 'x' ? …` with `type` a prop never updates (`prop-derived-without-derived`).
- Mutating a prop that is not `$bindable()` (`no-prop-mutation`) and `bind:` on such a prop (`no-bind-non-bindable-prop`): the owner never sees the change.
- `structuredClone`/`postMessage` of a `$state` proxy throws: pass `$state.snapshot(x)` (`snapshot-before-clone`).
- `$effect` does not run on the server: no `if (browser)` around or inside it (`no-browser-guard-in-effect`).
- `$effect.root` returns a dispose function: keep it (`effect-root-dispose`).
- Debug a re-run: `$inspect.trace(label)` as the first line of the effect/derived; never commit `$inspect` (`svelte/no-inspect`).

## Classes with state

```ts
// counter.svelte.ts
export class Counter {
  count = $state(0);
  double = $derived(this.count * 2);
  increment = () => { this.count++; }; // arrow: `this` survives being passed as a callback
}
```

Methods passed as callbacks (`onclick={counter.increment}`) lose `this` unless
they are arrow-function fields.
