# TypeScript / JavaScript (incl. Vue) — fix-root profile

| Need | Command |
|:-----|:--------|
| One test, no cache | `npx jest <path> -t '<name>' --no-cache` · `npx vitest run <path> -t '<name>'` |
| Order-dependent flake | `jest --runInBand` vs default · `jest --randomize --seed=<n>` · `vitest --sequence.shuffle --sequence.seed=<n>` |
| Control async timing | fake timers (`jest.useFakeTimers()` / `vi.useFakeTimers()`) in the repro |
| Full trace | `node --enable-source-maps --stack-trace-limit=100 --trace-uncaught` |
| Static evidence | `npx tsc --noEmit -p .`, `npx eslint <file>` (`no-floating-promises` finds missing `await`) |
| Suite gate | jest and vitest output are parsed natively |

`--expect-red`: `'Expected|toBe|toEqual|AssertionError'` — a `TS\d+` red is a compile error, not the bug

**Cache traps:** `--no-cache`; `node_modules/.cache`, `node_modules/.vite`,
`.tsbuildinfo`. A built `dist/` imported instead of `src/` — check
`package.json` `main`/`exports` and the tsconfig `paths`.

**Classic roots:** a missing `await` (the error surfaces later, elsewhere);
`||` default swallowing `0`/`""` (`??` intended); a shallow spread sharing a
nested object; `new Date('YYYY-MM-DD')` parsed as UTC; `this` lost in a
callback. Vue: reactivity lost on destructured props or (Vue 2) array index
assignment; a watcher firing before data is loaded.
