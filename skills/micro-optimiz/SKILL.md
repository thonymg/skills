---
name: micro-optimiz
description: Daily maintainability pass — code health, not speed. Each round
  is one small, behavior-preserving diff against four axes — code smells
  (dead code, duplication, nesting, swallowed errors, two-purpose
  functions), conventions, architectural discordance (a module violating a
  layer, or diverging from the error or dependency contract its siblings
  honour), and design. Work too large for one round is sliced into a
  ledger; architecture work is reported with its evidence, never attempted.
  Use when the user asks to simplify, refactor, clean up, reduce
  complexity, or shrink code; to improve a function's design, make code
  more generic, or remove a flag/boolean parameter; mentions dead code,
  duplication, error handling, naming, code smells, SOLID, readability,
  maintainability, technical debt, convention drift, inconsistency between
  modules, or a daily cleanup pass. Also triggers on a pasted function to
  simplify — small input still goes through the catalog, not ad-hoc advice.
  Explicitly NOT performance work — never optimize for speed, memory, or
  benchmarks; never add features or swap libraries.
---

# micro-optimiz — daily maintainability pass

Despite the name, this is **not performance work**. Never trade readability
for speed here, never micro-tune a loop, never touch a benchmark. What gets
smaller is the cost of understanding and changing the code — not its
runtime. A request that is genuinely about speed is out of scope: say so
and stop.

Run this every day and the codebase gets easier every day. Deletion is the
best refactoring; the second best is replacing imperative plumbing with a
composed expression; the third is making a module look like its neighbours.

## Goal per round

A round succeeds when at least one of these moved in the right direction,
with behavior unchanged:

- **Lines of code** — dead code deleted, duplication merged, boilerplate
  collapsed into an expression.
- **Complexity** — nesting flattened, branches removed, state variables
  eliminated, control flow made linear.
- **Conformance** — a file brought back in line with the project's declared
  rules or with the shape its sibling modules already follow
  ([references/conformance.md](references/conformance.md)).
- **Design** — a function or class reshaped so its structure matches its
  purpose (see "Reach" below).

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

## Style preference — composition & light FP

Between two equivalent shapes, prefer the compositional one: pure function
over stateful method, pipeline over mutation-and-reassign, composition over
inheritance, a passed function over a flag parameter, IO at the edges.
**Light** FP only — if the functional version reads worse than the loop,
keep the loop. Patterns and the reshape moves allowed in one round:
[references/composition-fp.md](references/composition-fp.md), read before
restructuring anything.

## Load only what this round needs

| Read | When |
|:-----|:-----|
| [references/catalog.md](references/catalog.md) | Always in step 4 — it is the smell list |
| [references/conformance.md](references/conformance.md) | The file works and reads fine but does things differently from its neighbours |
| [references/composition-fp.md](references/composition-fp.md) | About to reshape a function or class |
| [references/error-handling.md](references/error-handling.md) | The hunt reached error paths |
| [references/multi-round.md](references/multi-round.md) | A change does not fit the budget, or a ledger exists |
| [references/graph-tools.md](references/graph-tools.md) | `codebase-memory-mcp` is available and you are about to call it |
| [references/principles.md](references/principles.md) | Two moves disagree and the call needs arbitration |
| [languages/](languages/) | The matching language profile, once the target is known |

MCP names are bare, not callable as written. Prefix `cbm_` under pi,
`mcp__codebase-memory-mcp__` under Claude Code. Under pi, `trace_path`,
`query_graph`, `detect_changes`, `get_architecture` and `get_graph_schema`
need one `cbm_search_tools` call first.

## Workflow

1. **Check the ledger.** If `.micro-optimiz.md` exists at the repo root, an
   in-progress multi-round change has priority: do its next step
   ([references/multi-round.md](references/multi-round.md)), then stop.
2. **Pick the target.** The file(s) the user named; otherwise the files most
   recently changed (`git log --since`, or the current diff). Daily mode:
   rotate — don't re-polish yesterday's file. With no file named, the
   highest fan-out symbol repo-wide is the worst candidate; the graph finds
   it in one call ([references/graph-tools.md](references/graph-tools.md)).
3. **Read the whole file, then its context.** Before reshaping a function,
   check its callers and siblings: a redesign must fit how the function is
   actually used, and the class design around it. Never redesign from the
   body alone. Trace callers through the graph rather than grepping for
   them — grep misses cross-service calls, and an incomplete caller list is
   what turns a safe delete into a broken build.

   Context also means the rules the file lives under: the nearest
   `AGENTS.md`/`CLAUDE.md` above it, and two or three siblings at the same
   layer. That is what makes conformance findings citable instead of a
   matter of taste — about three files, no more
   ([references/conformance.md](references/conformance.md)).
4. **Hunt in this order.** Free wins first, judgment calls last. Each axis
   names the reference that holds its moves; the graph calls that widen a
   step beyond the current file are in
   [references/graph-tools.md](references/graph-tools.md).

   a. **Delete** — dead code, unused exports/params, commented-out blocks,
      speculative flexibility, redundant comments.
   b. **Flatten** — guard clauses, merged conditions, removed else-branches,
      exhaustive matches instead of if-chains (catalog A & B).
   c. **Error paths** — swallowed or over-broad catches, exceptions as
      control flow, scattered try/catch that belongs at one boundary
      ([references/error-handling.md](references/error-handling.md)).
   d. **Unify** — merge proven duplication (rule of three) into one
      generic, well-named helper; align divergent names for the same
      concept (catalog B9, C1, C11). Generic means *parametrizing what
      already varies* — never speculative flexibility. Check for
      near-duplicates repo-wide first, so the helper absorbs all of them
      and not just the two in front of you.
   e. **Reshape** — the one function or class with the worst
      complexity-to-purpose ratio
      ([references/composition-fp.md](references/composition-fp.md)).
      Confirm which one actually has the worst fan-out instead of
      eyeballing it.
   f. **Align** — the file works and reads fine but does things differently
      from the rest of the codebase: a layer crossed that siblings respect,
      a diverging error or dependency contract, constants or tests in an
      off-convention place, the same concept under another name
      ([references/conformance.md](references/conformance.md)). Fix it when
      it fits the budget, otherwise report it with its citation. Align to
      the convention that already exists — never invent one here.

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
   <skill-dir>/scripts/verify-round.sh [--verify-cmd "<test/type-check cmd>"]
   ```
   `<skill-dir>` is wherever this SKILL.md is installed —
   `.claude/skills/micro-optimiz/` as a project skill,
   `~/.agents/skills/micro-optimiz/` when shared across harnesses. Resolve
   it from this file's own path; don't assume a repo layout. Script missing
   → count with `git diff --numstat` by hand and say you did.
   Computes files-changed and lines-changed from `git diff --numstat` (exact,
   not eyeballed) against the two hard limits, and runs `--verify-cmd` if
   given as the behavior-preservation check. Exit 1 = over budget, slice
   into [references/multi-round.md](references/multi-round.md) instead of
   shrinking scope. Zero dependency (bash + git). It cannot count "at most
   one structural reshape" — that stays a judgment call.
7. **Report the delta.** Lines before → after, what was deleted, what was
   reshaped and why. Any discordance found — fixed, or reported in the
   shape `references/conformance.md` requires. State ledger status (steps
   remaining, or ledger deleted). End with observations: tomorrow's
   candidates.

Propose before applying only if the user asked for review; daily/recurring
runs apply directly and report.

When two moves disagree — a guard clause that costs a duplication, a
pipeline less readable than the loop it replaces, a convention that
contradicts the catalog — the arbitration rules are in
[references/principles.md](references/principles.md). Read it only for that:
it justifies the calls, it does not add any.

## Reach

In one round, when call sites are within reach and the diff fits the
budget: reshaping a function or class, splitting a two-purpose function,
separating a pure calculation from its IO, replacing a flag parameter,
collapsing a one-method class, merging overlapping helpers. The full list
is in [references/composition-fp.md](references/composition-fp.md).

Too big for one round but still in scope → slice it
([references/multi-round.md](references/multi-round.md)).

Out of reach entirely — moves across modules, public API changes with
external callers, introducing or removing a layer, repo-wide renames. These
are **reported, not attempted, and not sliced into the ledger** either: the
ledger is for work this skill will finish itself. A report has to be
actionable — `file:line`, the rule it breaks and where that rule comes from
(the `AGENTS.md` path, or the siblings compared), which limit it exceeds,
and who takes it (`plan-update`, or a human if the convention itself is in
question). Required shape in
[references/conformance.md](references/conformance.md). "Feels
inconsistent" is not a finding.

## Daily cadence

Designed to run as a recurring pass (cron, `/loop`, or habit). Each run:
one target, one focused round, one small reviewable diff. Compounding beats
big-bang: never let a round grow into a rewrite because "we're at it anyway".
The ledger carries multi-round work between runs; yesterday's observations
are today's candidates.

## Not this skill

- **Performance** — speed, memory, allocations, query plans, benchmarks.
  Out of scope whatever the wording of the request.
- **Choosing an architecture or a convention** — this skill aligns code to
  rules that already exist. Picking them is `plan-update`'s job, or a
  human's.
- **Bugfixes** — label them `BUGFIX` and propose apart; a real one belongs
  to `fix-root`, which proves red→green first.
- **Features, dependencies, library swaps.**
