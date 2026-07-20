---
name: fix-root
description: End-to-end bug fix workflow, root cause first. Given a bug
  description, an error message, or a pasted stack trace, generates at
  least 3 distinct hypotheses for the cause before picking one
  (anchoring-bias gate), gathers evidence per hypothesis via the codebase
  graph (trace_path, search_graph, get_code_snippet, query_graph), maps
  every caller/consumer the fix would touch, writes a failing test first,
  applies the minimal fix at the root cause only, then re-verifies the
  change's actual impact and consequences with the same graph
  (detect_changes, trace_path, search_graph) — comparing what actually
  changed against what was planned, checking sibling occurrences of the
  same bug, confirming every caller still holds — before running the full
  suite and a separate self-critique pass. Use when the user asks to fix a
  bug, find or understand the root cause, corrige ce bug, debug this
  error, resolve this stack trace or exception, do a root cause analysis,
  or invokes "/fix-root". Not for refactoring without a bug present.
---

# fix-root — root cause first, fix second, verify third

One sequence, three parts: **diagnose** (don't anchor on the first guess),
**fix** (minimal, at the root cause only), **verify** (prove the graph
looks the way the plan said it would, not just that tests pass). Each part
gates the next — a diagnosis without cited evidence doesn't get fixed, a
fix without a pre-image of its impact doesn't get verified.

## Codebase graph (MCP) — the backbone of every phase, not a lookup step

If `codebase-memory-mcp` is available, it replaces grepping through
unfamiliar code with precise graph queries at every phase below, including
after the fix is applied. Check `index_status` (or `list_projects`)
first; not indexed or stale → `index_repository` before anything else — a
stale index gives wrong "this is the only caller" answers in both the
pre-fix impact map (Phase 6) and the post-fix verification (Phase 10).
Full tool list and gotchas: `codebase-memory` skill.

| Phase | Need | Call |
|:------|:-----|:-----|
| 0 | Repo indexed and current | `index_status` / `list_projects`, then `index_repository` if stale |
| 2 | Locate symbols named in the error/stack trace | `search_graph(name_pattern="...")`, `search_code(pattern)` for the literal error string/log line |
| 2 | Unfamiliar subsystem | `get_architecture(aspects)` |
| 4 | Where a suspect function's data comes from / who calls it | `trace_path(function_name, mode="data_flow"\|"calls", depth=3)` |
| 4 | Exact source of a symbol, skip re-reading the whole file | `get_code_snippet(qualified_name)` |
| 4 | A pattern too specific for the built-in queries | `get_graph_schema()` then `query_graph(cypher)` |
| 4 | Bug might cross service boundaries | `trace_path(function_name, mode="cross_service")` |
| 4 | Rule out "this is intentional" | `manage_adr` — check for a documented decision that looks like the bug |
| 6 | Every caller/consumer of the code the fix would touch (pre-fix baseline) | `trace_path(function_name, direction="both", depth=3)` |
| 6 | Same bug pattern duplicated elsewhere in the repo | `search_graph(name_pattern="...")` on the faulty pattern |
| 9 | Every caller/test covering the code, right before editing | `trace_path(function_name, direction="both", depth=3)` (re-run, not reused from Phase 6 — code may have moved) |
| 10 | Actual blast radius of the diff just made | `detect_changes()` |
| 10 | Compare post-fix callers against the Phase 6 baseline | `trace_path(function_name, direction="both", depth=3)` again — new caller/callee appearing here that wasn't in Phase 6 is scope creep |
| 10 | Confirm no sibling occurrence of the same bug was left behind | `search_graph(name_pattern="...")` / `search_code(pattern)` re-run on the faulty pattern |
| 10 | If the fix changed a signature/contract, every call site still compatible | `query_graph(cypher)` over callers' argument shapes |
| 12 | Record the finding for future debugging | `manage_adr` — log root cause + fix rationale as a decision record |

## Workflow

### Diagnose

1. **Gather input.** Bug description, full error message/stack trace (not
   just the first line), repro steps, expected vs actual behavior. Missing
   repro steps → ask for them or derive them from the trace; don't guess a
   cause from a one-line summary.
2. **Locate the blast site.** `search_code`/`search_graph` for the symbols
   and error text named in the trace. `get_architecture` if the subsystem
   is unfamiliar. Reconnaissance only — no conclusion yet.
3. **Generate ≥3 hypotheses before reading further code.** Each from a
   genuinely different angle: a logic error in the suspect function; a
   data-contract violation from a caller; a race condition / shared
   mutable state; a stale config, migration, or upstream API contract
   change. Write all of them down — this is the anchoring-bias gate, no
   hypothesis gets more depth than the others yet.

   Exception: cause confirmed in ≤1 tool call (typo, obvious off-by-one,
   missing null check visible in the trace itself) → say so in one line,
   skip to step 6. This sequence is for bugs that need it, not ceremony
   for every bug.
4. **Gather evidence per hypothesis.** For each: `trace_path`/
   `get_code_snippet`/`query_graph` calls that confirm or kill it. Cite
   `file:line` or qualified name for every claim — no hypothesis accepted
   or rejected without a cited source.
5. **Pick the root cause.** The hypothesis whose evidence actually holds.
   State explicitly why each other hypothesis was rejected and what
   evidence rejected it.

### Fix

6. **Map the pre-fix baseline.** `trace_path(function_name,
   direction="both", depth=3)` for every caller and callee of the code
   about to change — this baseline is what Phase 10 verifies against.
   `search_graph` for the same faulty pattern duplicated elsewhere in the
   repo. From this, decide: edge cases the fix must cover (null/empty,
   boundary values, concurrency, large input, repeat/retry — the class of
   bug, not just the reported instance), regression tests to add, and what
   is explicitly out of scope.
7. **Write the failing test first.** Reproduce the bug as a test, show it
   red, before touching the fix.
8. **Apply the minimal fix, root cause only.** No renames, no reshaping,
   no drive-by cleanup in this diff — note any such temptation as a
   follow-up, not part of this change.

### Verify

9. **Re-check impact right before/after editing.** If the edit touched
   more than one symbol, re-run `trace_path` on each — don't rely solely
   on the Phase 6 snapshot if the diagnosis shifted mid-fix.
10. **Verify the actual consequences against the plan.** This is the step
    that closes the loop, not optional:
    - `detect_changes()` for the diff's real blast radius.
    - `trace_path(function_name, direction="both", depth=3)` again on the
      changed symbol(s); diff the result against the Phase 6 baseline —
      any caller/callee appearing now that wasn't there before is scope
      creep, investigate before continuing.
    - `search_graph`/`search_code` re-run on the faulty pattern — confirm
      no sibling occurrence was left unfixed; report any found even if out
      of scope for this diff.
    - Signature/contract changed → `query_graph` over every call site to
      confirm each still passes compatible arguments.
11. **Run the full suite**, not just the new tests, plus one test per edge
    case from Phase 6. A failure here means revert and re-diagnose, not
    patch forward on top of it.
12. **Self-critique, separate pass.** After green: list 3 ways this change
    could break something silently (ordering, shared state, a caller
    relying on the old — buggy — behavior on purpose). Check each against
    `trace_path`/`get_code_snippet`, don't reason from memory alone.
    Optionally `manage_adr` to record root cause + fix rationale for
    future debugging.
13. **Report.** Hypotheses considered and rejected (with evidence), root
    cause, the diff, tests added, Phase 10 verification results (baseline
    vs actual, sibling occurrences, contract check), suite status.

## Hard rules

- No hypothesis is rejected without cited evidence — "probably not that"
  is not a rejection.
- Never fewer than 3 hypotheses for a non-obvious bug.
- Never skip the failing-test-first step.
- Never mix a refactor into this diff. Note it, don't do it here.
- Never report "done" without Phase 10's post-fix graph verification and a
  full suite run — a fix that only passed its own new test is unverified.
- Phase 6's baseline and Phase 10's re-check both use `trace_path` on
  purpose — the second call is what catches scope creep the first one
  couldn't have predicted.
