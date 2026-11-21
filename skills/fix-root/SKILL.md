---
name: fix-root
description: Bug fix workflow, root cause first. A red repro before any
  diagnosis; a regression goes to git bisect, anything else to a short or
  full track; a script-checked hypothesis ledger stops loops; a failing test
  before the fix; a minimal fix proven at the root for every caller; a full
  suite gate. Use to fix a bug, debug an error, stack trace or exception,
  find a root cause, investigate a 4xx/5xx or unexpected status, analyse a
  bug ticket, or a regression (it worked before, broken since a deploy,
  release or migration, find the commit that broke it, git bisect) — also
  corrige ce bug, ça marchait avant, pourquoi ça échoue, a crash report
  with no explicit ask (X plante, crashes, throws), or /fix-root. Not
  for refactoring without a bug.
---

# fix-root — repro first, root cause second, proof third

Scripts live in `<skill-dir>/scripts/` — resolve `<skill-dir>` from this
file's path. Every gate exits 0 on pass, 1 on fail, 2 on usage error, 3
when it has a third verdict to report; each prints what to do next. Read a reference only when its condition holds:

| Read | When |
|:-----|:-----|
| `languages/<lang>.md` | Once the language is known — no-cache test command, repeat, race detector, suite pattern |
| `references/regression.md` | The behavior worked at a nameable ref (tag, release, green CI) |
| `references/full-track.md` | The triage escalated to the full track |
| `references/graph-tools.md` | `codebase-memory-mcp` is available and you are about to call it |
| `references/test-first.md` | `verify-test-first.sh` / `verify-suite.sh` misbehaves, or a script is missing |

MCP names are bare, not callable as written. Prefix `cbm_` under pi,
`mcp__codebase-memory-mcp__` under Claude Code. Under pi, `trace_path`,
`query_graph`, `detect_changes`, `get_architecture` and `get_graph_schema`
need one `cbm_search_tools` call first. No graph available: grep and read,
and say so in the report.

## The ledger — memory that survives compaction

`.fix-root/ledger`, kept out of git by step 2. Full and regression
tracks: create it at step 3, one line per event as it happens, and run
`scripts/check-ledger.sh` after each change. Short track: write it once,
when H1 is confirmed at step 6 — only `--final` runs.

```
track | short|full|regression
repro | <command that exits non-zero while the bug is present>
H1    | open|killed|confirmed | <path:line> | <statement> | <evidence>
fix   | H1 | fail|pass
allow | <path> | <reason>        # sibling occurrence the fix may also touch
```

Re-read it before forming any hypothesis: a killed one is never re-tested.

## Triage

1. **Gather input.** Full trace (not the first line), expected vs actual.
2. **Red repro, before reading code.** A command that exits non-zero while
   the bug is present — a test, a `python -c`, a `curl`. Don't run it
   bare: one call does both setup and measure —
   `echo .fix-root >> "$(git rev-parse --git-path info/exclude)"; scripts/measure-repro.sh -n 20 -- <cmd>`:
   exit 1 → no repro: ask, or derive one from the trace; never diagnose
   without it. Exit 3 → intermittent: full track, use the printed
   `--repeat` everywhere. Exit 0 → continue.
3. **Pick the track.**
   - **Regression** — someone names a ref where it worked: read
     `references/regression.md` before bisecting; it replaces steps 4-5.
     The culprit commit is where behavior changed — it may only expose a
     latent defect. Never revert by reflex: step 6 still finds the root.
   - **Short** (default) — cause visible in the trace or failing test, ≤2
     files, no concurrency, no service boundary. Skips steps 7, 10, 12.
   - **Full** — any one of: intermittent (measured), crosses a
     service/process/network boundary, cause not cited after 2 tool calls,
     fix would touch >2 files / a public signature / shared mutable state,
     a previous fix for this symptom failed. All steps.

   Short → full mid-flight is expected. Full → short never.

## Diagnose

4. **Observe, don't reason.** Cheapest evidence first: read the blast site
   (`search_graph` / `search_code` on the symbols and error text);
   typecheck/linter on the suspect file; **differential** — the smallest
   difference between a passing input and the failing one is the lead;
   temporary logs of the real values at each hop (removed before the diff);
   `git blame` on a guard before removing it — its commit may explain it.
5. **Hypotheses.** Full track: ≥3 from different angles, each with the
   cheapest experiment that would kill it: `references/full-track.md`.
   Short track: exactly one — needing a second is the escalation signal.
6. **Walk back to the root.** From the failure, follow the bad value one
   hop upstream at a time. At each function: inputs violate its contract →
   go up one hop — `trace_path(mode="data_flow")` gives the next hop, grep
   the callers without the graph. Inputs valid, output wrong → **the defect
   is here**. The crash site is where the symptom shows, rarely where the
   contract breaks.
   Every kill or confirmation goes in the ledger with its `path:line`.

   **Budget** (full and regression): 5 tool calls without a new ledger
   line → stop, show the ledger, ask. Circling is the failure mode this
   rule exists for. The short track is already capped: no citation after
   2 tool calls escalates it.

## Fix

7. **Baseline.** *(full)* Every caller and callee of the code about to
   change (`trace_path(direction="both")` + `check_index_coverage`), the
   same faulty pattern elsewhere, the edge cases to cover:
   `references/full-track.md`. Siblings to fix go in as `allow` lines.
8. **Turn the repro into a test** and see it red. Not unit-testable (WAF,
   proxy, config outside the repo)? The repro command is the test; a fix
   landing outside the repo is reported **unverified**.
9. **Minimal fix at the root, then prove it:**

   ```bash
   scripts/verify-test-first.sh [--expect-red '<regex>'] [--repeat N] \
     "<test via caller A>" "<test via caller B>" -- <fix-file>...
   ```

   One test command per entry point that routes through the defect (the
   step 7 callers; short track: grep the defect's callers): a
   symptom fix turns one green and leaves another red, and the gate says
   so. Log `fix | Hn | pass|fail`. A fail **refutes the diagnosis** — one
   retouch at most; a second fail is refused by `check-ledger.sh`: mark the
   hypothesis killed and go back to step 4. No renames, no cleanup — note
   them as follow-ups.

## Verify

10. **Consequences.** *(full)* Blast radius (`detect_changes`), callers vs
    the step 7 baseline (`trace_path` again), siblings, call-site
    compatibility: `references/full-track.md`.
11. **Suite gate** (full track: plus one test per step 7 edge case):
    `scripts/verify-suite.sh "<suite-cmd>" -- <fix-file>...` — 0 continue,
    3 = only pre-existing failures (report each separately, don't revert),
    1 = new or unidentifiable failure (revert and re-diagnose, never patch
    forward). Monorepo: every package depending on the change. Chain the
    close in the same call: `verify-suite.sh … ; check-ledger.sh --final`.
12. **Self-critique.** *(full)* Three silent-breakage paths, each checked
    in the code: `references/full-track.md`.
13. **Close.** `scripts/check-ledger.sh --final` (diff only touches the
    confirmed file, `allow` paths and tests; ≤40 non-test lines). Report:
    track, the ledger's hypotheses with evidence, root cause `path:line`,
    diff, tests added, exit codes of the three gates, pre-existing failures.
    Regression: the culprit commit, and whether it introduced the defect or
    exposed a latent one.

## Hard rules

- No diagnosis without a red repro; no fix without a red test.
- No cause accepted or rejected without a cited `path:line` in the ledger.
- The root is where the contract breaks, not where it crashes.
- A failed red→green refutes the hypothesis; it is never "tweak and retry".
- "Done" only when `verify-test-first.sh` exited 0, `verify-suite.sh` 0 or
  3, and `check-ledger.sh --final` 0. Anything less is reported unverified.
