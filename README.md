# Skills

A curated collection of [Agent Skills](https://agentskills.io/home) for Claude Code and other AI coding agents.

## Repository

GitHub: https://github.com/thonymg/skills

## What is a “Skill”?

A skill is a small, self-contained prompt bundle (a `SKILL.md` + optional references/vocabulary) that teaches an agent:

- When to activate (trigger phrases in `description`)
- What rules to follow
- How to produce consistent outputs (examples, checklists, vocabularies)

## What can skills do?

Typical capabilities provided by skills in this repo:

- Generate names (variables, functions, classes, files, DB tables/columns) that follow strict conventions
- Validate existing identifiers and explain what rule is violated
- Provide concise, domain-oriented examples based on an approved vocabulary
- Enforce consistency across languages (casing changes, patterns stay the same)

## Installation

```bash
pnpx skills add thonymg/skills --skill='*'
npx skills add thonymg/skills --skill='*'
bunx skills add thonymg/skills --skill='*'
```

Or install all skills globally:

```bash
pnpx skills add thonymg/skills --skill='*' -g
npx skills add thonymg/skills --skill='*' -g
bunx skills add thonymg/skills --skill='*' -g
```

Learn more at [vercel-labs/skills](https://github.com/vercel-labs/skills).

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| [naming-convention](skills/naming-convention) | Structured naming convention system — syntax, semantics, and grammar rules for variables, functions, classes, files, and more | naming, convention, prefix, suffix, camelCase, snake_case, identifier |
| [archi-vide](skills/archi-vide) | Empty, strongly-typed architecture scaffolding — generates code stubs with minimal comments and clear boundaries | scaffold, skeleton, architecture, stubs, clean architecture, ports, adapters, repository |
| [micro-optimiz](skills/micro-optimiz) | Daily incremental code optimization — reduces complexity and line count, deletes dead code, reshapes functions/classes toward composition and light FP, behavior-preserving | optimize, simplify, refactor, reduce complexity, dead code, error handling, cleanup pass |

## naming-convention — What it knows how to do

- Apply a 3-layer convention: Syntax (casing), Semantics (noun/verb roles), Grammar (closed prefix+suffix vocabulary)
- Propose compliant names and refactors in any language (JS/TS, Python, Java/Kotlin, SQL, routes/CSS…)
- Detect and fix common anti-patterns:
  - Contextual redundancy: `user.getUserName()` → `user.getName()`
  - Forbidden vague words: `data`, `info`, `temp`, `x`
  - Mixed responsibilities: `processAndSaveOrder()` → split into 2 actions
  - Infra suffix alone: `Manager/Handler/Helper` must be paired with an entity
- Provide ready-to-copy examples by domain and language-specific rules via reference files

## micro-optimiz — What it knows how to do

Designed to run as a daily pass (cron, `/loop`, or habit): each run picks one target, produces one small reviewable diff, and the codebase gets simpler every day. Strictly behavior-preserving — bugfixes are labeled `BUGFIX` and proposed separately.

- Hunt in a fixed order: **Delete** (dead code, unused exports, speculative flexibility) → **Flatten** (guard clauses, if-chains → match/lookup) → **Error paths** (swallowed catches, try/catch scattered instead of one boundary) → **Reshape** (the worst function or class, redesigned)
- Prefer composition and light FP: loop+accumulator → pipeline, flag parameter → injected function, inheritance level → strategy function, one-method class → function, IO interleaved → pure core + thin shell
- 50 cataloged moves in a uniform `Detect / Fix / Principle` format across three references: [catalog](skills/micro-optimiz/references/catalog.md) (latent bugs, readability, structure), [composition-fp](skills/micro-optimiz/references/composition-fp.md), [error-handling](skills/micro-optimiz/references/error-handling.md)
- Grounded in [principles](skills/micro-optimiz/references/principles.md) (Fowler, Ousterhout, Clean Code, cognitive complexity…) with an explicit conflict-resolution order — and language profiles (TS, Python, Ruby, Dart/Flutter) that override generic rules where idioms differ
- Report the delta after each pass: lines before → after, what was deleted, what was reshaped, and observations that become tomorrow's targets

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter that tells the agent **when** and **how** to activate it. Skills can include reference files for deeper context.

### Using a Skill

Skills are activated on-demand by the agent based on the `description` field. For example, `naming-convention` activates whenever you discuss naming, conventions, or code readability.

In practice, you can trigger it by asking things like:

- “Give me a name for a function that …”
- “Does this name follow the convention?”
- “Rename these variables/classes for consistency”
- “Which names should I use for these SQL columns?”

## Testing

Two layers, both wired for CI (`.github/workflows/ci.yml`):

- **Linter regression tests** — deterministic, free, run on every push:

  ```bash
  npm test          # or: bash tests/run-linter-tests.sh
  ```

  Fixtures live in `tests/fixtures/` (`violations/` with known counts,
  `clean/` with zero, `custom-vocab/` proving `vocabulary/custom.md` is honored).
  Expected counts per check are pinned in `tests/expected.json`.

- **Skill trigger evals** — prompt sets in `evals/*.json`, played through
  `claude -p` (costs API budget, manual workflow `evals.yml`):

  ```bash
  python3 evals/run-evals.py naming-convention --trials 3
  python3 evals/run-evals.py naming-convention --without-skill   # retirement test
  ```

  Each case asserts whether the skill should trigger and which regexes the
  final answer must (or must not) match. Run the `--without-skill` retirement
  test quarterly: if the bare model passes, the skill section is absorbed —
  slim it down.

### Adding a Skill

1. Create a directory under `skills/<name>/`
2. Add a `SKILL.md` with frontmatter (`name`, `description`, `metadata`)
3. Add `references/` for detailed topic (optional)
4. Register the skill name in `meta.ts` under `manual`

## License

MIT
