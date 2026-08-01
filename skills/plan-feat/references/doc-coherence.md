# Preflight — doc coherence protocol

Runs **before any graph or code verification**. Read all project `*.md`
files touching the scope (docs/, user journeys, screens, input briefs,
README) and confront them with each other.

## 1. Cross-check the files — two axes, both equally important

- **Architecture** — same business rules? journeys and screens aligned?
  flows, dependencies and responsibilities described the same way from
  one doc to another? identical statuses/enums? numbers and constraints
  (deadlines, amounts, roles) consistent?
- **Naming** — same entity/concept named the same everywhere (not
  `customer` here, `acheteur` there, `buyer` elsewhere for the same
  thing)? model, route, screen, status names stable across docs? names
  conforming to the `naming-convention` skill?

## 2. Doc ↔ doc contradiction found → report

Report: axis (architecture or naming), files involved, quoted passages,
nature of the contradiction. Never silent, never "resolved" by arbitrary
choice.

## 3. Then check the code

Via `search_graph`, `search_code`, `get_code_snippet`: does this
contradiction also exist in the code (does the code follow one of the two
versions? a third one?) → **double report**: doc ↔ doc + doc ↔ code, with
what the code actually does.

## 4. Arbitration

- Contradiction touching the plan's scope → user arbitration required
  before writing the affected plans; record reports and arbitrations in
  the `notes:` field of `_progress.yml`.
- Contradiction outside the scope → still reported; does not stop the
  work.
