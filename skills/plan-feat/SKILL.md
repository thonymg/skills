---
name: plan-feat
description: >-
  Produce module-level implementation plans for a NEW feature or
  application — markdown plan files in a per-feature folder, never code.
  Takes a free prompt, a *.md file, or a folder of *.md docs;
  cross-checks project docs against each other and against the code
  before planning, splits large scope into modules, and writes one
  directive plan file per module (needs, order, checks, relations,
  vigilance points, Gherkin scenarios, glossed invariants) with a
  progress tracker and critique rounds. Scales to a whole application
  via staged batches. Use when the user asks for an implementation plan,
  to plan a new feature or app, un plan d'implémentation, plan de
  feature, découpage en modules, planifier une application, or invokes
  "/plan-feat". Planning only — never implements. NOT for modifying,
  extending, or updating an existing feature or its plans — use the
  sibling skill plan-update for that.
---

# plan-feat — module-level implementation plans

Produces **plans**, never implementation code. Output = a
`plans/<feature_slug>/` folder containing an overview, one plan per module,
and a progress tracker.

Scope: **new** features. Modifying or extending an existing feature →
sibling skill `plan-update`.

## Input

Normalize any input — free prompt, a `*.md` file, or a folder of `*.md`
files (read them in full) — into a **brief**: goal, scope, constraints,
unknowns. Blocking unknowns → ask the user **before** splitting, not after.

## Preflight — doc coherence

Always first, before touching the graph or the code: read
[references/doc-coherence.md](references/doc-coherence.md) and run its
four steps on every project `*.md` touching the scope.

## Mandatory tools

| Need | Tool |
|:--|:--|
| Any identifier named in a plan (files, modules, classes, routes, tables) | Skill `naming-convention` — mandatory, no improvised names |
| Structure skeletons proposed in a plan | Skill `archi-vide` — plans reference typed empty architectures, not vague pseudo-code |
| Simplifying a split that grows | Skill `micro-optimiz` — apply its logic (DRY, single responsibility, YAGNI) to the split itself |
| What already exists in the code | `codebase-memory-mcp`: `index_status` first (index if absent/stale), then `search_graph`, `get_architecture`, `trace_path`, `get_code_snippet` |
| Feature with design/UI | Browser-controller MCP if available (inspect existing screens) + skill `ui` for maquina contracts |

Never plan on an unindexed repo: the `existing / todo` relations would be
guesses.

## Phase 0 — Calibration

Assess the brief: how many files touched, how many distinct features, how
many domains (`docs/*.md`) involved.

- **Small** (1 feature, ~1-5 files, 1 domain) → **a single file**
  `plans/<feature_slug>/plan.md` following the module plan template. No
  module split, no tracker. State in one line why it is small, and stop
  there.
- **Large** (several features or files or domains) → full pipeline,
  Phases 1-5.
- **Whole application** (several domains, dozens of modules) → one level
  up: first split into **stages** (coherent feature batches, ordered by
  dependency — foundation/shared first), announce that split to the user,
  then run the full Phases 1-5 pipeline **per stage**, one stage at a
  time. Track stages in the global `plans/_progress.yml` — read
  [references/trackers.md](references/trackers.md) when creating or
  resuming any tracker.

## Phase 1 — Features

Split the brief into:

- **Specific features** — tied to one usage.
- **Shared features** — used by ≥ 2 specific features.

Rules: DRY (any duplication between features moves up to shared), YAGNI (a
feature with no explicit request and no mandatory dependency → removed,
stated in one line), maximal simplicity (two valid splits → the smaller
one wins). Every feature keeps a one-sentence justification; no
justification → no feature.

## Phase 2 — Modules

Each feature splits into **modules**: a cohesive grouping of functions
around a single responsibility. Applies to backend and frontend alike:

- **Backend** — model + migration, service (ApplicationService), job, API
  endpoint, policy… grouped by responsibility (e.g. module `split-payment`
  = Payment model + PaymentSplitService + reminder job).
- **Frontend** — atomic-design reference: a module ≈ an organism, composed
  of molecules (components), composed of atoms.
- A mixed feature produces modules of both kinds, related in Phase 3.

For each module:

- **Existence justification** — one sentence. Impossible to justify →
  merge or remove.
- Check via `search_graph` / `get_architecture` whether it already exists
  in the code → status `existing` (fully in code) or `partial` (partially
  in code); everything else is `todo`.
- Modules used by ≥ 2 features → **shared modules**, planned first.

## Phase 3 — Relations

Build the relation map: who depends on whom, what data flows, which
modules are shared. Every relation is **explicit and justified** (why this
dependency direction). Detect:

- Cycles → re-split; a cycle is a splitting error.
- A module with no relation at all → suspect; re-justify or remove.
- Global implementation order = topological sort of dependencies (shared
  first).

This map goes into `00-overview.md`.

## Phase 4 — Writing the plans

**Never all plans at once** — write one plan at a time, in the Phase 3
topological order. Before writing the first plan, read
[references/plan-template.md](references/plan-template.md) (plan format,
directive language, vigilance-first rule) and
[references/trackers.md](references/trackers.md) (folder layout, tracker
formats). After **each** plan: update `_progress.yml` and run the
coherence checklist of [references/coherence.md](references/coherence.md).

## Phase 5 — Critique rounds

A plan (or the whole set) may need several rounds. Read
[references/coherence.md](references/coherence.md) when starting critique
rounds — round mechanics, per-plan checklist, and stop condition live
there.

## Permanent rule — cross-feature coherence

The plans form a system. Any change to any plan or feature immediately
triggers the coherence pass of
[references/coherence.md](references/coherence.md) — in the same pass,
never "later".

## Gotchas

- A "to create" module that already exists in the graph is a planning
  fault — `search_graph` before committing any module.
- A doc ↔ doc contradiction is never settled by silently picking a side —
  report it; the user arbitrates.
- Writing several plans in one pass hides relation drift until it is
  expensive — one plan, one coherence pass, then the next.
- A formula without its parenthesized gloss is unreadable to small
  models — glossing rule in
  [references/math-notation.md](references/math-notation.md), read it
  before writing any invariant.
- Unindexed repo → every `existing` claim is a guess; `index_status`
  before anything.
