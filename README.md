# Skills

A curated collection of [Agent Skills](https://agentskills.io/home) for Claude Code and other AI coding agents.

GitHub: https://github.com/thonymg/skills

## What is a "Skill"?

A skill is a small, self-contained prompt bundle (a `SKILL.md` + optional references/vocabulary) that teaches an agent:

- **When** to activate (trigger phrases in the `description` frontmatter)
- **What** rules to follow
- **How** to produce consistent outputs (examples, checklists, vocabularies)

## Installation

```bash
pnpx skills add thonymg/skills --skill='*'
npx skills add thonymg/skills --skill='*'
bunx skills add thonymg/skills --skill='*'
```

Or install globally with `-g`. Learn more at [vercel-labs/skills](https://github.com/vercel-labs/skills).

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| [naming-convention](skills/naming-convention) | Structured naming convention system — syntax, semantics, and grammar rules for variables, functions, classes, files, and more | naming, convention, prefix, suffix, camelCase, snake_case, identifier |
| [archi-vide](skills/archi-vide) | Empty, strongly-typed architecture scaffolding — code stubs with minimal comments and clear boundaries, no implementation | scaffold, skeleton, architecture, stubs, clean architecture, ports, adapters, repository |
| [micro-optimiz](skills/micro-optimiz) | Daily micro-refactoring — one small behavior-preserving diff per round; big changes are sliced into a ledger and done over several rounds, never in one shot | optimize, simplify, refactor, clean up, dead code, duplication, error handling, SOLID, daily pass |
| [fix-root](skills/fix-root) | Root-cause-first bug fix — ≥3 hypotheses before picking one, evidence and impact map via the codebase graph, failing test first, minimal fix, then re-verifies impact/consequences with the same graph before the full suite | fix this bug, corrige ce bug, root cause, RCA, cause profonde, debug this error, resolve this exception |
| [plan-feat](skills/plan-feat) | Module-level implementation plans for a **new** feature or application — directive markdown plans (Gherkin, glossed math invariants), doc-coherence preflight, progress tracker, critique rounds; never writes code | implementation plan, plan d'implémentation, plan de feature, découpage en modules, planifier une application, /plan-feat |
| [plan-update](skills/plan-update) | Update plans for an **existing** feature — current-state reconnaissance, impact analysis with ripple set, delta plans, data migration & deprecation, blocking coherence gates; revises plan files in place, never writes code | modifier une feature, faire évoluer, plan de modification, plan d'évolution, update/evolve a feature, /plan-update |
| [agents-md-sync](skills/agents-md-sync) | Lifecycle of the project's AGENTS.md/CLAUDE.md hierarchy — scaffold a new subfolder's local rules, sync the root map against real files, audit non-repetition/isolation/additive-contract/map-sync invariants | AGENTS.md, CLAUDE.md, scaffold feature, audit hiérarchie, synchroniser carte, créer un module avec ses conventions |

### naming-convention

- Applies a 3-layer convention: **Syntax** (casing), **Semantics** (noun/verb roles), **Grammar** (closed prefix+suffix vocabulary)
- Proposes compliant names and refactors in any language (JS/TS, Python, Java/Kotlin, SQL, routes/CSS…)
- Detects and fixes common anti-patterns:
  - Contextual redundancy: `user.getUserName()` → `user.getName()`
  - Forbidden vague words: `data`, `info`, `temp`, `x`
  - Mixed responsibilities: `processAndSaveOrder()` → split into 2 actions
  - Infra suffix alone: `Manager/Handler/Helper` must be paired with an entity
- Ships a deterministic linter (`tests/`) plus per-domain vocabularies and language rules in reference files

### archi-vide

- Generates **empty** architectures: strongly-typed stubs, explicit module boundaries, zero business logic
- Always delivers a file tree, the stub code, a short rationale on dependency direction, and an `archi-*.md` note (why, impacts, expected results)
- Language profiles and pattern references (ports/adapters, repository, clean architecture) keep the skeleton idiomatic per stack

### micro-optimiz

Daily micro-refactoring (cron, `/loop`, or habit): each run picks one target and produces **one small reviewable diff**. Strictly behavior-preserving — bugfixes are labeled `BUGFIX` and proposed separately.

- **Two hard limits**: behavior preservation, and a **round budget** (≤ ~50 changed lines, ≤ 2 files, at most one structural reshape). A change that doesn't fit is never done bigger — it is sliced into rounds.
- **Multi-round slicing** ([multi-round.md](skills/micro-optimiz/references/multi-round.md)): parallel change (expand → migrate → contract), Mikado-lite (try, revert, do the leaf prerequisite), within-file strangler. In-progress plans persist in a `.micro-optimiz.md` ledger at the repo root — checkbox steps, each shippable alone, finished sections deleted. A run always resumes the ledger before opening new work.
- **Hunt order**: Delete (dead code, speculative flexibility) → Flatten (guard clauses, if-chains → match/lookup) → Error paths (swallowed catches, one boundary) → Unify (rule-of-three duplication → one generic helper, name alignment) → Reshape (the worst function or class)
- **Composition & light FP**: loop+accumulator → pipeline, flag parameter → injected function, inheritance level → strategy function, IO interleaved → pure core + thin shell. Only branch-removing design patterns (strategy, lookup table, null object) — never pattern-for-pattern's-sake, never speculative generality.
- **50+ cataloged moves** in a uniform `Detect / Fix / Principle` format: [catalog](skills/micro-optimiz/references/catalog.md) (latent bugs, readability, structure), [composition-fp](skills/micro-optimiz/references/composition-fp.md), [error-handling](skills/micro-optimiz/references/error-handling.md) — grounded in [principles](skills/micro-optimiz/references/principles.md) (Fowler, Kent Beck's *Tidy First?*, Ousterhout, SOLID, cognitive complexity) with an explicit conflict-resolution order, plus language profiles (TS, Python, Ruby, Dart/Flutter)
- **Report per round**: lines before → after, what was deleted/reshaped, ledger status, and observations that become tomorrow's targets

### fix-root

One sequence — diagnose, fix, verify — leaning on `codebase-memory-mcp` at
every phase, not just to locate the bug.

- **Diagnose**: ≥3 hypotheses for the cause before picking one
  (anchoring-bias gate — no single first-guess diagnosis), each backed by
  cited evidence from `trace_path`/`search_graph`/`get_code_snippet`/
  `query_graph`; other hypotheses rejected with evidence, not assumption.
- **Fix**: maps every caller/consumer before touching code
  (`trace_path(direction="both")`), writes a failing test first, applies
  the minimal diff at the root cause only — no refactor mixed in.
- **Verify**: re-runs the same graph calls post-fix and diffs the result
  against the pre-fix baseline — `detect_changes()` for the real blast
  radius, `trace_path` again to catch scope creep, `search_graph` to
  confirm no sibling occurrence of the same bug was left behind, then the
  full suite and a separate self-critique pass before reporting.

### plan-feat

Plans, never code: turns a prompt, a `*.md` spec, or a folder of specs into
a `plans/<feature_slug>/` folder — one overview with a relation map, one
directive plan file per module, one progress tracker.

- **Doc-coherence preflight** before anything: all in-scope `*.md` docs
  cross-checked against each other (architecture + naming axes), every
  contradiction reported and then checked against the code for a double
  report — never silently resolved.
- **Calibrated scope**: small → a single `plan.md`; large → features →
  modules → relations → sequential plan writing; whole application →
  staged batches with a global tracker.
- **Plans a small LLM can execute**: imperative steps that spell out the
  exact `naming-convention` and `codebase-memory-mcp` calls with expected
  results, Gherkin scenarios per behavior, invariants in closed
  mathematical notation where **every formula carries its plain-language
  gloss** ([math-notation.md](skills/plan-feat/references/math-notation.md)).
- **Coherence as a protocol** ([coherence.md](skills/plan-feat/references/coherence.md)):
  checklist after every plan, critique rounds until a round yields nothing
  substantial.

### plan-update

Sibling of plan-feat for **change**: modify an existing feature or add
features to an existing system. Shares plan-feat's references (template,
trackers, coherence, math notation) instead of duplicating them.

- **Reconnaissance first**: existing plans + code graph; each touched
  element classified `existing / planned-only / absent`; code without
  plans → reverse brief from the graph.
- **Impact analysis before any plan**: `trace_path(direction="both")`
  ripple set → impact table (`modified · new · deprecated · verify-only`)
  in `00-overview.md`; nothing dropped silently.
- **Delta plans in place** ([update-template.md](skills/plan-update/references/update-template.md)):
  `Current state` (verbatim graph evidence), `Delta` (before → after,
  glossed), `Migration & compatibility` (live data, rollback,
  deprecation timeline), mandatory regression vigilance.
- **Strict coherence gates**: blocking, evidence-backed check after every
  revision, logged in the tracker; `done` only after a final full-set
  gate on fresh evidence.

### agents-md-sync

Enforces the model already in place in this repo: `AGENTS.md` = canonical
content, `CLAUDE.md` = `@AGENTS.md` pointer, root = orchestration only,
subfolders = local rules only (never repeat an ancestor, never mention a
sibling without an explicit exception).

- **`create <path> <role>`**: refuses if the target `AGENTS.md` already
  exists. Builds a mandatory, never-hardcoded inventory of imposable
  resources (project/global agents, the session's live skill list — which
  covers plugin skills `ls` can't see, MCP servers from `.mcp.json` +
  `claude mcp list`) merged by name, project scope wins ties, referenced
  by name only (never a path). Generates `<path>/AGENTS.md` from
  [AGENTS.template.md](skills/agents-md-sync/templates/AGENTS.template.md)
  and a one-line `<path>/CLAUDE.md` pointer, then updates the root map and
  runs `audit`.
- **`sync`**: diffs the root `## Carte` section against the real
  `AGENTS.md` files on disk (ghost entries / orphan files), proposes
  additions/removals, writes only after explicit user validation.
- **`audit`**: runs [audit.sh](skills/agents-md-sync/scripts/audit.sh)
  (non-repetition, isolation, map-sync invariants) and
  [check-additive.sh](skills/agents-md-sync/scripts/check-additive.sh)
  (additive-contract candidate pairs — flags for human judgment, never
  auto-resolves), portable bash only, zero dependencies.

## How It Works

Each skill is a `SKILL.md` with YAML frontmatter that tells the agent **when** and **how** to activate. Skills are triggered on-demand from the `description` field — e.g. `micro-optimiz` activates on "optimise ce fichier", "clean up", "passe quotidienne de refacto"; `naming-convention` on any naming/convention question.

## Testing

Two layers, both wired for CI:

- **Linter regression tests** — deterministic, free, run on every push (`.github/workflows/ci.yml`):

  ```bash
  npm test          # or: bash tests/run-linter-tests.sh
  ```

  Fixtures live in `tests/fixtures/` (`violations/` with known counts, `clean/` with zero, `custom-vocab/` proving `vocabulary/custom.md` is honored). Expected counts per check are pinned in `tests/expected.json`.

- **Skill trigger evals** — one prompt set per skill in `evals/*.json` (`naming-convention`, `archi-vide`, `micro-optimiz`), played through `claude -p` in a throwaway workspace (costs API budget; manual workflow `evals.yml`):

  ```bash
  python3 evals/run-evals.py micro-optimiz --dry-run       # list cases, no API calls
  python3 evals/run-evals.py micro-optimiz --trials 3
  python3 evals/run-evals.py micro-optimiz --without-skill # retirement test (baseline)
  ```

  Each case asserts whether the skill should trigger and which regexes the final answer must (or must not) match. Cases cover nominal moves, guard rails (no big-bang rewrite, `BUGFIX` labeling, no speculative generality), and negative prompts that must NOT trigger. Run `--without-skill` quarterly: if the bare model passes, the skill section is absorbed — slim it down.

- **Per-skill eval specs** ([agentskills.io format](https://agentskills.io/skill-creation/evaluating-skills)) — `plan-feat` and `plan-update` ship their own `evals/` folder inside the skill directory: `evals.json` (3 test cases with assertions, for with/without-skill output grading) and `eval_queries.json` (10 trigger queries each, negatives are near-misses aimed at the sibling skill).

### Adding a Skill

1. Create `skills/<name>/SKILL.md` with frontmatter (`name`, `description`)
2. Add `references/` and `languages/` for deeper context (optional)
3. Add an eval spec `evals/<name>.json` and register the name in `.github/workflows/evals.yml` options
4. Update the table above

## License

MIT
