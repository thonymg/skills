---
name: fix-root
description: End-to-end bug fix workflow, root cause first. Asks whether the
  behavior ever worked — if so it is a regression and git bisect finds the
  culprit commit instead of a hypothesis contest. Otherwise triages into a
  short track or a full track (competing hypotheses as an anchoring-bias
  gate, graph evidence, a caller baseline re-verified after). Every track
  keeps a failing test before the fix, a minimal fix at the root cause
  only, and a full suite run. Use when the user asks
  to fix a bug, find or understand the root cause, corrige ce bug, debug
  this error, resolve this stack trace or exception, do a root cause
  analysis, investigate why a call fails or returns an unexpected status,
  investiguer une erreur 403/4xx/5xx, analyse a bug ticket, comprendre
  pourquoi ça échoue, or reports a regression — it worked before, ça
  marchait avant, broken since the last deploy or release or migration,
  find the commit that broke it, git bisect — or invokes "/fix-root". Not
  for refactoring without a bug present.
---

# fix-root — root cause first, fix second, verify third

**Diagnose** (don't anchor on the first guess), **fix** (minimal, root
cause only), **verify** (prove the change did what the plan said). Each
part gates the next.

## Load only what this bug needs

This file is the whole short track. Read a reference only when its
condition holds — loading all four on a one-file bug is the waste this
skill exists to avoid.

| Read | When |
|:-----|:-----|
| `references/regression.md` | The behavior worked before — a tag, a release, a green CI run |
| `references/full-track.md` | The full track was triggered by the triage below |
| `references/graph-tools.md` | `codebase-memory-mcp` is available and you are about to call it |
| `references/test-first.md` | The red→green or suite gate misbehaves, or its script is missing |

MCP names are bare, not callable as written. Prefix `cbm_` under pi,
`mcp__codebase-memory-mcp__` under Claude Code. Under pi, `trace_path`,
`query_graph`, `detect_changes`, `get_architecture` and `get_graph_schema`
need one `cbm_search_tools` call first.

## Triage — two questions before touching a tool

**Is this a regression?** Did the behavior ever work — a release, a tag, a
commit, "it worked before the deploy", a test that used to pass? If yes,
history holds the answer: read `references/regression.md`, which replaces
steps 2-3 and nothing else. If nobody can name a moment when it worked, it
is not a regression — don't bisect a bug that was always there.

**Short or full track?** Short is the default. The full sequence is an
escalation, not the entry point: running it on a bug that didn't need it
burns the budget on ritual instead of on reading the faulty code, and
forces fabricated hypotheses — the very anchoring risk the gate exists to
prevent.

**Short track** — cause visible in the trace/diff/failing test, blast
radius ≤2 files, no concurrency, no service boundary crossed. Steps 1, 4,
7, 8, 10, 12 below. Nothing else.

**Full track** — escalate on any one of these, and only these:

- not reproducible on demand, or intermittent/timing-dependent
- crosses a service, process, or network boundary
- the cause is still not cited after 2 tool calls
- the fix would touch >2 files, a public signature, or shared mutable state
- a previous fix for the same symptom already failed

State the track in one line before the first tool call. Escalating
short → full mid-flight is expected, not a failure. The reverse never
happens: finishing early because it now looks simple is how a fix ships
unverified.

## Workflow

Steps marked *(full)* are skipped entirely on the short track.

### Diagnose

1. **Gather input.** Full error/stack trace (not just the first line),
   repro steps, expected vs actual. No repro steps → ask, or derive them
   from the trace; never guess a cause from a one-line summary. State the
   track here.
2. **Locate the blast site.** *(full)* Search for the symbols and error
   text named in the trace; reconnaissance only, no conclusion yet. Short
   track: the trace already names the site — read that file and go to 4.
   Regression: `references/regression.md` replaces this step.
3. **Generate ≥3 hypotheses before reading further code.** *(full, and
   skipped on the regression track — history already narrowed it)* Each
   from a different angle. Detail and the rejection discipline:
   `references/full-track.md`.
4. **Gather evidence.** Cite `file:line` or a qualified name for every
   claim — nothing is accepted or rejected without a cited source. Short
   track: one hypothesis and one citation, not zero. An uncited cause is a
   guess.
5. **Pick the root cause.** *(full)* State what evidence killed each
   rejected hypothesis.

### Fix

6. **Map the pre-fix baseline.** *(full)* Every caller and callee of the
   code about to change, plus the same faulty pattern elsewhere in the
   repo. This baseline is what step 9 verifies against, and it decides the
   edge cases the fix must cover. See `references/full-track.md`.
7. **Write the failing test first.** Reproduce the bug as a test, show it
   red, before touching the fix. Not unit-testable (a WAF, a proxy, a
   config the code doesn't own)? A reproducible command that exits
   non-zero while the bug is present — a `curl`, a script — is the red
   check. A fix that lands outside the repo is reported **unverified**,
   never as done.
8. **Apply the minimal fix, root cause only.** No renames, no reshaping,
   no drive-by cleanup — note the temptation as a follow-up, not part of
   this diff. Then prove red→green mechanically rather than by self-report:

   ```bash
   <skill-dir>/scripts/verify-test-first.sh "<test-cmd>" -- <fix-file> [...]
   ```

   `<skill-dir>` is wherever this SKILL.md sits — resolve it from this
   file's own path, don't assume a repo layout. Exit 0 only on a confirmed
   red→green. Read the red output it prints: red must come from the bug,
   not from an import error — `--expect-red '<regex>'` makes that
   mechanical. Script missing, test inside the fix file, or a build cache
   making the replay lie: `references/test-first.md`.

### Verify

9. **Verify consequences against the plan.** *(full)* Real blast radius of
   the diff, post-fix callers compared to the step 6 baseline, sibling
   occurrences of the same bug, call-site compatibility if a signature
   changed. Checklist: `references/full-track.md`.
10. **Run the full suite through the gate**, not just the new test, plus
    one test per edge case from step 6. In a monorepo, "full" means every
    package that depends on the changed code, not the whole repo. The gate
    runs the suite without then with the fix and compares failing tests —
    "that failure was already there" is measured, never asserted:

    ```bash
    <skill-dir>/scripts/verify-suite.sh "<suite-cmd>" -- <fix-file> [...]
    ```

    | Exit | Meaning | Do |
    |:-----|:--------|:---|
    | 0 | suite green with the fix | continue |
    | 3 | only pre-existing failures (they fail without the fix too) | report each as a separate bug; don't revert |
    | 1 | a NEW failure, or failures it cannot identify (UNVERIFIED) | revert and re-diagnose, never patch forward — or pass `--fail-pattern` so it can name them |

    Output format unknown to it: `references/test-first.md`.
11. **Self-critique, separate pass.** *(full)* Three ways this change could
    break something silently, each checked against the code rather than
    from memory. See `references/full-track.md`.
12. **Report.** Track chosen and why, root cause with its citation, the
    diff, tests added, and the exit codes of `verify-test-first.sh` and
    `verify-suite.sh` with the pre-existing failures they listed. Full track also: hypotheses rejected
    with their evidence, and the step 9 results.

## Hard rules

- The track is stated in one line before the first tool call. Escalating
  short → full is always allowed; full → short never.
- "It worked before" is checked before anything else. A regression
  diagnosed by hypothesis when a good ref existed is wasted budget.
- No cause is accepted without a cited `file:line` — either track. "Probably
  not that" is not a rejection.
- Full track: never fewer than 3 hypotheses. Short track: exactly one — if
  a second is needed to explain the evidence, that is the escalation
  signal, take it.
- Never skip the failing-test-first step. Both tracks, no exception — a
  repro command counts as the test when the bug is not unit-testable.
- Never mix a refactor into this diff. Note it, don't do it here.
- Never report "done" unless `verify-suite.sh` exited 0 or 3 — a fix that
  only passed its own new test is unverified, and a suite run you only
  describe is a self-report. On the full track, step 9 is equally
  non-optional.
