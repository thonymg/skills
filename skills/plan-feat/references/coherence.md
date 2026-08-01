# Coherence protocol — shared by plan-feat and plan-update

## Permanent rule — cross-feature coherence

**IMPERATIVE, ALWAYS**: the plans form a system. Any change to a plan
(or a feature) immediately triggers:

1. Re-read the relation map (`00-overview.md`).
2. Check the impact on every related module (Relations column).
3. Update the impacted plans in the same pass — never "later".
4. Record the decision in `_progress.yml`.

A plan changed without checking its neighbors is an incoherent plan.

## Coherence checklist — one pass

Run after **each** plan written or revised. Each item answered yes/no:

1. No contradiction with any previously written plan: entity names,
   invariants, status sets, transitions, relation directions.
2. Relation map ↔ each plan's Relations table match, **both directions**
   (A "provides to" B ⇔ B "depends on" A).
3. Tracker statuses match the plan files on disk.
4. Every identifier introduced passed `naming-convention`; the same
   concept is named identically across all plans.
5. Every `existing` / `partial` status is backed by a graph call.

Any "no" → fix in the same pass, then re-run the checklist.

## Critique round

1. Re-read the plan as an adversary: what breaks? what is missing? which
   module is YAGNI in disguise? (apply the `micro-optimiz` grid to the
   split).
2. Confront it with the real code (`trace_path`, `search_graph`): are
   the "existing" relations true?
3. Fix the plan, increment `critique_rounds` in the tracker.

Stop when a round produces no substantial correction (no politeness
rounds).

## Strict mode — mandatory for plan-update

**plan-feat runs: stop reading here — everything below applies only to
plan-update.**

Change makes incoherence more likely and more expensive: plans, docs,
and running code drift independently. Strict mode turns the checklist
into **blocking gates**:

- **Gate after every revision** — full checklist + three-way check
  (plan ↔ plan, plan ↔ doc, plan ↔ code) scoped to the revised module
  and its ripple-set neighbors. Every answer carries evidence: the exact
  graph call + result, or the quoted plan/doc passage. No evidence =
  FAIL.
- **FAIL → STOP** — fix in the same pass, re-run the gate. Never advance
  a phase, never write the next plan, over a red gate.
- **Evidence log** — every gate recorded in the tracker
  `coherence_checks:` (see trackers.md): which plan, result, evidence
  references.
- **Fresh evidence only** — a graph result predating the last plan
  revision is stale; final-gate evidence must be produced after the last
  revision. Reconnaissance-phase results do not count once plans have
  changed.
- **Final full-set gate before `done`**:
  1. Every relation in `00-overview.md` verified in both directions
     against every plan's Relations table.
  2. Every Delta row matched to a revised Invariants / Behavior /
     Implementation-order section.
  3. Every `verify-only` module of the impact table has a `trace_path`
     evidence entry produced after the last plan revision.
  4. Doc-coherence protocol re-run on every doc touching a revised plan
     (doc ↔ plan axis).
