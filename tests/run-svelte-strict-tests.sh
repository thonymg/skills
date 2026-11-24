#!/usr/bin/env bash
# run-svelte-strict-tests.sh — Tests of skills/svelte-strict.
#
#   1. RuleTester: every svelte-strict rule, >= 1 good and >= 1 bad case each.
#   2. references/rules.md is exactly what `svs gen-references` generates.
#   3. svs end to end on throwaway git projects: exit codes, the D1 baseline
#      (pre-existing findings never block), scope, the 3-pass limit, hash
#      binding (edit after verify), anti-calibration, waivers, steps on the
#      current tree, svelte-check against the baseline worktree, shadcn guard.
#
# Usage: tests/run-svelte-strict-tests.sh
# Exit : 0 if everything passes, 1 otherwise.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$TESTS_DIR/.." && pwd)"
SKILL="$REPO/skills/svelte-strict"
SVS=(node "$SKILL/scripts/svs.mjs")

if [[ ! -d "$SKILL/tooling/node_modules" ]]; then
  (cd "$SKILL/tooling" && npm ci --no-audit --no-fund >/dev/null 2>&1) || { echo "cannot install skills/svelte-strict/tooling"; exit 1; }
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASS=0
FAIL=0
report() {
  if [[ "$1" == "PASS" ]]; then printf "  ✅ %-44s %s\n" "$2" "$3"; PASS=$((PASS + 1))
  else printf "  ❌ %-44s %s\n" "$2" "$3"; FAIL=$((FAIL + 1)); fi
}
# expect <name> <wanted exit> <got exit> [<output> <regex that must match>]
expect() {
  local name="$1" want="$2" got="$3" out="${4:-}" re="${5:-}"
  if [[ "$got" != "$want" ]]; then report FAIL "$name" "exit $got, wanted $want — $(tail -3 <<<"$out" | tr '\n' ' ')"; return; fi
  if [[ -n "$re" ]] && ! grep -Eq -- "$re" <<<"$out"; then report FAIL "$name" "output lacks /$re/ — $(tail -3 <<<"$out" | tr '\n' ' ')"; return; fi
  report PASS "$name" "exit $got"
}
svs() { local out rc; out=$(cd "$P" && "${SVS[@]}" "$@" 2>&1); rc=$?; OUT="$out"; RC=$rc; }

# A Svelte project with a legacy component committed, svelte linked from the tooling.
make_project() {
  P="$WORK/$1"
  mkdir -p "$P/node_modules" "$P/src/lib"
  ln -s "$SKILL/tooling/node_modules/svelte" "$P/node_modules/svelte"
  printf '{ "name": "p", "private": true, "type": "module" }\n' > "$P/package.json"
  printf 'node_modules\n' > "$P/.gitignore"
  cat > "$P/src/lib/Legacy.svelte" <<'EOF'
<script>
  export let label;
</script>
<button type="button" on:click>{label}</button>
EOF
  (cd "$P" && git init -q -b main && git add -A && git commit -qm init)
}

echo "── RuleTester (tooling/plugin) ─────────────────────────────"
out=$(cd "$SKILL/tooling" && node --test --test-reporter=tap plugin/rules.test.mjs 2>&1); rc=$?
pass=$(grep -Eo '^# pass [0-9]+' <<<"$out" | grep -Eo '[0-9]+'); fail=$(grep -Eo '^# fail [0-9]+' <<<"$out" | grep -Eo '[0-9]+')
if [[ $rc -eq 0 && "${fail:-1}" == 0 ]]; then report PASS "rules: good/bad cases" "$pass tests"; else report FAIL "rules: good/bad cases" "$fail failing"; fi

echo "── generated references ────────────────────────────────────"
P="$SKILL"; svs gen-references --check
expect "references/rules.md up to date" 0 "$RC" "$OUT"

echo "── env / start ─────────────────────────────────────────────"
P="$WORK/nosvelte"; mkdir -p "$P"; printf '{"name":"n"}\n' > "$P/package.json"
svs env;                       expect "env without svelte = exit 1 (no default)" 1 "$RC" "$OUT" "svelte not found"
make_project a
svs start "src/**";            expect "start before env = exit 2" 2 "$RC" "$OUT"
svs env --json;                expect "env detects the installed svelte" 0 "$RC" "$OUT" '"svelte": "5\.'
svs start;                     expect "start without scope = exit 2" 2 "$RC" "$OUT"
svs start "src/lib/**" --kind nope; expect "start with unknown kind = exit 2" 2 "$RC" "$OUT"
svs start "src/lib/**" --kind refactor; expect "start" 0 "$RC" "$OUT" "baseline="

echo "── route ───────────────────────────────────────────────────"
svs route src/lib/Legacy.svelte; first="$OUT"
svs route src/lib/Legacy.svelte
if [[ "$OUT" == "$first" ]] && grep -q "Legacy → runes" <<<"$OUT" && ! grep -q "^read:" <<<"$OUT"; then report PASS "route is deterministic, prints the legacy section" "same output twice"; else report FAIL "route is deterministic, prints the legacy section" "$OUT"; fi
svs route src/lib/Legacy.svelte --full; expect "route --full keeps the old file list" 0 "$RC" "$OUT" "references/svelte.md"

echo "── merged start ────────────────────────────────────────────"
make_project m
svs start "src/lib/**" --kind refactor --files src/lib/Legacy.svelte; expect "start --files = doctor+env+start+route" 0 "$RC" "$OUT" "baseline="
for pat in "^svelte 5" "Legacy → runes"; do grep -q "$pat" <<<"$OUT" && report PASS "merged start prints /$pat/" "" || report FAIL "merged start prints /$pat/" "$OUT"; done
P="$WORK/a"

echo "── verify: D1 baseline, gate, scope, pass limit ────────────"
svs verify src/lib/Legacy.svelte; expect "pre-existing legacy findings do not block" 0 "$RC" "$OUT" "pre-existing"
printf '<script>\n  let n = $state(1);\n  let d = $derived(() => n);\n</script>\n<p>{d}</p>\n' > "$P/src/lib/Counter.svelte"
svs verify src/lib/Counter.svelte; expect "new gate finding blocks" 1 "$RC" "$OUT" "GATE .*derived-with-function"
svs verify src/lib/Counter.svelte
svs verify src/lib/Counter.svelte; expect "3rd failing pass says STOP" 1 "$RC" "$OUT" "STOP"
svs start --resume;             expect "resume resets the pass counter" 0 "$RC" "$OUT" "resume #1"
printf '<script>\n  let count = $state(1);\n  let double = $derived(count * 2);\n</script>\n<p>{double}</p>\n' > "$P/src/lib/Counter.svelte"
svs verify src/lib/Counter.svelte; expect "fixed file passes" 0 "$RC" "$OUT" "verify: PASS"
printf 'export const x = 1;\n' > "$P/src/outside.ts"
svs verify src/outside.ts;       expect "file outside scope = exit 1" 1 "$RC" "$OUT" "outside the task scope"
rm "$P/src/outside.ts"

echo "── finish: steps, hash binding, svelte-check ───────────────"
svs finish;                     expect "finish without suite step fails" 1 "$RC" "$OUT" "suite: never run"
svs step suite -- true;         expect "step records exit" 0 "$RC" "$OUT" "recorded"
svs finish;                     expect "finish passes when every gate is green" 0 "$RC" "$OUT" "finish: PASS"
[[ -f "$P/.svelte-strict/report.md" ]] && grep -q "result: \*\*PASS\*\*" "$P/.svelte-strict/report.md" \
  && report PASS "report.md generated by finish" "PASS" || report FAIL "report.md generated by finish" "missing or wrong"
svs verify src/lib/Counter.svelte; expect "task closed after finish" 2 "$RC" "$OUT" "no open task"

make_project b
svs env >/dev/null; svs start "src/**" --kind refactor
printf '<script>\n  let count = $state(1);\n</script>\n<p>{count}</p>\n' > "$P/src/lib/Counter.svelte"
svs verify src/lib/Counter.svelte
svs step suite -- true
printf '<script>\n  let count = $state(2);\n</script>\n<p>{count}</p>\n' > "$P/src/lib/Counter.svelte"
svs finish
expect "edit after verify is caught" 1 "$RC" "$OUT" "edited after verify"
grep -q "suite: run on an older version" <<<"$OUT" && report PASS "step run on an older tree is caught" "" || report FAIL "step run on an older tree is caught" "$OUT"
svs verify src/lib/Counter.svelte; svs step suite -- true
printf '<script lang="ts">\n  let count: number = "x";\n</script>\n<p>{count}</p>\n' > "$P/src/lib/Typed.svelte"
svs verify src/lib/Typed.svelte
svs finish
expect "new svelte-check error blocks (baseline worktree)" 1 "$RC" "$OUT" "src/lib/Typed.svelte:2 Type"

echo "── anti-calibration and waivers ────────────────────────────"
make_project c
svs env >/dev/null; svs start "src/**" --kind refactor
printf '<script>\n  // eslint-disable-next-line\n  let count = $state(1);\n</script>\n<p>{count}</p>\n' > "$P/src/lib/Counter.svelte"
printf 'export default {};\n' > "$P/svelte.config.js"
svs verify src/lib/Counter.svelte; svs step suite -- true
svs finish
expect "suppression comment blocks" 1 "$RC" "$OUT" "adds a lint/type suppression"
grep -q "svelte.config.js: protected config changed" <<<"$OUT" && report PASS "protected config change blocks" "" || report FAIL "protected config change blocks" "$OUT"
grep -q "svelte.config.js changed outside the scope" <<<"$OUT" && report PASS "change outside scope blocks" "" || report FAIL "change outside scope blocks" "$OUT"
svs waive no-such '*' reason;    expect "waive * on a normal rule = exit 2" 2 "$RC" "$OUT"
svs waive suppression src/lib/Counter.svelte "generated code"; expect "waive writes an unvalidated line" 0 "$RC" "$OUT" "validated: non"
svs finish
grep -q "suppression src/lib/Counter.svelte: not validated" <<<"$OUT" && report PASS "unvalidated waiver blocks" "" || report FAIL "unvalidated waiver blocks" "$OUT"
sed -i.bak 's/| non |$/| oui |/' "$P/.svelte-strict/waivers.md"
svs finish
if grep -q "adds a lint/type suppression" <<<"$OUT"; then report FAIL "validated waiver lifts its finding" "$OUT"; else report PASS "validated waiver lifts its finding" ""; fi

echo "── shadcn guard, hooks, docs ───────────────────────────────"
svs shadcn frobnicate;          expect "unknown shadcn command = exit 2" 2 "$RC" "$OUT" "pinned CLI offers"
svs shadcn add button --overwrite; expect "--overwrite without waiver = exit 1" 1 "$RC" "$OUT" "shadcn-overwrite"
svs shadcn add https://evil.example/r.json; expect "registry URL without waiver = exit 1" 1 "$RC" "$OUT" "shadcn-registry-url"
make_project d
out=$(cd "$P" && echo '{"tool_input":{"file_path":"src/lib/Legacy.svelte"}}' | "${SVS[@]}" hook post-tool-use 2>&1); rc=$?
expect "hook is silent without an open task" 0 "$rc" "$out"
svs env >/dev/null
svs docs sync --dry-run;        expect "docs sync pins the installed tag" 0 "$RC" "$OUT" "tags/svelte%405\."

echo "── legacy report ───────────────────────────────────────────"
svs legacy-report;              expect "legacy-report lists the legacy file" 0 "$RC" "$OUT" "src/lib/Legacy.svelte +no-restricted-syntax"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════════"
exit $((FAIL > 0 ? 1 : 0))
