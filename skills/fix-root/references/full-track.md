# Full track — the detail behind steps 5, 6, 7, 10 and 12

Read this only when the triage escalated. On the short track every step
here is skipped, and skipping them is correct, not a shortcut.

## Step 5 — ≥3 hypotheses, from genuinely different angles

Write all of them down before deepening any one. This is the
anchoring-bias gate: no hypothesis gets more depth than the others yet.
Angles that are actually distinct:

- a logic error in the suspect function itself
- a data-contract violation from a caller (shape, nullability, units,
  encoding, ordering)
- a race condition or shared mutable state
- a stale config, migration, feature flag, or upstream API contract change
- an environment difference — version, locale, timezone, filesystem case
- bad data, correct code — a row a migration left half-written, a cache
  holding an old shape: query the actual record before reading more code

Three hypotheses that are one idea in three costumes ("null somewhere",
"null in the caller", "null in the callee") do not satisfy this. If you
cannot produce three that different, that itself is evidence the bug is
short-track — go back and take the short track rather than padding.

**Attach the killing experiment.** For each hypothesis, write the single
cheapest observation that would falsify it, then run the cheap ones first.
A hypothesis with no experiment attached is an opinion, not a finding.

**Non-code evidence counts.** Status codes, headers, response body type
(HTML where JSON was expected), proxy/gateway/WAF config, environment
variables. A code graph models none of it, and the cause is often there.

## Step 6 — rejection discipline

Each kill is a ledger line: status `killed`, the `path:line`, the
evidence. "Probably not that" is not a rejection; neither is silence. A
hypothesis that was never tested is still open — say so instead of
quietly dropping it.

## Step 7 — the pre-fix baseline

Map every caller and callee of the code about to change, and search for
the same faulty pattern duplicated elsewhere in the repo. Exact calls:
`references/graph-tools.md`.

This baseline does two jobs:

1. It is what step 10 diffs against. Without it, "no new callers appeared"
   is unfalsifiable.
2. It decides the edge cases the fix must cover — null/empty, boundary
   values, concurrency, large input, repeat/retry. Fix the **class** of
   bug, not just the reported instance, and write down what is explicitly
   out of scope.
3. Its callers are the test commands `verify-test-first.sh` takes at step
   9 — one per entry point that routes through the defect. Sibling
   occurrences fixed in the same diff become `allow` lines in the ledger.

An exhaustive "these are all the callers" claim is only as good as the
index behind it. Confirm coverage of the files it touched before treating
the list as complete.

## Step 10 — verify consequences against the plan

This is the step that closes the loop. Not optional on this track.

- **Real blast radius** of the diff just made — what actually changed, not
  what you meant to change.
- **Post-fix callers vs the step 7 baseline.** Any caller or callee
  appearing now that wasn't there before is scope creep: investigate
  before continuing. If the diagnosis shifted mid-fix and the edit landed
  on symbols the baseline never covered, that is itself the signal — trace
  those too.
- **Sibling occurrences.** Re-run the search for the faulty pattern and
  confirm none was left unfixed; report any found even if out of scope for
  this diff. Check index coverage of the searched files first — "no
  sibling occurrence" from a partially-indexed repo is a false negative,
  not a clean result.
- **Contract compatibility.** If the fix changed a signature, check every
  call site still passes compatible arguments.

## Step 12 — self-critique, as a separate pass

After green, list three ways this change could break something silently:

- ordering or timing that the fix subtly altered
- shared state the fix now writes, or stops writing
- a caller that depended on the old — buggy — behavior on purpose

Check each against the actual code, not from memory. Record an ADR only if
the root cause contradicts a documented decision, or this same bug already
came back once; an ADR per bug is noise that buries the ones that matter.
