---
name: strict-core
description: Shared library of the svelte-strict and pocketbase-go skills (state file, git baseline, scope, waivers, recorded steps, finish checks, report). Not a workflow; never invoke it directly — install it next to those skills.
---

# strict-core

`lib/core.mjs` holds the gate machinery shared by `svs` (svelte-strict) and
`pbg` (pocketbase-go), so that both behave identically:

- `.<tool>/state.json` written only by the CLI; task scope as globs; git baseline (`git stash create` or `HEAD`) so only NEW findings block.
- Waivers in `.<tool>/waivers.md`, written `non` by the CLI, validated `oui` only by the user.
- `step <name> -- <cmd>` records an exit code bound to a hash of the changed tree.
- Common finish checks: scope, every changed file verified on its current content, anti-calibration (suppressions, protected configs), naming-convention on changed files, steps on the current tree, waivers validated; then the report.
- The 3-failing-passes limit of `verify`, optional Claude Code hooks.

Tested through `tests/run-svelte-strict-tests.sh` and `tests/run-pocketbase-go-tests.sh`.
