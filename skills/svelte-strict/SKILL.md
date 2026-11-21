---
name: svelte-strict
description: Deterministic workflow for writing, fixing, migrating or reviewing Svelte 5 (runes), SvelteKit and shadcn-svelte code, gated by scripts instead of self-report. A single CLI (svs) detects the real versions, scopes the task, lints every touched file with the project's own compiler plus eslint-plugin-svelte plus 44 tested svelte-strict rules (runes, state, SSR leaks, SvelteKit load/forms/hooks, shadcn-svelte composition), blocks only NEW findings against a git baseline, forbids silent suppressions and config loosening, and generates the report. Use whenever a task creates or edits a .svelte file, a .svelte.ts/.svelte.js module, a SvelteKit route/hook/remote file, or shadcn-svelte UI; when migrating Svelte 4 / legacy syntax (export let, $:, on:, slots, stores) to runes; or when the user mentions Svelte, SvelteKit, runes, $state, $derived, $effect, $props, load functions, form actions, or shadcn-svelte. Complements the official svelte and shadcn-svelte skills; bugs still go through fix-root.
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
| svelte | [references/state-decision.md](references/state-decision.md) | Which primitive for which need: `$state`, `$state.raw`, `$derived`, classes, `createContext`, stores |
| legacy | [references/migration-runes.md](references/migration-runes.md) | Svelte 4 → runes, item by item, with the traps |
| kit | [references/sveltekit.md](references/sveltekit.md) | load, forms, remote functions, hooks, SSR state, env, Kit 2 vs 3 |
| shadcn | [references/shadcn.md](references/shadcn.md) | shadcn-svelte workflow through `svs shadcn`, component choice |
| test | [references/testing.md](references/testing.md) | Testing runes and components without sleeps |
| — | [references/rules.md](references/rules.md) | Generated catalog: every rule, class, version gate, fix |
| — | [references/hooks.md](references/hooks.md) | Optional Claude Code hooks (never the only path) |

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

- Not a replacement for fix-root (bugs) or naming-convention (names): both are required sibling skills, called by `svs finish`.
- `docs`: `$SVS docs sync` snapshots the official Svelte/Kit docs at the exact installed tags into `.svelte-strict/docs/` for offline, version-exact reading.
- Rules that no script can decide are in the review checklist, never presented as verified.
