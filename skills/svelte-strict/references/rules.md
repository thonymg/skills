# Rule catalog (generated — `svs gen-references`, do not edit)

Gate rules block `svs verify`/`svs finish` when NEW (D1). Review rules and the checklist are reported, never blocking.

## svelte-strict rules

| rule | class | area | active when | fix |
|---|---|---|---|---|
| `svelte-strict/csrf-safe` | gate | security | kit | Remove `checkOrigin: false` / the `*` trusted origin; list real origins in `trustedOrigins`. |
| `svelte-strict/derived-with-function` | gate | runes | always | Use `$derived.by(() => …)` or pass the expression directly. |
| `svelte-strict/effect-fetch-needs-abort` | gate | runes | always | Create an `AbortController`, pass `signal`, and `return () => controller.abort()`. |
| `svelte-strict/effect-needs-cleanup` | gate | runes | always | Return a function that clears the timer / disconnects the observer / unsubscribes. |
| `svelte-strict/effect-root-dispose` | gate | runes | always | Store the return value and call it when done (`const dispose = $effect.root(…)`). |
| `svelte-strict/form-post-enhance` | gate | kit | kit | Add `use:enhance` (from `$app/forms`), or spread a remote `form`. |
| `svelte-strict/handle-calls-resolve` | gate | kit | kit | Return `resolve(event)` (or use `sequence`). |
| `svelte-strict/kit-typed-load` | gate | typing | kit | `export const load: PageLoad = …` / `satisfies Actions`. |
| `svelte-strict/kit-typed-page-props` | gate | typing | kit, kit >=2.16.0 | `let { data }: PageProps = $props();` with `import type { PageProps } from './$types'`. |
| `svelte-strict/load-use-event-fetch` | gate | kit | kit | Destructure `fetch` from the load event: `load({ fetch })`. |
| `svelte-strict/locals-only-in-handle` | gate | kit | kit | Populate `locals` in `hooks.server` `handle`; read it elsewhere. |
| `svelte-strict/no-bind-non-bindable-prop` | gate | runes | always | Declare the prop with `$bindable()`. |
| `svelte-strict/no-browser-guard-in-effect` | gate | runes | always | Remove the guard. |
| `svelte-strict/no-destructure-reactive` | gate | runes | always | Read through the object (`props.x`) or wrap each field in `$derived`. |
| `svelte-strict/no-export-primitive-state` | gate | state | always | Export an object, a class instance with `$state` fields, or getter/setter functions. |
| `svelte-strict/no-imported-runes` | gate | runes | always | Remove the import; use `$state(…)` directly. |
| `svelte-strict/no-prop-mutation` | gate | runes | always | Declare the prop with `$bindable()`, or emit a callback prop and let the owner mutate. |
| `svelte-strict/no-store-as-state` | gate | state | always | See references/svelte.md: class with `$state` fields, or `createContext` for SSR-safe sharing. |
| `svelte-strict/no-swallowed-redirect` | gate | kit | kit | Call it outside the `try`, or rethrow in the `catch` (`if (isRedirect(e)) throw e`). |
| `svelte-strict/prop-derived-without-derived` | gate | runes | always | Wrap the expression in `$derived(…)`. |
| `svelte-strict/remote-needs-schema` | gate | kit | remote, kit >=2.27.0 | Pass a Standard Schema first: `query(v.string(), async (id) => …)`. |
| `svelte-strict/shadcn-avatar-fallback` | gate | shadcn | shadcn | Add `<Avatar.Fallback>` for when the image fails. |
| `svelte-strict/shadcn-button-icon` | gate | shadcn | shadcn | `<SearchIcon data-icon="inline-start" />` without `size-4`. |
| `svelte-strict/shadcn-button-no-loading-prop` | gate | shadcn | shadcn | `<Button disabled={pending}><Spinner data-icon="inline-start" />Save</Button>`. |
| `svelte-strict/shadcn-class-cn` | gate | shadcn | shadcn | `class={cn('base', cond && 'extra')}`. |
| `svelte-strict/shadcn-field-state-pair` | gate | shadcn | shadcn | Set both attributes from the same condition. |
| `svelte-strict/shadcn-icon-library` | gate | shadcn | shadcn | Import from the configured icon package. |
| `svelte-strict/shadcn-imports` | gate | shadcn | shadcn | `import * as Dialog from '<ui alias>/dialog'`, `import { Button } from '<ui alias>/button'`. |
| `svelte-strict/shadcn-inputgroup-controls` | gate | shadcn | shadcn | Replace `Input` by `InputGroup.Input`. |
| `svelte-strict/shadcn-item-in-group` | gate | shadcn | shadcn | Wrap items in `X.Group`. |
| `svelte-strict/shadcn-no-overlay-z` | gate | shadcn | shadcn | Remove the `z-*` class. |
| `svelte-strict/shadcn-no-space-utils` | gate | shadcn | shadcn | `flex flex-col gap-4` instead of `space-y-4`. |
| `svelte-strict/shadcn-overlay-title` | gate | shadcn | shadcn | Add `X.Title` (with `class="sr-only"` if visually hidden). |
| `svelte-strict/shadcn-semantic-colors` | gate | shadcn | shadcn | `bg-primary`, `text-muted-foreground`, `border-destructive`… (theme in the CSS variables). |
| `svelte-strict/shadcn-size-truncate` | gate | shadcn | shadcn | `size-10` / `truncate`. |
| `svelte-strict/shadcn-skeleton` | gate | shadcn | shadcn | `<Skeleton class="h-4 w-32" />`. |
| `svelte-strict/shadcn-tabs-trigger-in-list` | gate | shadcn | shadcn | Wrap triggers in `Tabs.List`. |
| `svelte-strict/shadcn-toast-sonner` | gate | shadcn | shadcn | `import { toast } from 'svelte-sonner'` + the ui Sonner component. |
| `svelte-strict/snapshot-before-clone` | gate | runes | always | Pass `$state.snapshot(value)`. |
| `svelte-strict/ssr-module-state` | review | ssr | always | Only mutate it in the browser (event handlers/effects), or use `createContext`. |
| `svelte-strict/ssr-shared-state` | gate | ssr | always | Move it into `createContext` (per request tree) or into `event.locals`. |
| `svelte-strict/store-usage` | review | state | always | Keep `readable`/`fromStore`/`toStore` for external sources; migrate plain shared state to `$state`. |
| `svelte-strict/test-no-sleep` | gate | tests | always | Use `flushSync()`, `await tick()` or `expect.poll(…)`. |
| `svelte-strict/typed-props` | gate | typing | always | Annotate: `let { a }: Props = $props();` (or `PageProps`/`LayoutProps` for routes). |

## Reused eslint-plugin-svelte rules (all `error`)

`svelte/button-has-type` · `svelte/comment-directive` · `svelte/infinite-reactive-loop` · `svelte/no-add-event-listener` · `svelte/no-at-debug-tags` · `svelte/no-at-html-tags` · `svelte/no-dom-manipulating` · `svelte/no-dupe-else-if-blocks` · `svelte/no-dupe-on-directives` · `svelte/no-dupe-style-properties` · `svelte/no-dupe-use-directives` · `svelte/no-export-load-in-svelte-module-in-kit-pages` · `svelte/no-ignored-unsubscribe` · `svelte/no-immutable-reactive-statements` · `svelte/no-inner-declarations` · `svelte/no-inspect` · `svelte/no-navigation-without-resolve` · `svelte/no-not-function-handler` · `svelte/no-object-in-text-mustaches` · `svelte/no-raw-special-elements` · `svelte/no-reactive-functions` · `svelte/no-reactive-literals` · `svelte/no-reactive-reassign` · `svelte/no-restricted-html-elements` · `svelte/no-shorthand-style-property-overrides` · `svelte/no-store-async` · `svelte/no-svelte-internal` · `svelte/no-target-blank` · `svelte/no-top-level-browser-globals` · `svelte/no-unknown-style-directive-property` · `svelte/no-unnecessary-state-wrap` · `svelte/no-unused-props` · `svelte/no-unused-svelte-ignore` · `svelte/no-useless-children-snippet` · `svelte/no-useless-mustaches` · `svelte/prefer-derived-over-derived-by` · `svelte/prefer-svelte-reactivity` · `svelte/prefer-writable-derived` · `svelte/require-each-key` · `svelte/require-event-dispatcher-types` · `svelte/require-store-reactive-access` · `svelte/require-stores-init` · `svelte/system` · `svelte/valid-each-key` · `svelte/valid-prop-names-in-kit-pages`

Disabled on purpose: `svelte/valid-compile` (the project's own compiler runs instead), `svelte/prefer-class-directive` (contradicts Svelte 5 clsx guidance).

Version gates (checked against the official CHANGELOGs): `use:` → `{@attach}` from svelte 5.29.0; `class:` → clsx from 5.16.0; `svelte/no-navigation-without-resolve` from kit 2.26.0; `$app/stores` → `$app/state` from kit 2.12.0.

## Review checklist (not decidable by a script)

| id | applies to | check |
|---|---|---|
| state-raw | svelte | Large objects that are only ever reassigned (API responses) use `$state.raw`, not deep `$state`. |
| untrack | svelte | Every value read inside an effect is meant to re-trigger it; otherwise `untrack(…)` it. |
| effect-derives | svelte | No effect only writes state computed from other state (multi-statement case not caught by `prefer-writable-derived`). |
| external-source | svelte | External sources (WebSocket, media query, DOM API) use `createSubscriber` or a `readable` store, not an effect writing `$state`. |
| key-block | svelte | `{#key}` is only used to replay transitions, never to re-run script logic (`$derived` instead). |
| boundary | async | Every markup `await` has a `<svelte:boundary>` with `pending`/`failed` somewhere above it (possibly in a parent). |
| transition-scope | svelte | Transitions inside `{#if}`/`{#each}` declare `|global` only when they must run on parent mount/unmount. |
| load-serializable | kit | Universal `load` returns only what crosses the network (no class instances or functions meant for the server). |
| waterfall | kit | Independent awaits in a `load` run in parallel (`Promise.all` or returning promises). |
| invalidate | kit | `depends(key)` and `invalidate(key)` use the same keys; no `invalidateAll` where a key suffices. |
| server-input | kit | Every `+server` handler and form action validates its input on the server. |
| handle-error | kit | `handleError` is defined and never leaks internal messages to the client. |
| cookies | kit | Cookies that hold credentials keep `httpOnly`, `secure` and a strict enough `sameSite`. |
| typing | ts | Snippet props are typed `Snippet<[Args]>`; generic components declare `generics`; wrappers extend `HTMLAttributes`. |
| test-contract | test | Tests drive components through props, events and accessible roles, not internal DOM structure; module state is reset between tests. |
| shadcn-form-layout | shadcn | Forms use `Field.FieldGroup` + `Field.Field`; groups of checkboxes/radios use `Field.FieldSet` + `Field.FieldLegend`. |
| shadcn-toggle-group | shadcn | 2–7 mutually exclusive options use `ToggleGroup`, not a loop of `Button` with manual active state. |
| shadcn-card | shadcn | `Card` uses its full composition (Header/Title/Description/Content/Footer). |
| shadcn-components-first | shadcn | No hand-made callout/empty-state/badge/separator markup where `Alert`/`Empty`/`Badge`/`Separator` exist. |
| shadcn-class-layout | shadcn | `class` on shadcn components only sets layout (margins, width, grid), never colors or typography. |
