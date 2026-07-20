# Micro-refactoring catalog

The checklist to scan a file against. Each entry: how to detect, how to fix,
which principle it serves. Every entry is behavior-preserving unless marked
`BUGFIX` (propose those separately).

Ordered by scan priority: latent bugs first, then readability, then structure.

---

## A. Latent bugs & fragility

### A1. Swallowed error
**Detect:** empty `catch`/`except`/`rescue`, or a catch that only logs and
continues when the caller assumes success.
**Fix:** rethrow with context, or return an explicit failure value. Narrow the
caught type to what is actually expected.
**Principle:** fail fast — a hidden failure costs 100× more when it resurfaces.

### A2. Loose equality / implicit coercion
**Detect:** `==` in JS/TS, truthiness tests on values where `0`, `""` or empty
collections are valid states.
**Fix:** strict equality; explicit comparisons (`items.length === 0`, `x is None`).
**Principle:** explicit over implicit.

### A3. Mutable shared state
**Detect:** module-level mutable objects, function parameters mutated in place,
mutable default arguments (Python), reassigned closure variables.
**Fix:** `const`/`final`/`freeze`, return new values instead of mutating inputs,
`None` sentinel for defaults.
**Principle:** immutability by default — what cannot change cannot break.

### A4. Non-exhaustive branching
**Detect:** `switch`/`match`/`case` over an enum or union without handling all
variants; `else` doing double duty as an unintended catch-all.
**Fix:** handle every variant explicitly; add an exhaustiveness guard
(`never` check in TS, `assert_never` in Python) so the compiler flags the next
added variant.
**Principle:** make invalid states unrepresentable.

### A5. Unawaited async / unhandled promise
**Detect:** a promise/future created and dropped; `async` function called
without `await` where ordering matters.
**Fix:** `await` it, or mark deliberate fire-and-forget explicitly (`void x()`)
with a comment saying why.
**Principle:** every failure path must have an owner.

### A6. Missing boundary validation
**Detect:** external input (HTTP, file, env var, user input) used without
checking shape/range; internal values re-validated redundantly instead.
**Fix:** validate once at the boundary, then pass a typed/parsed value inward.
**Principle:** parse, don't validate — after the boundary, the type is the proof.

### A7. Resource leak
**Detect:** file/connection/lock opened without `finally`/`with`/`using`/
`ensure`, or cleanup skipped on the error path.
**Fix:** language construct that guarantees release.
**Principle:** acquisition and release belong in the same visual block.

### A8. Ambiguous units and time
**Detect:** `timeout = 30`, naive datetimes, money as float.
**Fix:** unit in the name (`timeoutInSeconds`), timezone-aware datetimes,
integer minor-units or decimal for money.
**Principle:** the reader should never have to guess a unit.

### A9. Stringly-typed values
**Detect:** the same literal string compared in several places
(`status === "active"`), stringly-typed flags.
**Fix:** named constant, enum, or union type.
**Principle:** one authoritative definition per concept.

### A10. Edge-case blindness `BUGFIX-adjacent`
**Detect:** division without zero-guard, `list[0]` without empty-check, index
arithmetic where an iterator would do.
**Fix:** guard clause, or iteration primitives (`for..of`, `enumerate`, `zip`)
that make off-by-one impossible.
**Principle:** prefer constructs where the mistake cannot be written.

### A11. Nullable leaking deep
**Detect:** a possibly-null/None value passed through several calls, each
re-checking (or forgetting to check); `!`/`as`-style non-null assertions used
to silence the checker.
**Fix:** resolve nullability once as early as possible (guard + early return,
default value, or throw at the boundary), then pass the non-null value inward.
Replace assertions with a real check.
**Principle:** parse, don't validate — nullability is input shape too.

---

## B. Readability

### B1. Nested conditionals → guard clauses
**Detect:** happy path indented 2+ levels; `else` after a returning `if`.
**Fix:** invert the condition, return early, dedent the happy path.
**Principle:** linear reading — handle the exceptional, then proceed.

### B2. Unexplained condition → explaining variable or predicate
**Detect:** a boolean expression with 2+ operators inline in an `if`.
**Fix:** assign it to a named variable (`const isEligibleForRefund = …`) or
extract a small predicate function.
**Principle:** the name documents the intent; the expression documents the how.

### B3. Magic numbers and strings
**Detect:** unexplained literals other than 0, 1, and obvious identities.
**Fix:** named constant next to its siblings.
**Principle:** explicit intent.

### B4. Misleading or vague name (small scope)
**Detect:** `data`, `temp`, `flag`, `x`, names that lie about content
(`userList` holding a map), abbreviations that save 3 characters.
**Fix:** rename — only when all usages are within the targeted file(s).
**Principle:** the name is read 10× more often than it is written.

### B5. Double negation / inverted booleans
**Detect:** `if (!notReady)`, `isNotValid`.
**Fix:** name the positive (`isReady`), flip branches if needed.
**Principle:** each negation costs the reader a mental flip.

### B6. Dead weight
**Detect:** commented-out code, unused imports/variables/parameters,
unreachable branches, TODOs older than the git blame can excuse.
**Fix:** delete. Version control remembers.
**Principle:** every line present is a line the reader must consider.

### B7. Comments that restate the code
**Detect:** `// increment i`, doc comments duplicating the signature.
**Fix:** delete; keep only comments that explain *why* (constraints,
workarounds, business rules, links to issues).
**Principle:** comments are for what the code cannot say.

### B8. Nested ternaries and clever one-liners
**Detect:** ternary inside ternary; a "smart" expression you had to re-read.
**Fix:** `if/else`, a lookup table, or an extracted function.
**Principle:** code is written once, read many times — optimize for the reader.

### B9. Inconsistent symmetry
**Detect:** two branches of the same decision written in different shapes;
mixed `snake_case`/`camelCase` within a file; different patterns for the same
operation in one file.
**Fix:** align on the dominant local pattern.
**Principle:** similar things should look similar; different things, different.

### B10. Boolean returned through a conditional
**Detect:** `if (cond) return true; else return false;`
**Fix:** `return cond;` (with an explaining name if `cond` is complex).
**Principle:** the condition already is the answer — don't re-derive it.

### B11. Variable scope wider than its use
**Detect:** variable declared at the top of a function but used only in one
branch or loop; accumulator alive long after its last read.
**Fix:** declare at first use, in the narrowest block that needs it.
**Principle:** the smaller the scope, the less the reader must track.

---

## C. Structure & maintainability

### C1. Duplicated expression (rule of three)
**Detect:** the same non-trivial expression or 3+ line block appearing 3 times.
**Fix:** extract a well-named function/constant — the smallest extraction that
removes the duplication. Twice is tolerated; don't abstract prematurely.
**Principle:** DRY applies to knowledge, not to lines that merely look alike.

### C2. Function doing two things
**Detect:** a name containing `And`/`Or`, or a body with two distinct phases
separated by a blank-line "chapter break".
**Fix:** extract the phases into named functions; the original becomes a
readable table of contents. Keep it inside the file.
**Principle:** single responsibility + single level of abstraction (SLAP) —
each function reads at one zoom level.

### C3. Query with a side effect
**Detect:** a `get…`/`is…` that mutates state, writes, or logs surprises.
**Fix:** separate the query from the command, or rename to reveal the effect.
**Principle:** command–query separation; least astonishment.

### C4. Long parameter list / data clump
**Detect:** 4+ parameters, or the same group of parameters travelling together
across functions in the file.
**Fix:** group into a small typed object/dataclass — only if all call sites are
in the targeted files.
**Principle:** data that travels together belongs together.

### C5. Train-wreck chains
**Detect:** `order.customer.address.city` reaching through 3+ objects,
especially repeated.
**Fix:** extract a local variable or a small accessor on the nearest owner.
**Principle:** Law of Demeter — talk to friends, not strangers' strangers.

### C6. Mixed purity
**Detect:** business calculation interleaved with IO (logging, DB, HTTP) in
the same function body.
**Fix:** extract the pure calculation into its own function; leave IO at the
edge. Pure parts become trivially testable.
**Principle:** functional core, imperative shell.

### C7. Speculative generality
**Detect:** unused config flags, generic parameters with a single instantiation,
hooks nobody calls, `options` objects with one option.
**Fix:** delete the flexibility; inline the single case.
**Principle:** YAGNI — the abstraction you need later is cheaper built later.

### C8. Feature envy (observation only)
**Detect:** a function using another module's data more than its own.
**Fix:** usually a *move* — which exceeds this skill's contract. Report it as
an observation; do not perform it.
**Principle:** behavior belongs next to the data it uses (cohesion).

### C9. Primitive obsession (light form)
**Detect:** the same primitive + validation logic recurring (`email: string`
checked with the same regex in 3 places).
**Fix:** within one file, a single parse/validate helper returning the checked
value. A full value-object type is an observation for the user.
**Principle:** one authoritative definition per concept.

### C10. Cognitive complexity hotspot
**Detect:** a function where you lose track of state while reading — deep
nesting, many exits mixed with loops, boolean flags steering control flow.
**Fix:** apply B1 (guards), B2 (predicates), C2 (extract phases) in
combination — within the round budget. Too big for one round → slice it
([multi-round.md](multi-round.md)) instead of downgrading to an observation.
**Principle:** the limit is the reader's working memory, not the parser.

### C11. Near-duplicate variants → one generic helper
**Detect:** 3+ functions or blocks that are the same shape with small
variations — a different field, comparison, or constant
(`sortByName`/`sortByDate`, three almost-identical validators).
**Fix:** one helper parametrized by exactly what varies (a key function, a
predicate, a constant); old names become one-line calls or disappear.
Generalize only what the existing copies prove varies — an unused type
parameter or option is C7, not genericity.
**Principle:** DRY of knowledge + rule of three — generic because it already
varies, never because it might.

---

## Scan order summary

1. Pass A (bugs): anything here outranks style.
2. Pass B (readability): the bulk of typical +1% wins.
3. Pass C (structure): pick only clear cases; when in doubt, observe rather
   than refactor.
