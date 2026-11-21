# Legacy → runes migration

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
