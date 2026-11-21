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

# Corpus réaliste : vrai code React/TS/Python conforme à la convention.
# DOIT sortir 0 erreur — c'est le test anti-faux-positifs. Sans lui, rien
# n'empêche le bruit de revenir à la prochaine modification de regex.
bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/realistic" --no-color >/dev/null 2>&1
rc=$?
if [[ $rc -eq 0 ]]; then report PASS "realistic" "lint.sh" "exit=0"; else report FAIL "realistic" "lint.sh" "attendu exit=0, obtenu exit=$rc"; fi

# Noms imposés par les frameworks (Rails, Python, Next, Vue) et exemples ✅ du
# SKILL.md : 0 erreur, sinon le linter pousse l'agent à casser du code ou
# contredit la doc.
for fx in framework skill-examples; do
  bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/$fx" --no-color >/dev/null 2>&1
  rc=$?
  if [[ $rc -eq 0 ]]; then report PASS "$fx" "lint.sh" "exit=0"; else report FAIL "$fx" "lint.sh" "attendu exit=0, obtenu exit=$rc"; fi
done

echo ""
echo "── Tests linter : liste exacte des findings ────────────────"
# Les compteurs ne voient pas un faux positif qui en remplace un autre ; la
# liste règle|fichier|ligne|nom, si.
for expected_list in "$TESTS_DIR"/expected-findings/*.txt; do
  fx="$(basename "$expected_list" .txt)"
  got=$(bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/$fx" --json 2>/dev/null | python3 -c '
import json, os, sys
root = sys.argv[1]
d = json.load(sys.stdin)
rows = ["|".join([f["rule"], os.path.relpath(f["file"], root), str(f["line"]), f["name"]]) for f in d["findings"]]
print("\n".join(sorted(rows)))' "$TESTS_DIR/fixtures/$fx")
  if diff <(echo "$got" | sed '/^$/d') <(sed '/^$/d' "$expected_list") >/dev/null; then
    report PASS "$fx" "findings" "$(grep -c . "$expected_list") attendus, identiques"
  else
    report FAIL "$fx" "findings" "différence avec expected-findings/$fx.txt"
    diff <(echo "$got" | sed '/^$/d') <(sed '/^$/d' "$expected_list") | sed 's/^/       /'
  fi
done

echo ""
echo "── Tests lint.sh : usage invalide = exit 2, jamais un faux ✅ ──"
bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/does-not-exist" >/dev/null 2>&1; rc=$?
if [[ $rc -eq 2 ]]; then report PASS "usage" "cible introuvable" "exit=2"; else report FAIL "usage" "cible introuvable" "attendu exit=2, obtenu exit=$rc"; fi
bash "$LINTER_DIR/lint.sh" "$TESTS_DIR/fixtures/violations" --only prefix >/dev/null 2>&1; rc=$?
if [[ $rc -eq 2 ]]; then report PASS "usage" "--only inconnu" "exit=2"; else report FAIL "usage" "--only inconnu" "attendu exit=2, obtenu exit=$rc"; fi

echo ""
echo "── Tests lint.sh --since : seulement ce que la modif introduit ──"
SINCE_DIR="$(mktemp -d)"
(
  cd "$SINCE_DIR" || exit 1
  export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
  git init -q && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  printf 'export function orderTotal() {}\nexport const data = 1;\n' > order-service.ts
  git add . && git -c user.name=t -c user.email=t@t commit -qm legacy
  printf 'export function orderTotal() {}\nexport const data = 1;\nexport function grabUser() {}\n' > order-service.ts
)
got=$(cd "$SINCE_DIR" && bash "$LINTER_DIR/lint.sh" order-service.ts --since HEAD --json 2>/dev/null \
      | python3 -c 'import json,sys; print(" ".join(f["name"] for f in json.load(sys.stdin)["findings"] if f["severity"]=="error"))')
if [[ "$got" == "grabUser" ]]; then report PASS "--since" "fichier modifié" "1 nouvelle erreur sur 3 (grabUser)"
else report FAIL "--since" "fichier modifié" "attendu 'grabUser', obtenu '$got'"; fi
got=$(cd "$SINCE_DIR" && printf 'export const value2 = 1;\n' > new-file.ts && bash "$LINTER_DIR/lint.sh" . --since HEAD --json 2>/dev/null \
      | python3 -c 'import json,sys; print(" ".join(sorted(f["name"] for f in json.load(sys.stdin)["findings"] if f["severity"]=="error")))')
if [[ "$got" == "grabUser value2" ]]; then report PASS "--since" "dossier + fichier non suivi" "grabUser value2"
else report FAIL "--since" "dossier + fichier non suivi" "attendu 'grabUser value2', obtenu '$got'"; fi
rm -rf "$SINCE_DIR"

echo ""
echo "── Tests .svelte : script + props multi-lignes + snippets, jamais un faux ✅ ──"
SV_DIR="$(mktemp -d)"
printf '<h1>x</h1>\n<script lang="ts">\n  let {\n    title,\n    tmpData2,\n    class: className,\n  }: Props = $props();\n  let fetchUserData = 1;\n</script>\n{#snippet rowData(item)}{/snippet}\n' > "$SV_DIR/user-card.svelte"
printf '<script>let a = 1;</script>\n' > "$SV_DIR/bad_name.svelte"
got=$(perl "$LINTER_DIR/nc-lint.pl" "$SV_DIR" --json | python3 -c 'import json,sys; print(" ".join(sorted("%s@%s:%s" % (f["name"], f["line"], f["rule"]) for f in json.load(sys.stdin)["findings"] if f["severity"] == "error")))')
want="bad_name@0:CASING fetchUserData@8:VAGUE rowData@10:VAGUE tmpData2@5:NUMBERED tmpData2@5:VAGUE"
if [[ "$got" == "$want" ]]; then report PASS ".svelte" "findings" "$want"
else report FAIL ".svelte" "findings" "attendu '$want', obtenu '$got'"; fi
rm -rf "$SV_DIR"

echo ""
echo "── Tests .go : niveau package, blocs var/const/type, noms imposés par Go exemptés ──"
GO_DIR="$(mktemp -d)"
printf 'package users\n\nfunc GetUser() error { return nil }\n\nfunc doStuff() {}\n\nfunc (s *Store) fetchData() string { return "{" }\n\nfunc init() {}\n\nfunc TestGetUser(t *T) {}\n\nfunc (e *userError) Error() string { return "" }\n\nconst MAX_RETRIES = 3\n\nvar (\n\ttmpValue2 = 1\n)\n\nfunc listUsers() {\n\tlocal := 1\n\t_ = local\n}\n\nfunc NewStore() *Store { return nil }\n\nfunc MustParseUser(s string) *User { return nil }\n' > "$GO_DIR/user_service.go"
printf 'package users\n' > "$GO_DIR/UserService.go"
got=$(perl "$LINTER_DIR/nc-lint.pl" "$GO_DIR" --json | python3 -c 'import json,sys; print(" ".join(sorted("%s@%s:%s" % (f["name"], f["line"], f["rule"]) for f in json.load(sys.stdin)["findings"] if f["severity"] == "error")))')
want="MAX_RETRIES@15:CASING UserService@0:CASING doStuff@5:PREFIX doStuff@5:VAGUE fetchData@7:VAGUE tmpValue2@18:NUMBERED tmpValue2@18:VAGUE"
if [[ "$got" == "$want" ]]; then report PASS ".go" "findings" "$want"
else report FAIL ".go" "findings" "attendu '$want', obtenu '$got'"; fi
rm -rf "$GO_DIR"

echo ""
echo "── Test de non-régression : architecture (une passe par fichier, jamais par ligne) ──"
# Le gain mesuré (7 min → 0,07 s) vient à ~98 % de ce principe, pas du langage
# (voir nc-lint.pl, en-tête). Deux gardes pour qu'il ne régresse pas en silence :

# ① Aucun sous-processus dans le moteur — un system()/qx()/open pipé réintroduit
# exactement le défaut de l'ancien moteur bash (un fork par ligne x par check).
NC_LINT="$LINTER_DIR/nc-lint.pl"
if grep -nE '\bsystem[[:space:]]*\(|\bqx[[:space:]]*[/{(!'"'"'"]|open[[:space:]]*\([^)]*\|' "$NC_LINT" >/dev/null; then
  report FAIL "nc-lint.pl" "no-subprocess" "system()/qx()/open pipé détecté — architecture single-process cassée"
else
  report PASS "nc-lint.pl" "no-subprocess" "aucun sous-processus dans le moteur"
fi

# ② Seuil de perf sur un corpus synthétique (200 copies d'une fixture réelle,
# ~2400 lignes) — assez large pour ne pas flaker sur une machine chargée, assez
# serré pour attraper un retour à l'architecture par-ligne (qui mettait
# largement plus d'une minute sur un ordre de grandeur comparable).
PERF_DIR="$(mktemp -d)"
trap 'rm -rf "$PERF_DIR"' EXIT
for i in $(seq 1 200); do cp "$TESTS_DIR/fixtures/realistic/order-service.ts" "$PERF_DIR/order-service-$i.ts"; done
START=$(perl -MTime::HiRes=time -e 'print time')
bash "$LINTER_DIR/lint.sh" "$PERF_DIR" --summary >/dev/null 2>&1
END=$(perl -MTime::HiRes=time -e 'print time')
ELAPSED=$(perl -e "printf '%.2f', $END - $START")
if perl -e "exit(($ELAPSED < 10) ? 0 : 1)"; then
  report PASS "nc-lint.pl" "perf" "${ELAPSED}s sur 200 fichiers (~2400 lignes)"
else
  report FAIL "nc-lint.pl" "perf" "${ELAPSED}s sur 200 fichiers — bien trop lent, architecture régressée"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════════"
exit $((FAIL > 0 ? 1 : 0))
