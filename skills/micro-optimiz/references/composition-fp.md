# Composition & light-FP moves

The reshaping playbook. Every move here reduces line count or complexity by
replacing imperative structure with composed expressions. "Light" means the
result must be *more* readable than the original — never trade a clear loop
for a clever one-liner.

## 1. Loop with accumulator → pipeline

**Detect:** a `for` loop that builds a list/map/sum via mutation.
**Fix:** `map`/`filter`/`reduce`, comprehension, `sum`/`any`/`all`.
**Principle:** declarative over imperative — say *what*, not *how*.

```ts
// before — 7 lines, 2 mutations
const names = [];
for (const u of users) {
  if (u.active) {
    names.push(u.name.toUpperCase());
  }
}

// after — 1 expression, 0 mutations
const names = users.filter(u => u.active).map(u => u.name.toUpperCase());
```

Keep the loop when: early exit with side effects, index arithmetic across
two collections, or the pipeline would need 4+ chained stages with lambdas
longer than a line — extract named functions first, then chain.

## 2. Mutation-and-reassign → transformation chain

**Detect:** a variable reassigned several times as it is "prepared"
(`let x = …; x = fix(x); if (cond) x = adjust(x);`).
**Fix:** one `const` per meaningful state, or a single composed expression.
Each intermediate name documents a stage; no name is reused with a new meaning.
**Principle:** one name, one meaning — reuse hides the timeline.

## 3. Flag parameter → two functions or injected function

**Detect:** `render(data, isCompact)` branching internally on the flag;
call sites always pass a literal.
**Fix:** `renderCompact(data)` / `renderFull(data)`, or inject the varying
part: `render(data, formatLine)`. The caller names the intent; the branch
disappears.
**Principle:** the call site should read as intent, not configuration.

## 4. Inheritance level → composition

**Detect:** a subclass that only overrides 1–2 methods, or a base class
existing solely to share helpers.
**Fix:** pass the varying behavior as a function or small object
(strategy); share helpers as free functions. Delete the class level.
**Principle:** composition over inheritance — vary by injection, not by tree.

```python
# before: BaseExporter / CsvExporter / JsonExporter hierarchy
# after:
def export(rows, serialize):  # serialize: (row) -> str
    return "\n".join(serialize(r) for r in rows)
```

## 5. One-method class → function; data class → record

**Detect:** class with a constructor and a single public method; class whose
methods are all getters.
**Fix:** a plain function (closure if it needs config); a
dataclass/record/struct. Object ceremony deleted.
**Principle:** the simplest construct that fits — a class is not a default.

## 6. If/elif chain on a value → lookup table or match

**Detect:** chain of `if x == A … elif x == B …` mapping value → value/action.
**Fix:** dict/map lookup (`HANDLERS[kind](payload)`), or exhaustive
`match`/`switch` when branches carry logic. Table beats chain: adding a case
is one line, and the shape proves nothing else happens.
**Principle:** data over control flow — a table is checkable, a chain is not.

## 7. Interleaved IO and logic → pure core, thin shell

**Detect:** compute-log-fetch-compute-save woven through one function.
**Fix:** extract the computation as pure functions (data in, data out);
the original becomes a short imperative shell that reads top-to-bottom:
fetch → compute → save. The pure parts need no mocks to test.
**Principle:** functional core, imperative shell.

## 8. Deep call plumbing → compose at the top

**Detect:** function A calls B calls C, each just forwarding arguments and
adding one step.
**Fix:** flatten — let one orchestrator call the steps in sequence. The
composition is visible in one place instead of buried in a call chain:

```ts
const publish = (draft: Draft) => upload(render(validate(draft)));
```

**Principle:** composition belongs in one visible place, not a call chain.

## 9. Boolean state variables → derived expressions

**Detect:** `let found = false; for (…) { if (…) found = true; }` and
similar tracker variables.
**Fix:** `some`/`any`/`every`/`includes`/`find`. The state variable — and
the risk of forgetting to set it — disappears.
**Principle:** derive, don't track — stored state can drift, expressions can't.

## 10. Null-plumbing → resolve once

**Detect:** `if (x !== null)` repeated down a call chain.
**Fix:** resolve at the top (guard + early return, or default value); pass
the non-null value down. Types tighten, checks vanish.
**Principle:** parse, don't validate — nullability is input shape too.

## Readability guardrails

- Named intermediate > anonymous cleverness. Three chained stages with good
  names beat one dense expression.
- No point-free style, no custom `compose`/`pipe` utilities, no
  Result/Option wrappers unless the codebase already uses them.
- A lambda longer than one line wants to be a named function.
- If the reshape needs a comment to explain, it failed — revert to the
  clearer shape.

## 11. Two-purpose function → two functions

A function whose name needs "and" to be accurate, or whose body has two
clearly separable halves (validate then persist, parse then format), splits
along that seam. Keep a thin caller that does both if the call sites expect
one entry point — the split is about the bodies, not about forcing every
caller to change.

## 12. Needless indirection → inlined

A wrapper that only forwards its arguments, a one-line helper called once,
an interface with a single implementation and no test seam: delete it and
inline the body. This is the inverse of move 8 and they arbitrate the same
way — an indirection earns its place by removing a decision from the
caller, not by existing.

## 13. Overlapping helpers → one generic helper

Two or three helpers that differ only in a value, a key, or a comparator
collapse into one that takes it as a parameter; the wrappers go. Generic
means **parametrizing what already varies** — rule of three, never
speculation. See catalog C11 for the smell and C7 for the trap.

## Patterns, and which ones are allowed

The only design patterns used here are the lightweight ones that **remove**
branches: strategy-as-a-function, lookup table, null object. A pattern that
adds a class, an interface or a level of indirection without deleting a
branch is a pattern for its own sake — it fails the round budget and the
readability guardrails at once. Never introduce one to "prepare" for a
variation that does not exist yet.

## Scoring a reshape

Worth doing when at least two hold: lines shrink, nesting shrinks, a
mutation or state variable disappears, a test becomes writable without
mocks. Worth skipping when: behavior equivalence is hard to argue, call
sites outside the targeted files must change, or the team's style clearly
avoids the pattern.
