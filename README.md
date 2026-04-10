# Skills

A curated collection of [Agent Skills](https://agentskills.io/home) for Claude Code and other AI coding agents.

## Installation

```bash
pnpx skills add <owner>/<repo> --skill='*'
```

Or install all skills globally:

```bash
pnpx skills add <owner>/<repo> --skill='*' -g
```

Learn more at [vercel-labs/skills](https://github.com/vercel-labs/skills).

## Skills

| Skill | Description |
|-------|-------------|
| [naming-convention](skills/naming-convention) | Structured naming convention system — syntax, semantics, and grammar rules for variables, functions, classes, files, and more |

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter that tells the agent **when** and **how** to activate it. Skills can include reference files for deeper context.

### Using a Skill

Skills are activated on-demand by the agent based on the `description` field. For example, `naming-convention` activates whenever you discuss naming, conventions, or code readability.

### Adding a Skill

1. Create a directory under `skills/<name>/`
2. Add a `SKILL.md` with frontmatter (`name`, `description`, `metadata`)
3. Add `references/` for detailed topic (optional)
4. Register the skill name in `meta.ts` under `manual`

## License

MIT
