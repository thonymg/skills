# TypeScript / JavaScript profile

Language-specific detections to add to the catalog scan.

## Latent bugs
- `==` / `!=` → `===` / `!==` (except deliberate `== null` covering undefined — keep with comment).
- Floating promises: calls returning `Promise` neither awaited nor `void`-marked.
- `async` executor/callback passed where a sync one is expected (`forEach(async …)`).
- Truthiness on possibly-`0`/`""` values → explicit `!== undefined` / `.length === 0`.
- `any` introduced casually → `unknown` + narrowing, or a precise type.
- Mutation of function parameters or of arrays received as arguments.
- `parseInt` without radix; `+str` coercion → `Number(str)`.
- Non-exhaustive `switch` on a union → add `default: { const _exhaustive: never = value; }`.

## Readability & idioms
- `var` → `const` (or `let` only when reassigned).
- Index loops over arrays → `for..of`, `.map`, `.filter`, `.some/.every` when it clarifies (not when it obscures — a 3-condition `reduce` is worse than a loop).
- Manual null checks chains → optional chaining `?.` and nullish coalescing `??` (mind: `??` differs from `||` for `0`/`""` — behavior check required).
- String concatenation → template literals.
- `Object.assign({}, x)` → spread; `arr.slice()` → `[...arr]` per local style.
- Boolean props/vars: `is/has/can` prefix.
- Prefer `readonly` fields and `Readonly<T>`/`ReadonlyArray<T>` on data that never mutates.
- `enum` vs union: follow the file's existing choice.

## Structure
- Interleaved `await` + pure computation → extract the pure part.
- Repeated inline object shapes → a named `type` (single file scope).

## Verification
`tsc --noEmit` if a tsconfig exists; otherwise rely on tests / careful diff read.
