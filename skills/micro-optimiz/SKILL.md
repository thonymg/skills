---
name: micro-optimiz
description: Daily incremental code optimization. Each pass reduces complexity
  and line count on targeted files — deleting dead code, flattening control
  flow, redesigning a function or class toward composition and light functional
  style — while strictly preserving behavior. Use when the user asks to
  optimize, simplify, refactor, reduce complexity, clean up, or shrink code;
  mentions dead code, error handling, readability, maintainability, or a
  daily/recurring cleanup pass. Not for adding features, performance tuning, or swapping
  libraries.
---

# micro-optimiz — daily complexity reduction

Run this every day and the codebase gets simpler every day. Each pass makes
the targeted code measurably lighter: fewer lines, less nesting, fewer
concepts to hold in mind. Deletion is the best refactoring; the second best
is replacing imperative plumbing with a composed expression.

## Goal per pass

A pass succeeds when at least one of these moved in the right direction,
with behavior unchanged:

- **Lines of code** — dead code deleted, duplication merged, boilerplate
  collapsed into an expression.
- **Complexity** — nesting flattened, branches removed, state variables
  eliminated, control flow made linear.
- **Design** — a function or class reshaped so its structure matches its
  purpose (see "Design moves" below).

The only hard limit is **behavior preservation**. Unlike a timid lint pass,
this skill may redesign an entire function or class in one move — as long as
the result is verifiably equivalent and reviewable. What it never does:
add features, add dependencies, tune performance, swap libraries, or mix a
bugfix silently into a refactoring (label bugfixes `BUGFIX`, propose apart).

## Style preference: composition & light FP

When two equivalent shapes exist, prefer the compositional / functional one.
Full patterns in [references/composition-fp.md](references/composition-fp.md)
— read it before restructuring anything. In short:

- Pure function over method with state; pipeline over mutation-and-reassign.
- `map`/`filter`/`reduce`/comprehensions over index loops with accumulators.
- Composition over inheritance; pass a function instead of a flag parameter.
- Data in, data out: push IO to the edges, keep the core pure.
- Small functions composed by a readable top-level orchestrator.
- **Light** FP: no monad stacks, no point-free golf, no clever combinators.
  If the FP version is harder to read than the loop, keep the loop.

## Workflow

1. **Pick the target.** The file(s) the user named; otherwise the files most
   recently changed (`git log --since` / current diff). Daily mode: rotate —
   don't re-polish yesterday's file, pick the next worst one.
2. **Read the whole file, then its context.** Before reshaping a function,
   check its callers and siblings: a redesign must fit how the function is
   actually used, and the class design around it. Never redesign from the
   body alone.
3. **Hunt in this order:**
   a. **Delete** — dead code, unused exports/params, commented-out blocks,
      speculative flexibility, redundant comments. Free wins first.
   b. **Flatten** — guard clauses, merged conditions, removed else-branches,
      exhaustive matches instead of if-chains
      ([references/catalog.md](references/catalog.md) sections A & B).
   c. **Error paths** — swallowed or over-broad catches, exceptions as
      control flow, scattered try/catch that belongs at one boundary
      ([references/error-handling.md](references/error-handling.md)).
   d. **Reshape** — the one function or class in the file with the worst
      complexity-to-purpose ratio; redesign it using the moves in
      [references/composition-fp.md](references/composition-fp.md).
   Load the matching language profile from [languages/](languages/).
4. **Apply, then verify.** Tests if they exist, otherwise type-checker or
   compiler, otherwise re-read the full diff. Verification fails → revert
   that change, don't patch forward.
5. **Report the delta.** Lines before → after, what was deleted, what was
   reshaped and why. End with observations: what's too big for one pass and
   should be tomorrow's target.

Propose before applying only if the user asked for review; daily/recurring
runs apply directly and report.

## Design moves (function & class level)

Allowed in one pass, when call sites are within reach:

- Rewrite a function's body entirely (loop → pipeline, state machine → match).
- Split a two-purpose function; inline a needless indirection.
- Replace a flag parameter with two functions or an injected function.
- Turn a one-method class into a function; a data-only class into a
  record/dataclass; replace an inheritance level with composition or a
  passed-in strategy function.
- Merge overlapping helpers into one; delete the wrappers.

Out of reach (report as observation, don't do): moves across modules,
public API changes with external callers, architecture changes.

## Daily cadence

Designed to run as a recurring pass (cron, `/loop`, or habit). Each run:
one target, one focused pass, one small reviewable diff. Compounding beats
big-bang: never let a pass grow into a rewrite because "we're at it anyway".
Yesterday's observations are today's candidates.

## Naming

When a rename is part of a reshape and the `naming-convention` skill is
available, use its vocabulary and casing rules; otherwise follow the file's
existing convention.
