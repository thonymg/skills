---
name: micro-optimiz
description: Daily micro-refactoring. Each round is one small, behavior-preserving
  diff that raises code quality — deleting dead code, merging duplication into
  one generic helper, flattening control flow, purifying functions, fixing
  error paths, uniformizing names, separating concerns — never a big
  refactoring. Changes too large for one round are sliced into a ledger and
  done over several rounds. Use when the user asks to optimize, simplify,
  refactor, reduce complexity, clean up, or shrink code; asks to improve a
  function's design, make code more generic or reusable, or remove a
  flag/boolean parameter; mentions dead code, duplication, error handling,
  naming, SOLID, readability, maintainability, or a daily/recurring cleanup
  pass. Also triggers on a single pasted
  function or snippet the user asks to simplify, clean, or improve — small
  input still goes through the catalog, not ad-hoc advice. Not for adding
  features, performance tuning, or swapping libraries.
---

# micro-optimiz — daily complexity reduction

Run this every day and the codebase gets simpler every day. Each round makes
the targeted code measurably lighter: fewer lines, less nesting, fewer
concepts to hold in mind. Deletion is the best refactoring; the second best
is replacing imperative plumbing with a composed expression.

## Goal per round

A round succeeds when at least one of these moved in the right direction,
with behavior unchanged:

- **Lines of code** — dead code deleted, duplication merged, boilerplate
  collapsed into an expression.
- **Complexity** — nesting flattened, branches removed, state variables
  eliminated, control flow made linear.
- **Design** — a function or class reshaped so its structure matches its
  purpose (see "Design moves" below).

Two hard limits:

1. **Behavior preservation** — the result must be verifiably equivalent.
2. **Round budget** — one round is one small reviewable diff:
   **≤ ~50 changed lines, ≤ 2 files** (the target plus its direct callers),
   **at most one structural reshape**. A change that cannot fit is not done
   bigger — it is **sliced into rounds**
   ([references/multi-round.md](references/multi-round.md)). Never let a
   round grow into a big refactoring "since we're at it".

What it never does: add features, add dependencies, tune performance, swap
libraries, or mix a bugfix silently into a refactoring (label bugfixes
`BUGFIX`, propose apart).

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

## Codebase graph (MCP) — use before grep

If the `codebase-memory-mcp` server is available, it replaces most manual
grepping in the steps below with a precise, ~500-token graph query. Check
`index_status` (or `list_projects`) once per session; if the repo isn't
indexed, run `index_repository` first, then use the tools — otherwise fall
back to Grep/git log as usual. Full tool list and gotchas: `codebase-memory`
skill.

| Need | Call |
|:-----|:-----|
| Worst dead-code / fan-out candidates repo-wide | `search_graph(max_degree=0, exclude_entry_points=true)` / `search_graph(min_degree=10, direction="outbound")` |
| Every caller of a function before touching it | `trace_path(function_name, direction="both", depth=3)` |
| Repo-wide near-duplicates before merging | `search_graph(name_pattern="...")` |
| Precise source range for one symbol (skip re-reading a huge file) | `get_code_snippet(qualified_name)` |
| What a diff actually affects | `detect_changes()` |

## Workflow

1. **Check the ledger.** If `.micro-optimiz.md` exists at the repo root, an
   in-progress multi-round change has priority: do its next step
   ([references/multi-round.md](references/multi-round.md)), then stop.
2. **Pick the target.** The file(s) the user named; otherwise the files most
   recently changed (`git log --since` / current diff, or `detect_changes()`
   if MCP is available). Daily mode: rotate — don't re-polish yesterday's
   file; if no file is named, `search_graph(min_degree=10, direction="outbound")`
   surfaces the highest fan-out (worst) candidate repo-wide.
3. **Read the whole file, then its context.** Before reshaping a function,
   check its callers and siblings: a redesign must fit how the function is
   actually used, and the class design around it. Never redesign from the
   body alone. Prefer `trace_path(function_name, direction="both", depth=3)`
   over grepping for callers — it catches cross-service calls grep misses.
4. **Hunt in this order:**
   a. **Delete** — dead code, unused exports/params, commented-out blocks,
      speculative flexibility, redundant comments. Free wins first.
      `search_graph(max_degree=0, exclude_entry_points=true)` finds
      repo-wide dead code, not just what's visible in the current file.
   b. **Flatten** — guard clauses, merged conditions, removed else-branches,
      exhaustive matches instead of if-chains
      ([references/catalog.md](references/catalog.md) sections A & B).
   c. **Error paths** — swallowed or over-broad catches, exceptions as
      control flow, scattered try/catch that belongs at one boundary
      ([references/error-handling.md](references/error-handling.md)).
   d. **Unify** — merge proven duplication (rule of three) into one generic,
      well-named helper; align divergent names for the same concept
      (catalog B9, C1, C11). Generic means *parametrizing what already
      varies* — never speculative flexibility. Before merging,
      `search_graph(name_pattern=".*similarName.*")` checks for repo-wide
      near-duplicates so the new helper absorbs all of them, not just the
      two in front of you.
   e. **Reshape** — the one function or class in the file with the worst
      complexity-to-purpose ratio; redesign it using the moves in
      [references/composition-fp.md](references/composition-fp.md).
      `search_graph(min_degree=10, direction="outbound")` on the file's
      functions confirms which one actually has the worst fan-out instead
      of eyeballing it.
   Load the matching language profile from [languages/](languages/).
5. **Size every candidate against the round budget.** Fits → apply now.
   Too big → don't shrink your ambition, shrink the step: slice it per
   [references/multi-round.md](references/multi-round.md), apply step 1,
   write the rest to the ledger.
6. **Apply, then verify.** Tests if they exist, otherwise type-checker or
   compiler, otherwise re-read the full diff. Verification fails → revert
   that change, don't patch forward.

   **MECHANICAL CHECK — don't eyeball the round budget:**
   ```bash
   skills/micro-optimiz/scripts/verify-round.sh [--verify-cmd "<test/type-check cmd>"]
   ```
   Computes files-changed and lines-changed from `git diff --numstat` (exact,
   not eyeballed) against the two hard limits, and runs `--verify-cmd` if
   given as the behavior-preservation check. Exit 1 = over budget, slice
   into [references/multi-round.md](references/multi-round.md) instead of
   shrinking scope. Zero dependency (bash + git). It cannot count "at most
   one structural reshape" — that stays a judgment call.
7. **Report the delta.** Lines before → after, what was deleted, what was
   reshaped and why. State ledger status (steps remaining, or ledger
   deleted). End with observations: tomorrow's candidates.

Propose before applying only if the user asked for review; daily/recurring
runs apply directly and report.

## Design moves (function & class level)

Allowed in one round when call sites are within reach **and the diff fits
the round budget**:

- Rewrite a function's body entirely (loop → pipeline, state machine → match).
- Split a two-purpose function; inline a needless indirection; separate a
  pure calculation from the IO around it (separation of concerns).
- Replace a flag parameter with two functions or an injected function
  (strategy as a function — the only design patterns used here are the
  lightweight ones that *remove* branches: strategy, lookup table, null
  object; never pattern-for-pattern's-sake).
- Turn a one-method class into a function; a data-only class into a
  record/dataclass; replace an inheritance level with composition or a
  passed-in strategy function.
- Merge overlapping helpers into one generic one; delete the wrappers.

Too big for one round but still in scope → slice it
([references/multi-round.md](references/multi-round.md)).

Out of reach entirely (report as observation, don't do): moves across
modules, public API changes with external callers, architecture changes.

## Daily cadence

Designed to run as a recurring pass (cron, `/loop`, or habit). Each run:
one target, one focused round, one small reviewable diff. Compounding beats
big-bang: never let a round grow into a rewrite because "we're at it anyway".
The ledger carries multi-round work between runs; yesterday's observations
are today's candidates.

## Naming

When a rename is part of a reshape and the `naming-convention` skill is
available, use its vocabulary and casing rules; otherwise follow the file's
existing convention.
