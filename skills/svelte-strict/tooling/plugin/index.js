// eslint-plugin-svelte-strict: the rules eslint-plugin-svelte and the Svelte
// compiler do not already cover. Each rule's meta.docs is the single source of
// truth for references/rules.md (class gate|review, area, needs, since, fix).
import { rules as runes } from './rules-runes.js';
import { rules as kit } from './rules-kit.js';
import { rules as shadcn } from './rules-shadcn.js';

export const rules = { ...runes, ...kit, ...shadcn };

export default { meta: { name: 'eslint-plugin-svelte-strict' }, rules };

/**
 * Review-only checks: real problems that no script can decide (P8). They are
 * printed in report.md as a checklist when `svs route` says they apply.
 * `when` uses the same tags as `svs route`.
 */
export const checklist = [
  { id: 'state-raw', when: 'svelte', text: 'Large objects that are only ever reassigned (API responses) use `$state.raw`, not deep `$state`.' },
  { id: 'untrack', when: 'svelte', text: 'Every value read inside an effect is meant to re-trigger it; otherwise `untrack(…)` it.' },
  { id: 'effect-derives', when: 'svelte', text: 'No effect only writes state computed from other state (multi-statement case not caught by `prefer-writable-derived`).' },
  { id: 'external-source', when: 'svelte', text: 'External sources (WebSocket, media query, DOM API) use `createSubscriber` or a `readable` store, not an effect writing `$state`.' },
  { id: 'key-block', when: 'svelte', text: '`{#key}` is only used to replay transitions, never to re-run script logic (`$derived` instead).' },
  { id: 'boundary', when: 'async', text: 'Every markup `await` has a `<svelte:boundary>` with `pending`/`failed` somewhere above it (possibly in a parent).' },
  { id: 'transition-scope', when: 'svelte', text: 'Transitions inside `{#if}`/`{#each}` declare `|global` only when they must run on parent mount/unmount.' },
  { id: 'load-serializable', when: 'kit', text: 'Universal `load` returns only what crosses the network (no class instances or functions meant for the server).' },
  { id: 'waterfall', when: 'kit', text: 'Independent awaits in a `load` run in parallel (`Promise.all` or returning promises).' },
  { id: 'invalidate', when: 'kit', text: '`depends(key)` and `invalidate(key)` use the same keys; no `invalidateAll` where a key suffices.' },
  { id: 'server-input', when: 'kit', text: 'Every `+server` handler and form action validates its input on the server.' },
  { id: 'handle-error', when: 'kit', text: '`handleError` is defined and never leaks internal messages to the client.' },
  { id: 'cookies', when: 'kit', text: 'Cookies that hold credentials keep `httpOnly`, `secure` and a strict enough `sameSite`.' },
  { id: 'typing', when: 'ts', text: 'Snippet props are typed `Snippet<[Args]>`; generic components declare `generics`; wrappers extend `HTMLAttributes`.' },
  { id: 'test-contract', when: 'test', text: 'Tests drive components through props, events and accessible roles, not internal DOM structure; module state is reset between tests.' },
  { id: 'shadcn-form-layout', when: 'shadcn', text: 'Forms use `Field.FieldGroup` + `Field.Field`; groups of checkboxes/radios use `Field.FieldSet` + `Field.FieldLegend`.' },
  { id: 'shadcn-toggle-group', when: 'shadcn', text: '2–7 mutually exclusive options use `ToggleGroup`, not a loop of `Button` with manual active state.' },
  { id: 'shadcn-card', when: 'shadcn', text: '`Card` uses its full composition (Header/Title/Description/Content/Footer).' },
  { id: 'shadcn-components-first', when: 'shadcn', text: 'No hand-made callout/empty-state/badge/separator markup where `Alert`/`Empty`/`Badge`/`Separator` exist.' },
  { id: 'shadcn-class-layout', when: 'shadcn', text: '`class` on shadcn components only sets layout (margins, width, grid), never colors or typography.' },
];
