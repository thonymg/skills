#!/usr/bin/env bash
# run-pocketbase-go-tests.sh — Tests of skills/pocketbase-go/ (and of the
# skills/strict-core machinery it shares with svelte-strict).
#
#   1. pbcheck analyzers: analysistest, good and bad code for each of them.
#   2. references/rules.md is exactly what `pbg gen-references` generates.
#   3. pbg end to end on throwaway git copies of a real PocketBase v0.42.3 app
#      (tests/fixtures/pocketbase-go/app): exit codes, the git baseline, every
#      code gate, the ephemeral instance (schema rules, access matrix with its
#      coverage and probes, migration reversibility), anti-calibration,
#      access-spec changes, and a full `finish` that passes.
#
# Needs Go (the toolchain of the fixture, 1.27, is fetched by GOTOOLCHAIN=auto).
# Usage: tests/run-pocketbase-go-tests.sh
# Exit : 0 if everything passes, 1 otherwise.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$TESTS_DIR/.." && pwd)"
SKILL="$REPO/skills/pocketbase-go"
FIXTURE="$TESTS_DIR/fixtures/pocketbase-go/app"
PBG=(node "$SKILL/scripts/pbg.mjs")

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export GOTOOLCHAIN=auto

PASS=0
FAIL=0
report() {
  if [[ "$1" == "PASS" ]]; then printf "  ✅ %-48s %s\n" "$2" "$3"; PASS=$((PASS + 1))
  else printf "  ❌ %-48s %s\n" "$2" "$3"; FAIL=$((FAIL + 1)); fi
}
# expect <name> <wanted exit> <got exit> <output> [<regex that must match>]
expect() {
  local name="$1" want="$2" got="$3" out="${4:-}" re="${5:-}"
  if [[ "$got" != "$want" ]]; then report FAIL "$name" "exit $got, wanted $want — $(tail -4 <<<"$out" | tr '\n' ' ')"; return; fi
  if [[ -n "$re" ]] && ! grep -Eq -- "$re" <<<"$out"; then report FAIL "$name" "output lacks /$re/ — $(tail -4 <<<"$out" | tr '\n' ' ')"; return; fi
  report PASS "$name" "exit $got"
}
has() { if grep -Eq -- "$3" <<<"$2"; then report PASS "$1" ""; else report FAIL "$1" "$(tail -6 <<<"$2" | tr '\n' ' ')"; fi; }
pbg() { local out rc; out=$(cd "$P" && "${PBG[@]}" "$@" 2>&1); rc=$?; OUT="$out"; RC=$rc; }
# A committed copy of the fixture app, env detected, task started.
project() {
  P="$WORK/$1"
  cp -R "$FIXTURE" "$P"
  (cd "$P" && git init -q -b main && git add -A && git commit -qm init)
  pbg env >/dev/null
  pbg start "**" --kind "${2:-refactor}" >/dev/null
}

echo "── pbcheck analyzers (analysistest) ────────────────────────"
out=$(cd "$SKILL/tooling/pbcheck" && go test -v ./checks 2>&1); rc=$?
n=$(grep -c -- '--- PASS: TestAnalyzers/' <<<"$out")
if [[ $rc -eq 0 && $n -ge 12 ]]; then report PASS "analyzers: good/bad cases" "$n analyzers"; else report FAIL "analyzers: good/bad cases" "$(grep -E 'FAIL|no diagnostic|unexpected' <<<"$out" | head -3 | tr '\n' ' ')"; fi

echo "── generated references ────────────────────────────────────"
P="$SKILL"; pbg gen-references --check
expect "references/rules.md up to date" 0 "$RC" "$OUT"

echo "── env / start / route ─────────────────────────────────────"
P="$WORK/none"; mkdir -p "$P"; printf 'module none\n\ngo 1.26\n' > "$P/go.mod"
pbg env;                         expect "env without PocketBase = exit 1 (no default)" 1 "$RC" "$OUT" "no PocketBase found"
P="$WORK/a"; cp -R "$FIXTURE" "$P"; (cd "$P" && git init -q -b main && git add -A && git commit -qm init)
pbg start "**";                  expect "start before env = exit 2" 2 "$RC" "$OUT"
pbg env --json;                  expect "env reads go.mod (framework, new host, version)" 0 "$RC" "$OUT" '"modulePath": "ganigeorgiev.com/pocketbase/pocketbase"'
pbg start "**" --kind refactor;  expect "start" 0 "$RC" "$OUT" "baseline="
P="$WORK/m"; cp -R "$FIXTURE" "$P"; (cd "$P" && git init -q -b main && git add -A && git commit -qm init)
pbg start "**" --kind refactor --files main.go; expect "start --files = doctor+env+start+route" 0 "$RC" "$OUT" "baseline="
grep -q "^pocketbase 0\." <<<"$OUT" && report PASS "merged start prints the env line" "" || report FAIL "merged start prints the env line" "$OUT"
P="$WORK/a"
pbg route main.go --full;        expect "route --full keeps the old file list" 0 "$RC" "$OUT" "references/framework.md"
printf 'package main\n\nfunc plain() {}\n' > "$P/plain.go"; pbg route plain.go; rm "$P/plain.go"; if grep -q "Which app to use" <<<"$OUT" && ! grep -q "The hook chain" <<<"$OUT"; then report PASS "a plain .go file gets only the base sections" ""; else report FAIL "a plain .go file gets only the base sections" "$OUT"; fi
pbg route main.go migrations/1700000000_create_posts.go; first="$OUT"
pbg route main.go migrations/1700000000_create_posts.go
if [[ "$OUT" == "$first" ]] && grep -q "Migrations (Go)" <<<"$OUT" && grep -q "Hooks and routing" <<<"$OUT" && ! grep -q "^read:" <<<"$OUT"; then report PASS "route is deterministic, prints hooks/migrations sections" ""; else report FAIL "route is deterministic, prints hooks/migrations sections" "$OUT"; fi

echo "── verify: code gates, baseline, JSVM refusal ──────────────"
pbg verify main.go;              expect "untouched app passes" 0 "$RC" "$OUT" "verify: PASS"
cat > "$P/hooks.go" <<'EOF'
package main

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func bindPostHooks(app core.App) {
	app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
		app.Save(e.Record)
		return nil
	})
}
EOF
pbg verify hooks.go;             expect "hook without e.Next() blocks" 1 "$RC" "$OUT" "pbcheck/hooknext"
has "captured app inside a handler is reported" "$OUT" "pbcheck/appscope"
has "discarded Save error is reported" "$OUT" "pbcheck/errignored"
cat > "$P/hooks.go" <<'EOF'
package main

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func bindPostHooks(app core.App) {
	app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return e.App.Save(e.Record)
	})
}
EOF
pbg verify hooks.go;             expect "fixed hook passes (staticcheck U1000 aside)" 1 "$RC" "$OUT" "staticcheck/U1000"
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); open(p,"w").write(s.replace("app := pocketbase.New()\n", "app := pocketbase.New()\n\tbindPostHooks(app)\n", 1))' "$P/main.go"
pbg verify hooks.go main.go;     expect "once wired, hooks.go and main.go pass" 0 "$RC" "$OUT" "verify: PASS"
mkdir -p "$P/pb_hooks" && printf 'routerAdd("GET", "/x", (e) => e.json(200, {}))\n' > "$P/pb_hooks/x.pb.js"
pbg verify pb_hooks/x.pb.js;     expect "JSVM hook refused (no false green)" 2 "$RC" "$OUT" "not covered"
rm -rf "$P/pb_hooks"

echo "── ephemeral PocketBase: access, schema, migrations ────────"
pbg access;                      expect "access matrix passes (real instance)" 0 "$RC" "$OUT" "access: PASS \([0-9]+ case"
pbg migrate-check;               expect "migrations are reversible" 0 "$RC" "$OUT" "identical schema"
cat > "$P/migrations/1700000100_public_delete.go" <<'EOF'
package migrations

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	m "ganigeorgiev.com/pocketbase/pocketbase/migrations"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		posts, err := app.FindCollectionByNameOrId("posts")
		if err != nil {
			return err
		}
		posts.DeleteRule = types.Pointer("")
		return app.Save(posts)
	}, nil)
}
EOF
pbg verify migrations/1700000100_public_delete.go; expect "migration without down blocks" 1 "$RC" "$OUT" "pbcheck/migratedown"
# A down that exists but undoes nothing: invisible to the analyzer, caught by the baseline comparison.
sed -i.bak 's/^\t}, nil)$/\t}, func(app core.App) error { return nil })/' "$P/migrations/1700000100_public_delete.go" && rm "$P/migrations/1700000100_public_delete.go.bak"
pbg verify migrations/1700000100_public_delete.go; expect "no-op down passes the analyzer" 0 "$RC" "$OUT" "verify: PASS"
pbg schema;                      expect "public delete rule is a gate" 1 "$RC" "$OUT" "rules-public-write .*posts.deleteRule"
pbg access;                      expect "access matrix catches the public delete" 1 "$RC" "$OUT" "posts.delete as anon: expected 404, got 204"
pbg migrate-check;               expect "no-op down caught against the baseline schema" 1 "$RC" "$OUT" "differs from the baseline in: posts"
rm "$P/migrations/1700000100_public_delete.go"
printf '\n// edited after it shipped\n' >> "$P/migrations/1700000000_create_posts.go"
pbg migrate-check;               expect "editing a shipped migration blocks" 1 "$RC" "$OUT" "already-shipped migration was modified"
git -C "$P" checkout -q -- migrations/1700000000_create_posts.go
cp "$P/pb-access.json" "$WORK/access.bak"
python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); del d["collections"]["users"]; del d["collections"]["posts"]["probes"]; json.dump(d,open(p,"w"))' "$P/pb-access.json"
pbg access;                      expect "coverage gaps block (D4)" 1 "$RC" "$OUT" "users: has non-null API rules but no entry"
has "ownership probes are required" "$OUT" "probes.spoofCreate"
cp "$WORK/access.bak" "$P/pb-access.json"
sed -i.bak 's/"view": { "anon": 404, "owner": 200, "other": 404 }/"view": { "anon": "?", "owner": 200, "other": 404 }/' "$P/pb-access.json" && rm "$P/pb-access.json.bak"
pbg access;                      expect "\"?\" placeholders block" 1 "$RC" "$OUT" "placeholders"
cp "$WORK/access.bak" "$P/pb-access.json"

echo "── finish: full pass, then each blocking gate ──────────────"
project b refactor
printf '\n// Run with: go run . serve\n' >> "$P/main.go"
pbg verify main.go >/dev/null
pbg finish;                      expect "finish without suite step fails" 1 "$RC" "$OUT" "suite: never run"
pbg step suite -- go test ./...; expect "step records go test" 0 "$RC" "$OUT" "recorded"
pbg finish;                      expect "finish passes when every gate is green" 0 "$RC" "$OUT" "finish: PASS"
has "finish ran the access matrix" "$OUT" "case\(s\) pass"
has "finish ran migrate-check" "$OUT" "identical schema"
grep -q 'result: \*\*PASS\*\*' "$P/.pocketbase-go/report.md" && report PASS "report.md generated by finish" "" || report FAIL "report.md generated by finish" ""

project c refactor
printf '\n//nolint:all\nvar unusedThing = 1\n' >> "$P/main.go"
printf 'checks = ["-all"]\n' > "$P/staticcheck.conf"
sed -i.bak 's/"delete": { "anon": 404, "owner": 204, "other": 404 }/"delete": { "anon": 404, "owner": 204, "other": 204 }/' "$P/pb-access.json" && rm "$P/pb-access.json.bak"
pbg verify main.go >/dev/null
pbg step suite -- go test ./... >/dev/null
pbg finish;                      expect "finish fails" 1 "$RC" "$OUT" "finish: FAIL"
has "suppression comment blocks" "$OUT" "main.go: adds a lint/type suppression"
has "linter config change blocks" "$OUT" "staticcheck.conf: protected config changed"
has "changed expectation needs access-spec waiver" "$OUT" 'expectations of existing collection "posts" changed'
has "the changed expectation also fails the run" "$OUT" "posts.delete as other: expected 204, got 404"
pbg waive access-spec posts "intentional";  expect "waive writes an unvalidated line" 0 "$RC" "$OUT" "validated: non"
pbg finish
has "unvalidated waiver blocks" "$OUT" "access-spec posts: not validated by the user"

echo "── hook ────────────────────────────────────────────────────"
P="$WORK/a"; pbg finish >/dev/null; P="$WORK/d"; cp -R "$FIXTURE" "$P"
out=$(cd "$P" && echo '{"tool_input":{"file_path":"main.go"}}' | "${PBG[@]}" hook post-tool-use 2>&1); rc=$?
expect "hook is silent without an open task" 0 "$rc" "$out"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════════"
exit $((FAIL > 0 ? 1 : 0))
