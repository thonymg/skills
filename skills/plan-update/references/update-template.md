# Delta sections for a modified module plan

A modified module keeps its existing `NN-<module>.md` and the full
plan-feat template
([../../plan-feat/references/plan-template.md](../../plan-feat/references/plan-template.md)
— directive language rules included). Revise it **in place** and add
these sections. Order in the file: `Vigilance points` and
`Anticipations` stay first, `Current state` and `Delta` come right
after, before `Need`; `Migration & compatibility` sits after the
revised `Implementation order`, before `Verification checks`.

## `## Current state`

What exists today, with verbatim evidence — never from memory:

```markdown
## Current state
- Evidence: `search_graph(name_pattern="PaymentSplit")` → 1 model, 1 service.
- Evidence: `trace_path("PaymentSplitService.call", direction="both", depth=3)` → callers: CheckoutController#create, RelaunchJob.
- Current invariants:
    Σ s.amount = sale.total_amount
      (the split amounts add up exactly to the sale total)
    status ∈ {draft, pending, paid}
      (only these three statuses exist today)
- Current relations: provides to `checkout`, depends on `sale`.
```

Every claim carries the exact graph call and its result. A claim without
evidence is a guess, and a guess is a planning fault.

## `## Delta`

Before → after, one row per changed element:

```markdown
## Delta
| Element | Before | After |
|:--|:--|:--|
| invariant | status ∈ {draft, pending, paid} (three statuses) | status ∈ {draft, pending, paid, refunded} (adds refunded) |
| transition | — | paid→refunded (a paid sale may now be refunded) |
| relation | — | provides to `refund` (new module) |
| behavior | no partial refund | partial refund ≤ paid amount (never refund more than was paid) |
```

- Invariants: old formula → new formula, in mathematical notation, each
  with its parenthesized plain-language gloss
  ([../../plan-feat/references/math-notation.md](../../plan-feat/references/math-notation.md)).
- Transitions: added/removed, in the state-set notation, glossed.
- Every `Before` cell is backed by `Current state` evidence; every
  `After` cell reappears in the revised Invariants / Behavior /
  Implementation-order sections. A delta row with no matching revised
  section is an unfinished revision.

## `## Migration & compatibility`

Mandatory when persisted data or a public API is touched:

- **Data migration** — directive steps on live data: exact migration,
  backfill, verification query. Each step reversible or with an explicit
  rollback step; irreversible → say so and require user arbitration.
- **Backward compatibility** — every external consumer listed (from
  `trace_path` evidence), and for each: unaffected / adapted in this
  change / temporarily supported (until when).
- **Deprecation** — anything removed: explicit timeline, redirect step
  for each caller, deletion as the last step.

## Vigilance points of a modified module

Same rules as plan-feat (2-3 concrete risks, written first, each
assessed and minimized by the steps), with one mandatory entry:

- **Regression** — which existing behavior could this change break, how
  the plan proves it does not (Gherkin scenario on the *old* behavior
  kept green; ripple-set verification is covered by the strict-mode
  final gate).
