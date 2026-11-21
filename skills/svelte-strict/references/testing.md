# Testing Svelte 5

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
