---
name: pocketbase-go
description: Deterministic workflow for PocketBase used as a Go framework (pocketbase.New, hooks, routes, migrations, RunInTransaction), standalone binary supported, gated by scripts instead of self-report. One CLI (pbg) detects the real PocketBase version and module path (ganigeorgiev.com since v0.41, github.com frozen at v0.40.6), lints touched Go code with 12 tested PocketBase analyzers plus staticcheck and gofmt, blocks only NEW findings against a git baseline, then boots an ephemeral PocketBase built from the project to validate API rules, run a declarative access matrix (anon/owner/other, spoofing and ownership probes) and check that migrations are reversible. Use whenever a task creates or edits Go code that imports pocketbase, a PocketBase migration, API rules, hooks, custom routes, cron jobs or mailers, or when the user mentions PocketBase, pb_data, pb_migrations, OnRecordCreate, OnServe, e.Next, txApp, collection rules or access control. Bugs still go through fix-root.
---

# pocketbase-go

Every check a script can decide is decided by `pbg`, never by you saying it is
done. `pbg` writes `.pocketbase-go/state.json` itself; you never edit it.

```bash
PBG="node <skill-dir>/scripts/pbg.mjs"   # <skill-dir> = folder of this SKILL.md
```

Exit codes decide: **0** pass · **1** fail or unverified · **2** usage/environment · **3** only pre-existing suite failures.

## Workflow (in this order, no step skipped)

1. **Environment** — `$PBG doctor` (exit 2 → install the missing sibling skill or Go), then `$PBG env`. It reads the version from `go.mod` (framework) or `./pocketbase` / `.pocketbase-version` (standalone). Never assume a version or a module path: v0.41 moved the module to `ganigeorgiev.com/pocketbase/pocketbase` and v0.42 needs Go 1.27.
2. **Scope** — `$PBG start "<glob>" … --kind bug|feature|migration|refactor`. Only findings the change ADDS block; existing ones are listed, never hidden.
3. **Route** — `$PBG route <files you will touch>`. Read exactly the references it prints; its checklist goes into the report.
4. **Bug?** Follow the **fix-root** skill. For an access bug the failing test is a row of `pb-access.json` (`$PBG access` red → fix the rule → green). New logic (`--kind feature`): failing test first, recorded with
   `$PBG step test-first -- bash <fix-root-dir>/scripts/verify-test-first.sh "go test ./..." -- <files…>`.
5. **Write the code.** Schema changes go through migrations (each with a real `down`). Every collection with non-null API rules is specified in `pb-access.json` (see [references/schema.md](references/schema.md)); `$PBG access --init` writes a skeleton whose `"?"` you replace with the intended statuses — never with what the code currently returns.
6. **Verify** — `$PBG verify <every touched .go file>`. Fix every `GATE` line. After 3 failing passes `pbg` says STOP: ask the user, then `$PBG start --resume`.
7. **Suite** — `$PBG step suite -- bash <fix-root-dir>/scripts/verify-suite.sh "go test ./..." -- <files…>`.
8. **Finish** — `$PBG finish`: scope, every changed `.go` verified on its current content, build, pbcheck + staticcheck on the whole project (new findings), gofmt, no new suppression (`//nolint`, `//lint:ignore`, `#nosec`) or linter-config change without a validated waiver, naming-convention, then an ephemeral PocketBase built from the project: schema rules (new findings), the full access matrix and its coverage, `migrate up → down → up` identical, unchanged expectations in `pb-access.json` unless waived. It writes `.pocketbase-go/report.md`; give the user its result.

A finding you believe is wrong: propose `$PBG waive <rule> <target> <reason>` — written `validé: non`; only the user turns it into `oui`. Changing an existing expectation of `pb-access.json` is a spec change: it needs an `access-spec` waiver from the user.

`$PBG schema`, `$PBG access`, `$PBG migrate-check` run single gates on demand; `$PBG legacy-report` lists the whole debt (code, schema, access gaps, module path).

## References — read what `pbg route` prints

| Tag | File | Contents |
|---|---|---|
| go, hooks, test | [references/framework.md](references/framework.md) | Module/toolchain, `e.App` vs captured app, transactions, errors, settings, mail, files, cron; hook chain and order, routes, auth; tests |
| migrations, access | [references/schema.md](references/schema.md) | Go migrations and the reversibility gate; API rules, measured deny statuses, the `pb-access.json` format |
| — | [references/rules.md](references/rules.md) | Generated catalog of every gate and review check |

## Optional Claude Code hooks

The workflow above is the portable path (pi and Claude Code). In Claude Code, two
hooks can run the same commands while a task is open: `PostToolUse` on
`Edit|Write` runs `pbg verify` on the edited file, `Stop` runs `pbg finish`
(blocks the end of the turn once). Add to `.claude/settings.json` (project) or
`~/.claude/settings.json` (account):

```json
{ "hooks": {
  "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/pbg.mjs hook post-tool-use" }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/pbg.mjs hook stop" }] }]
} }
```

## Code graph (codebase-memory)

Optional and never required by `pbg`. Tools are `mcp__codebase-memory-mcp__<tool>`
(Claude Code) or `cbm_<tool>` (pi, where graph tools activate lazily: call
`cbm_search_tools` first). Call `check_index_coverage` on every file you rely
on; if the index is incomplete, fall back to grep and say so.

- **Which app instance is live** (`appscope` findings): `trace_path` from the hook or route handler to the code it calls, to find helpers that receive a captured `app` instead of `e.App`/`txApp`.
- **Before changing a hook, a collection or a rule**: `search_graph` for the collection name / handler, then `trace_path` to its callers.

## Scope limits

- JSVM hooks (`pb_hooks/*.pb.js`) are not covered: `pbg verify` refuses them (exit 2) and `finish` blocks a change there without a `jsvm` waiver, rather than reporting a false green.
- Requires the sibling skills `strict-core`, `fix-root` and `naming-convention`.
