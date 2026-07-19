# Principles behind the skill

Why the moves say what they say. Read this when a change needs justifying,
when two rules conflict, or when deciding whether an edge case is worth
touching. The moves themselves live in [catalog.md](catalog.md),
[composition-fp.md](composition-fp.md), and
[error-handling.md](error-handling.md) — all in the same
`Detect / Fix / Principle` format.

## Reading & cognition

- **Code is read ~10× more than written** (Clean Code). Every trade-off
  resolves in favor of the reader.
- **Cognitive complexity** (SonarSource): nesting, flow breaks, and flag
  variables consume the reader's working memory. Cyclomatic complexity counts
  paths; cognitive complexity counts *effort* — optimize the latter.
- **Single Level of Abstraction (SLAP)**: within one function, all statements
  sit at the same zoom level. Mixing `calculateTax()` with `i += 1` forces
  constant zooming.
- **Principle of Least Astonishment (POLA)**: code should behave the way its
  name and shape suggest. Surprise is a defect even when behavior is correct.
- **Names carry the design** (Ousterhout): a name you can't make precise
  usually reveals a blurry responsibility — the naming problem is a design
  probe, not cosmetics.

## Composition & light FP

- **Declarative over imperative**: an expression that states the result
  (`filter`+`map`, a comprehension, a lookup table) has fewer places to be
  wrong than a loop that describes the steps.
- **Composition over inheritance** (GoF): vary behavior by passing a function
  or strategy, not by adding a subclass. Injection is visible at the call
  site; a class tree is not.
- **Functional core, imperative shell**: pure logic is testable without
  mocks, portable, and immune to ordering bugs; keep IO at the edges.
- **Derive, don't track**: state that can be computed from other state will
  eventually disagree with it. Tracker variables and cached booleans are
  bugs waiting for a missed update.
- **Immutability by default**: shared mutable state is the root of the
  hardest bug class (action at a distance). `const`/`final` is free insurance.
- **Light means light**: FP is a tool for deleting structure, not adding it.
  No monad stacks, no point-free golf, no `pipe` utilities the codebase
  doesn't already have. The loop wins if the loop reads better.

## Correctness by construction

- **Fail fast**: detect broken assumptions at the earliest point, loudly.
  Distance between fault and symptom is the main cost of debugging.
- **Parse, don't validate** (Alexis King): convert unstructured input into a
  typed value once, at the boundary; downstream code then *cannot* receive bad
  data. Re-validation everywhere is a smell of missing types.
- **Make invalid states unrepresentable** (Yaron Minsky): prefer unions/enums
  and non-nullable types over runtime checks; move bug-catching from tests to
  the compiler.
- **Design errors out of existence** (Ousterhout): prefer APIs and constructs
  where the error case cannot occur (iterators over index math, `with` over
  manual close) to handling errors after the fact.
- **Errors are a boundary concern**: the core propagates, the boundary
  decides (log, retry, map to a response). Scattered try/catch means the
  policy was never designed.

## Structure

- **SOLID**, at this skill's scale mostly **S** (single responsibility: one
  reason to change per function) and **D** in its lightweight form (pure core
  depends on nothing; IO shells depend on the core).
- **High cohesion, low coupling** (Constantine): things that change together
  stay together; things that don't, don't touch.
- **Law of Demeter**: reaching through object chains couples you to every
  intermediate shape.
- **Command–Query Separation** (Meyer): asking a question must not change the
  answer.
- **DRY — of knowledge, not text** (Pragmatic Programmer): duplicated business
  rules must merge; coincidentally similar lines must not. The **rule of
  three** guards against premature merging.
- **YAGNI + speculative generality** (Fowler): unused flexibility is pure
  cost — it must be read, maintained, and worked around forever. Deleting it
  is the cheapest complexity reduction available.
- **Deep modules** (Ousterhout): the best interface is small relative to the
  functionality behind it. Adding a parameter or option makes a module
  shallower; absorbing a detail makes it deeper.

## Process

- **Boy-scout rule** (Uncle Bob): leave the code cleaner than you found it.
  A daily pass compounds; a dedicated "cleanup sprint" never comes.
- **Broken windows** (Pragmatic Programmer): visible neglect normalizes
  further neglect. Deleting one piece of dead code changes what the next
  contributor considers acceptable.
- **Refactoring is behavior-preserving by definition** (Fowler): the moment a
  change alters behavior, it's a bugfix or a feature — different review,
  different risk, different commit.
- **Small reversible steps** (Fowler): each step compiles and passes tests;
  if verification fails, revert rather than patch forward. The ability to
  abandon a step cheaply is what makes refactoring safe.
- **Code smells are hints, not verdicts** (Fowler's catalog). A smell earns a
  fix only when the fix is smaller than the smell.

## Practices are not universal

Good practice depends on the language, the ecosystem, and the file:

- **Language idiom beats generic rules** — a comprehension is idiomatic
  Python but a nested one is not; `?.` chains are normal Dart; Ruby blocks
  replace half the FP moves. The [languages/](../languages/) profiles
  override this document where they disagree.
- **Ecosystem convention beats personal taste** — Rails code should look
  like Rails, not like Haskell. A pattern the framework fights is wrong
  here even if it's right elsewhere.
- **The file's own style beats both** — a locally "worse" but consistent
  pattern reads better than a mixed file. Propose the pattern change as an
  observation instead of mixing two styles.

## Conflict resolution

When principles collide, priority order:

1. Behavior preservation (breaks the contract → don't do it)
2. Deletion (dead code, speculative generality — free wins)
3. Latent-bug and error-path fixes (catalog A, error-handling.md)
4. Complexity & readability reduction (catalog B, flattening)
5. Structural reshapes (composition-fp.md, catalog C)
6. Personal taste (never a justification on its own)
