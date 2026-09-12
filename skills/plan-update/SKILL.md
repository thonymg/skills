---
name: plan-update
description: >-
  Produce module-level update plans for changing an existing feature or
  adding features to an existing system — markdown plan files, never
  code. Reuses plan-feat's discipline and adds what change requires:
  current-state reconnaissance, impact analysis with a ripple set, delta
  plans (current → target), regression vigilance, data migration,
  backward compatibility, deprecation, and blocking coherence gates.
  Revises existing plan files in place, keeping the set coherent. Use
  when the user asks to plan a change to an existing feature (e.g. "plan
  a change to the checkout flow"), to update or evolve a feature,
  modifier une feature, faire évoluer une feature, ajouter une feature à
  l'existant, plan de modification, plan d'évolution, or invokes
  "/plan-update". Planning only — never implements. NOT for green-field
  features with no existing plans or code — use the sibling skill
  plan-feat for that.
---

# plan-update — update plans for existing features

Same discipline as `plan-feat`, applied to **change**: modify an existing
feature, or add features to a system that already has plans and/or code.
Produces **plans**, never implementation code. Output = existing plan
files revised **in place** + new numbered plan files for new modules.

## Shared foundations — when to read what

All content lives in the sibling `plan-feat` skill; never duplicate it
here:

- [../plan-feat/SKILL.md](../plan-feat/SKILL.md) — read **first**: its
  mandatory-tools table, phase rules, and gotchas apply throughout.
- [../plan-feat/references/doc-coherence.md](../plan-feat/references/doc-coherence.md)
  — read before the preflight.
- [../plan-feat/references/plan-template.md](../plan-feat/references/plan-template.md)
  — read before writing or revising any plan file, together with
  [references/update-template.md](references/update-template.md) for the
  delta sections.
- [../plan-feat/references/trackers.md](../plan-feat/references/trackers.md)
  — read before creating or updating a tracker.
- [../plan-feat/references/coherence.md](../plan-feat/references/coherence.md)
  — read the **Strict mode** section before the first coherence gate:
  every gate there is blocking here, logged in the tracker
  `coherence_checks:`, and phases never advance over a red gate.
- [../plan-feat/references/math-notation.md](../plan-feat/references/math-notation.md)
  — read when writing or glossing a formula.

## Input

Normalize the change request — free prompt, `*.md` file, or folder — into
a **change brief**: what changes, why, scope, constraints, unknowns.
Blocking unknowns → ask the user **before** any analysis.

## Preflight — doc coherence (extended)

Same protocol, with a third corpus: the existing plan files in `plans/`
count as docs. The cross-check becomes three-way — **doc ↔ plan ↔ code**.
A plan that no longer matches the code it planned is a contradiction like
any other.

## Reconnaissance — current state (before any splitting)

1. READ `plans/`: global tracker, feature trackers, `00-overview.md` of
   every feature the change may touch.
2. RUN `index_status` (index if absent/stale), then `get_architecture`
   on the touched domains.
3. For each element the change touches, classify:
   **existing** (in code) · **planned-only** (plan exists, no code) ·
   **absent** (neither).
4. Feature exists in code but has no plans → build a minimal reverse
   brief from the graph (`search_graph`, `get_architecture`: modules,
   relations, statuses) before planning the change. Nothing exists at
   all → this is green field: use `plan-feat` instead.

MCP names are bare, not callable as written. Prefix `cbm_` under pi,
`mcp__codebase-memory-mcp__` under Claude Code. Under pi, `trace_path`,
`query_graph`, `detect_changes`, `get_architecture` and `get_graph_schema`
need one `cbm_search_tools` call first.

## Phase 0 — Calibration

- **Small** (one module touched, no relation added/removed/redirected) →
  revise that single plan file in place with the delta sections of
  [references/update-template.md](references/update-template.md), record
  the change in the tracker `notes:`, state in one line why it is small,
  stop there. If the feature has no `_progress.yml` (plan-feat small
  path), create one first.
- **Large** (several modules, relation changes, or new modules) → full
  pipeline, Phases 1-5 below.

## Phase 1 — Impact analysis

Replaces plan-feat's feature split. **No plan is written before the
impact table is complete.**

1. Map the change brief to the modules it touches directly.
2. RUN `trace_path(<module function>, direction="both")` on each touched
   module → the **ripple set**: callers, consumers, data flows the
   change can reach.
3. Draft the relation-map diff: relations added / removed / redirected.
4. Produce the **impact table** — it goes into `00-overview.md` and is
   the single record of each module's kind for this run:

| Module | Kind | Why | Evidence |
|:--|:--|:--|:--|
| <module> | modified · new · deprecated · verify-only | one sentence | exact graph call + result |

`verify-only` = in the ripple set but believed untouched — still gets a
verification check in Phase 5, never dropped silently.

## Phase 2 — Modules (delta)

Plan-feat Phase 2 rules apply, plus:

- **Never recreate an existing module** — extend or modify it; a "new"
  module duplicating an existing responsibility is a planning fault.
- New module → full plan-feat treatment: justification + `search_graph`
  existence check.
- Removed responsibility → module marked **deprecated**; never a silent
  delete.

## Phase 3 — Relations

Update the relation map in `00-overview.md` **in place**, marking each
diff (added / removed / redirected) with its justification. Plan-feat
Phase 3 detection rules apply. New implementation order = topological
sort over `modified + new + deprecated` modules (shared first,
deprecations last unless they unblock).

## Phase 4 — Writing the plans

One plan at a time, in the Phase 3 order (plan-feat Phase 4 rules).

- **Modified module** → revise its existing `NN-<module>.md` in place:
  keep the plan-feat template, add the delta sections — read
  [references/update-template.md](references/update-template.md) before
  each revision.
- **New module** → new numbered file, plain plan-feat template.
- **Deprecated module** → its plan records the ordered removal steps per
  update-template §Migration & compatibility → Deprecation; the file is
  kept until removal is implemented.

After **each** plan: the strict coherence gate (coherence.md §Strict
mode). Vigilance rules for modified modules: update-template §Vigilance
points.

## Phase 5 — Critique rounds (strict)

Round mechanics and stop condition: shared coherence protocol, strict
mode. Plus one mandatory question per round:

> Does this change silently break a module it does not modify?

Answer with the evidence required by the strict-mode final gate, not
opinion.

## Gotchas

- Recon evidence is stale the moment a plan changes — final-gate
  evidence must postdate the last revision.
- A ripple-set module dropped from the impact table is a silent
  regression risk — `verify-only` rows stay.
- A `Current state` claim without its graph call is a guess, and a guess
  is a planning fault.
- Every revision is recorded in the tracker `notes:` (what changed, why,
  date) — an unrecorded revision cannot be resumed or audited.
