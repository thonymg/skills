# Svelte 5 — state, migration, tests

## State decision table (Svelte 5)

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

### Stores

Stores still work in Svelte 5. Keep `readable`, `derived`, `fromStore`,
`toStore` and `get` for external sources and interop (`store-usage`, review).
A `writable` used as plain shared state is legacy (`no-store-as-state`, gate):
replace it with a class with `$state` fields. Existing stores in legacy code
are not blocking (baseline); they show up in `svs legacy-report`.

### Reactivity traps (all gated)

- Destructuring a `$state` object or the props object at top level copies the values once (`no-destructure-reactive`). `let { a } = $props()` itself is fine.
- `let color = type === 'x' ? …` with `type` a prop never updates (`prop-derived-without-derived`).
- Mutating a prop that is not `$bindable()` (`no-prop-mutation`) and `bind:` on such a prop (`no-bind-non-bindable-prop`): the owner never sees the change.
- `structuredClone`/`postMessage` of a `$state` proxy throws: pass `$state.snapshot(x)` (`snapshot-before-clone`).
- `$effect` does not run on the server: no `if (browser)` around or inside it (`no-browser-guard-in-effect`).
- `$effect.root` returns a dispose function: keep it (`effect-root-dispose`).
- Debug a re-run: `$inspect.trace(label)` as the first line of the effect/derived; never commit `$inspect` (`svelte/no-inspect`).

### Classes with state

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

## Legacy → runes migration

`svs legacy-report` lists every legacy finding per file: that list is the
work order. Migrate leaves first (components that import nothing legacy),
then their parents. One component per `svs start --kind migration` task keeps
the diff reviewable. A file switches to runes mode as soon as it uses one
rune: migrate the whole component at once, never half.

| Legacy | Runes | Trap |
|---|---|---|
| `export let a = 1` | `let { a = 1 } = $props()` | Values derived from `a` must become `$derived` (they were `$:` before, or silently stale). |
| `export let value` + parent `bind:value` | `let { value = $bindable() } = $props()` | Without `$bindable` the parent never sees updates. |
| `$$props`, `$$restProps` | `let { a, ...rest } = $props()` | `rest` keeps reactivity; spread it with `{...rest}`. |
| `$: b = a * 2` | `let b = $derived(a * 2)` | Only pure computations. |
| `$: if (x) doSomething()` | `$effect(() => { if (x) doSomething(); })` | Prefer moving the call into the event handler that changes `x`. Effects must clean up what they start. |
| `$: { … }` with several assignments | several `$derived`, or one `$derived.by` | Never an effect that writes state. |
| `on:click={f}` | `onclick={f}` | Modifiers have no syntax: call `e.preventDefault()` / `e.stopPropagation()` in the handler; `once` → wrap the handler. |
| `on:click` (forwarding) | accept an `onclick` prop and spread it or pass it down | |
| `createEventDispatcher` | callback props (`let { onsave } = $props(); onsave?.(data)`) | Event names become prop names. |
| `<slot />` | `{@render children?.()}` | `children` is a `Snippet` prop. |
| `<slot name="x" {item} />` | `{@render x?.(item)}`, parent passes `{#snippet x(item)}…{/snippet}` | Slot props become snippet parameters. |
| `$$slots.x` | `if (x)` on the snippet prop | |
| `<svelte:component this={C} />` | `<C />` (C is dynamic by default) | |
| `<svelte:self />` | `import Self from './Self.svelte'` | |
| `<svelte:fragment slot="x">` | `{#snippet x()}` | |
| `use:action={p}` | `{@attach fromAction(action, () => p)}` or a native attachment (svelte ≥ 5.29.0; `fromAction` ≥ 5.32.0) | `use:enhance` from `$app/forms` stays: it is SvelteKit's API. |
| `class:active={on}` | `class={['base', on && 'active']}` or `cn()` (svelte ≥ 5.16.0) | |
| `beforeUpdate` / `afterUpdate` | `$effect.pre` / `$effect` | |
| `writable` store as shared state | class with `$state` fields | `$store` auto-subscription disappears: read fields directly. |
| `$app/stores` (`$page`) | `$app/state` (`page`) | `page` is not a store: `page.url`, not `$page.url`. Removed in Kit 3. |

After each component: `svs verify` must pass on it, and its own entries vanish
from `svs legacy-report`.

## Testing Svelte 5

- Wait on state, never on time: `flushSync()` after a synchronous state change, `await tick()` for a pending update, `expect.poll(…)`/`waitFor` for async work. `setTimeout` in a test file is a gate finding (`test-no-sleep`).
- Logic in `.svelte.ts` modules is tested directly; test files that use runes are named `*.svelte.test.ts`.
- Effects outside a component run inside `$effect.root`; keep and call its dispose (`effect-root-dispose`):

```ts
import { flushSync } from 'svelte';
import { expect, test } from 'vitest';
import { Counter } from './counter.svelte';

test('double follows count', () => {
  const dispose = $effect.root(() => {
    const c = new Counter();
    c.increment();
    flushSync();
    expect(c.double).toBe(2);
  });
  dispose();
});
```

- Components are tested through their contract: props in, callback props and accessible output out (roles, labels), not internal DOM structure (review `test-contract`).
- Module-level state is reset between tests (review).
- New logic or a bug fix starts with a failing test, recorded by `svs step test-first -- bash <fix-root-dir>/scripts/verify-test-first.sh …`.
