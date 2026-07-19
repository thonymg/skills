#!/usr/bin/env bash
# run-linter-tests.sh — Tests de non-régression du linter naming-convention.
#
# Exécute chaque check sur les fixtures et compare les compteurs (errors/warnings)
# à tests/expected.json. Chaque check doit émettre une ligne machine-parsable :
#   RESULT:<check>:errors=<n>:warnings=<m>
# Un check qui crashe ou n'émet pas de ligne RESULT = FAIL.
#
# Usage: tests/run-linter-tests.sh
# Exit : 0 si tout correspond, 1 sinon.

set -uo pipefail  # pas de -e : un check qui crashe doit produire un FAIL, pas un abort

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINTER_DIR="$TESTS_DIR/../skills/naming-convention/linter"
EXPECTED_FILE="$TESTS_DIR/expected.json"

CHECKS=(casing-files prefixes forbidden class-suffixes standalone-suffixes)
FIXTURES=(violations clean custom-vocab)

PASS=0
FAIL=0

# Aplatis expected.json en lignes "fixture check errors warnings"
EXPECTED=$(python3 - "$EXPECTED_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for fixture, checks in data.items():
    for check, counts in checks.items():
        print(fixture, check, counts["errors"], counts["warnings"])
PY
)

report() {
  local status="$1" fixture="$2" check="$3" detail="$4"
  if [[ "$status" == "PASS" ]]; then
    printf "  ✅ %-13s %-20s %s\n" "$fixture" "$check" "$detail"
    PASS=$((PASS + 1))
  else
    printf "  ❌ %-13s %-20s %s\n" "$fixture" "$check" "$detail"
    FAIL=$((FAIL + 1))
  fi
}

echo "── Tests linter : checks individuels ──────────────────────"
while read -r fixture check want_err want_warn; do
  [[ -z "$fixture" ]] && continue
  target="$TESTS_DIR/fixtures/$fixture"
  script="$LINTER_DIR/checks/${check}.sh"

  if [[ ! -f "$script" ]]; then
    report FAIL "$fixture" "$check" "script introuvable"
    continue
  fi

  output=$(bash "$script" "$target" 2>&1)
  rc=$?

  result_line=$(echo "$output" | grep -E "^RESULT:${check}:" | tail -1)
  if [[ -z "$result_line" ]]; then
    report FAIL "$fixture" "$check" "pas de ligne RESULT (crash ? rc=$rc)"
    continue
  fi

  got_err=$(echo "$result_line" | sed -E 's/.*errors=([0-9]+).*/\1/')
  got_warn=$(echo "$result_line" | sed -E 's/.*warnings=([0-9]+).*/\1/')

  if [[ "$got_err" == "$want_err" && "$got_warn" == "$want_warn" ]]; then
    report PASS "$fixture" "$check" "errors=$got_err warnings=$got_warn"
  else
    report FAIL "$fixture" "$check" "attendu errors=$want_err warnings=$want_warn, obtenu errors=$got_err warnings=$got_warn"
    echo "$output" | grep -E "^(❌|⚠️)" | sed 's/^/       /'
  fi
done <<< "$EXPECTED"

echo ""
echo "── Tests lint.sh : exit codes ─────────────────────────────"
bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/violations" --no-color >/dev/null 2>&1
rc=$?
if [[ $rc -eq 1 ]]; then report PASS "violations" "lint.sh" "exit=1"; else report FAIL "violations" "lint.sh" "attendu exit=1, obtenu exit=$rc"; fi

bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/clean" --no-color >/dev/null 2>&1
rc=$?
if [[ $rc -eq 0 ]]; then report PASS "clean" "lint.sh" "exit=0"; else report FAIL "clean" "lint.sh" "attendu exit=0, obtenu exit=$rc"; fi

bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/custom-vocab" --no-color >/dev/null 2>&1
rc=$?
if [[ $rc -eq 0 ]]; then report PASS "custom-vocab" "lint.sh" "exit=0"; else report FAIL "custom-vocab" "lint.sh" "attendu exit=0, obtenu exit=$rc"; fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════════"
exit $((FAIL > 0 ? 1 : 0))
