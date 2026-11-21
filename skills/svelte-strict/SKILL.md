---
name: svelte-strict
description: Use for ANY Svelte or SvelteKit coding task, even a single component — creating, editing, fixing or reviewing a .svelte file, a .svelte.ts/.svelte.js module, a SvelteKit route, load function, form action, hook or remote function, or shadcn-svelte UI; migrating Svelte 4 / legacy syntax (export let, $:, on:, slots, stores) to runes; or whenever the user mentions Svelte, SvelteKit, runes, $state, $derived, $effect, $props or shadcn-svelte. A deterministic workflow gated by scripts instead of self-report — one CLI (svs) detects the real versions, scopes the task, lints every touched file with the project's own compiler, eslint-plugin-svelte and 44 tested svelte-strict rules (runes, state, SSR leaks, SvelteKit, shadcn-svelte composition), blocks only NEW findings against a git baseline, forbids silent suppressions and config loosening, and generates the report. Complements the official svelte and shadcn-svelte skills; bugs still go through fix-root.
---

# svelte-strict

Every check that a script can decide is decided by `svs`, never by you saying
it is done. `svs` writes `.svelte-strict/state.json` itself; you never edit it.

```bash
SVS="node <skill-dir>/scripts/svs.mjs"   # <skill-dir> = folder of this SKILL.md
```

Exit codes decide: **0** pass · **1** fail or unverified · **2** usage/environment · **3** only pre-existing suite failures.

## Workflow (in this order, no step skipped)

1. **Environment** — `$SVS doctor` (exit 2 → `$SVS doctor --install`, or install the missing sibling skill), then `$SVS env`. Never assume a version: rules depend on the detected Svelte / Kit (2 vs 3) / shadcn setup.
2. **Scope** — `$SVS start "<glob>" … --kind bug|feature|migration|ui|refactor`. The baseline is the working tree at this moment: only findings the change ADDS will block; existing ones are listed, never hidden.
3. **Route** — `$SVS route <files you will touch>`. Read exactly the references it prints; its review checklist goes into the report.
4. **Bug?** Follow the **fix-root** skill (regression → bisect, failing test first, root-cause fix). This skill only adds steps 6–8 on top. New logic (`--kind feature`): a failing test first, recorded with
   `$SVS step test-first -- bash <fix-root-dir>/scripts/verify-test-first.sh "<test cmd>" -- <files…>`.
5. **Write the code.** UI from shadcn-svelte: install/update components only through `$SVS shadcn add <name>` (pinned CLI, records what it wrote; `--overwrite` and registry URLs need a validated waiver).
6. **Verify** — `$SVS verify <every touched file>`. Fix every `GATE` line and re-run. After 3 failing passes `svs` says STOP: ask the user (strategy or a waiver), then `$SVS start --resume`. `REVIEW` lines and pre-existing findings do not block.
7. **Suite** — `$SVS step suite -- bash <fix-root-dir>/scripts/verify-suite.sh "<suite cmd>" -- <files…>` (exit 3 = only pre-existing failures).
8. **Finish** — `$SVS finish`. It is the only definition of done: scope respected, every changed file verified on its current content, no new suppression/`any`/config change without a validated waiver, no new `svelte-check` diagnostic (baseline worktree), naming-convention on the changed files, steps run on the current tree, all waivers validated. It writes `.svelte-strict/report.md`; give the user its result, do not rewrite it.

Never edit a protected config (`eslint.config.*`, `tsconfig*`, `svelte.config.*`, `vite.config.*`, `components.json`) or add `svelte-ignore`/`eslint-disable`/`@ts-ignore`/`any` to get green. If a finding is a false positive, propose `$SVS waive <rule> <file> <reason>` — it is written `validé: non`; only the user turns it into `oui`.

## References — read what `svs route` prints

| Tag | File | Contents |
|---|---|---|
| svelte, legacy, test | [references/svelte.md](references/svelte.md) | Which primitive for which need (`$state`, `$derived`, classes, `createContext`, stores); Svelte 4 → runes item by item; testing without sleeps |
| kit | [references/sveltekit.md](references/sveltekit.md) | load, forms, remote functions, hooks, SSR state, env, Kit 2 vs 3 |
| shadcn | [references/shadcn.md](references/shadcn.md) | shadcn-svelte workflow through `svs shadcn`, component choice |
| — | [references/rules.md](references/rules.md) | Generated catalog: every rule, class, version gate, fix |

## Optional Claude Code hooks

The workflow above is the portable path (pi and Claude Code). In Claude Code, two
hooks can run the same commands while a task is open: `PostToolUse` on
`Edit|Write` runs `svs verify` on the edited file, `Stop` runs `svs finish`
(blocks the end of the turn once). Add to `.claude/settings.json` (project) or
`~/.claude/settings.json` (account):

```json
{ "hooks": {
  "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/svs.mjs hook post-tool-use" }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/svs.mjs hook stop" }] }]
} }
```

## Code graph (codebase-memory)

Use it where it answers faster than reading files; `svs` never depends on it.
Tools are exposed as `mcp__codebase-memory-mcp__<tool>` (Claude Code) or
`cbm_<tool>` (pi, where graph tools activate lazily: call `cbm_search_tools`
first). Call `check_index_coverage` on every file you rely on; if the index
misses `.svelte` files or lines, fall back to grep and say so.

- **SSR leak** (`ssr-shared-state`/`ssr-module-state`): `trace_path` from the module that holds the state to its importers, to see which server entry reaches it (`svs` computes the same set with its own import resolver).
- **Before changing a prop, a `load` return, or a shared ui component**: `search_graph` for the symbol, then `trace_path` toward its callers.
- **Legacy migration order**: callers first — migrate leaves before the components that import them.

## Scope limits

- Not a replacement for fix-root (bugs) or naming-convention (names): both are required sibling skills, called by `svs finish`, as is `strict-core` (the shared gate machinery).
- `docs`: `$SVS docs sync` snapshots the official Svelte/Kit docs at the exact installed tags into `.svelte-strict/docs/` for offline, version-exact reading.
- Rules that no script can decide are in the review checklist, never presented as verified.
