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

## naming-convention — What it knows how to do

- Apply a 3-layer convention: Syntax (casing), Semantics (noun/verb roles), Grammar (closed prefix+suffix vocabulary)
- Propose compliant names and refactors in any language (JS/TS, Python, Java/Kotlin, SQL, routes/CSS…)
- Detect and fix common anti-patterns:
  - Contextual redundancy: `user.getUserName()` → `user.getName()`
  - Forbidden vague words: `data`, `info`, `temp`, `x`
  - Mixed responsibilities: `processAndSaveOrder()` → split into 2 actions
  - Infra suffix alone: `Manager/Handler/Helper` must be paired with an entity
- Provide ready-to-copy examples by domain and language-specific rules via reference files

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter that tells the agent **when** and **how** to activate it. Skills can include reference files for deeper context.

### Using a Skill

Skills are activated on-demand by the agent based on the `description` field. For example, `naming-convention` activates whenever you discuss naming, conventions, or code readability.

In practice, you can trigger it by asking things like:

- “Give me a name for a function that …”
- “Does this name follow the convention?”
- “Rename these variables/classes for consistency”
- “Which names should I use for these SQL columns?”

### Adding a Skill

1. Create a directory under `skills/<name>/`
2. Add a `SKILL.md` with frontmatter (`name`, `description`, `metadata`)
3. Add `references/` for detailed topic (optional)
4. Register the skill name in `meta.ts` under `manual`

## License

MIT
