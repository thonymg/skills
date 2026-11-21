#!/usr/bin/env bash
# run-fix-root-tests.sh — Tests de non-régression des scripts de fix-root.
#
# Chaque scénario construit un repo git jetable et rejoue un cas mesuré dans
# RAPPORT-fix-root-naming-convention.md (perte du test non commité, découpage
# de la commande, sous-dossier, prédicat qui crashe, prédicat instable, piège
# du test commité après la régression, faux rouge sur ImportError…).
#
# Usage: tests/run-fix-root-tests.sh
# Exit : 0 si tout passe, 1 sinon.

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$TESTS_DIR/.." && pwd)"
SCRIPTS="${FIX_ROOT_SCRIPTS:-$REPO/skills/fix-root/scripts}"   # surcharge : rejouer sur une autre version
BISECT="$SCRIPTS/bisect-run.sh"
VERIFY="$SCRIPTS/verify-test-first.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASS=0
FAIL=0
report() {
  if [[ "$1" == "PASS" ]]; then printf "  ✅ %-42s %s\n" "$2" "$3"; PASS=$((PASS + 1))
  else printf "  ❌ %-42s %s\n" "$2" "$3"; FAIL=$((FAIL + 1)); fi
}

# Repo neuf : commits c1..c<n>, `v` contient "good" avant c<bad_from>, "bad" à partir de lui.
make_history() {
  local dir="$1" n="$2" bad_from="$3"
  mkdir -p "$dir" && cd "$dir" && git init -q -b main
  for i in $(seq 1 "$n"); do
    if [[ $i -ge $bad_from ]]; then echo "bad $i" > v; else echo "good $i" > v; fi
    git add v && git commit -qm "c$i"
  done
  git tag good "$(git log --format=%H --grep='^c1$')"
}
sha_of() { git log --format=%H --grep="^$1\$"; }
found() { grep -q "^== first bad commit: $1" <<<"$2"; }

echo "── bisect-run.sh ──────────────────────────────────────────"

# 1. --keep sur un test non commité : le fichier doit survivre (perte de données avant).
make_history "$WORK/keep" 8 5
printf 'grep -q good v\n' > t.sh
out=$(bash "$BISECT" --good good --keep t.sh -- bash t.sh 2>&1)
if found "$(sha_of c5)" "$out" && [[ -f t.sh ]]; then report PASS "keep-untracked-survives" "coupable c5, t.sh présent"
else report FAIL "keep-untracked-survives" "t.sh $( [[ -f t.sh ]] && echo présent || echo SUPPRIMÉ )"; fi

# 2. Commande en plusieurs arguments, avec un argument qui contient des espaces.
make_history "$WORK/argv" 8 5
out=$(bash "$BISECT" --good good -- bash -c 'grep -q good v' 2>&1)
if found "$(sha_of c5)" "$out"; then report PASS "argv-quoting" "coupable c5"; else report FAIL "argv-quoting" "$(tail -1 <<<"$out")"; fi

# 3. Commande en une seule chaîne shell.
out=$(bash "$BISECT" --good good -- 'grep -q good v && true' 2>&1)
if found "$(sha_of c5)" "$out"; then report PASS "single-string" "coupable c5"; else report FAIL "single-string" "$(tail -1 <<<"$out")"; fi

# 3b. Commande qui contient `exit` + --keep non commité : le exit ne doit pas
#     sauter la remise en place (checkout suivant bloqué, fichier perdu).
make_history "$WORK/exit" 8 5
printf 'grep -q good v\n' > t.sh
out=$(bash "$BISECT" --good good --keep t.sh -- 'bash t.sh || exit 1' 2>&1)
if found "$(sha_of c5)" "$out" && [[ -f t.sh ]]; then report PASS "exit-in-command" "coupable c5, t.sh présent"
else report FAIL "exit-in-command" "$(tail -1 <<<"$out")"; fi

# 4. Lancé depuis un sous-dossier : la commande tourne depuis ce dossier.
make_history "$WORK/subdir" 8 5
mkdir sub && cd sub
out=$(bash "$BISECT" --good good -- grep -q good ../v 2>&1)
if found "$(sha_of c5)" "$out"; then report PASS "run-from-subdir" "coupable c5"; else report FAIL "run-from-subdir" "$(tail -1 <<<"$out")"; fi

# 5. Option sans valeur : erreur d'usage immédiate (boucle infinie avant).
cd "$WORK/subdir"
perl -e 'alarm 5; exec @ARGV' bash "$BISECT" --good >/dev/null 2>&1; rc=$?
if [[ $rc -eq 2 ]]; then report PASS "option-without-value" "exit=2"; else report FAIL "option-without-value" "exit=$rc (142 = boucle tuée)"; fi

# 6. Prédicat qui crashe (SIGSEGV, exit 139) : ramené à "bad" au lieu d'abandonner.
make_history "$WORK/crash" 8 5
out=$(bash "$BISECT" --good good -- bash -c 'grep -q good v || kill -SEGV $$' 2>&1)
if found "$(sha_of c5)" "$out"; then report PASS "crashing-predicate" "coupable c5"; else report FAIL "crashing-predicate" "$(tail -1 <<<"$out")"; fi

# 7. Prédicat instable (déterministe : un faux "good" un appel sur deux) + --repeat 10.
make_history "$WORK/flaky" 16 9
echo 0 > "$WORK/flaky.count"
cat > "$WORK/flaky.sh" <<EOF
grep -q good v && exit 0
n=\$(( \$(cat "$WORK/flaky.count") + 1 )); echo \$n > "$WORK/flaky.count"
exit \$(( n % 2 ))
EOF
out=$(bash "$BISECT" --good good --repeat 10 -- bash "$WORK/flaky.sh" 2>&1)
if found "$(sha_of c9)" "$out"; then report PASS "flaky-predicate-repeat" "coupable c9"; else report FAIL "flaky-predicate-repeat" "$(tail -1 <<<"$out")"; fi

# 8. Test commité APRÈS la régression : refus sans --keep, coupable exact avec.
make_history "$WORK/trap" 8 4
printf 'import sys\nsys.exit(0 if "good" in open("v").read() else 1)\n' > t.py
git add t.py && git commit -qm "add test"
out=$(bash "$BISECT" --good good -- python3 -B t.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'already fails at --good' <<<"$out" && ! grep -q 'bisecting' <<<"$out"; then report PASS "committed-test-trap-refuses" "exit=1 avant bisect (pré-check)"
else report FAIL "committed-test-trap-refuses" "exit=$rc — un faux coupable a peut-être été annoncé"; fi
out=$(bash "$BISECT" --good good --keep t.py -- python3 -B t.py 2>&1)
if found "$(sha_of c4)" "$out" && [[ -f t.py ]]; then report PASS "committed-test-trap-keep" "coupable c4"
else report FAIL "committed-test-trap-keep" "$(tail -1 <<<"$out")"; fi

# 9. La fixture d'eval du skill, avec la commande telle qu'un agent l'écrirait.
mkdir -p "$WORK/billing" && cd "$WORK/billing" && bash "$REPO/evals/fixtures/billing-regression/setup.sh" >/dev/null 2>&1
out=$(bash "$BISECT" --good v1.0 -- python3 -B -c "from billing import discount; assert discount(100, 0.2) == 80" 2>&1)
culprit=$(sed -n 's/^== first bad commit: //p' <<<"$out")
subject=$([[ -n "$culprit" ]] && git log -1 --format=%s "$culprit")
if [[ "$subject" == *"percentage points"* ]]; then report PASS "eval-fixture-billing-regression" "$subject"
else report FAIL "eval-fixture-billing-regression" "obtenu: ${subject:-$(tail -1 <<<"$out")}"; fi

# 9b. Fixture latent-regression : bisect désigne le commit légitime qui expose le bug.
mkdir -p "$WORK/latent" && cd "$WORK/latent" && bash "$REPO/evals/fixtures/latent-regression/setup.sh" >/dev/null 2>&1
out=$(bash "$BISECT" --good v1.0 -- python3 -B -c "from orders import average_basket; average_basket([{'total': 10, 'status': 'cancelled'}])" 2>&1)
culprit=$(sed -n 's/^== first bad commit: //p' <<<"$out")
subject=$([[ -n "$culprit" ]] && git log -1 --format=%s "$culprit")
if [[ "$subject" == *"cancelled orders must not count"* ]]; then report PASS "eval-fixture-latent-regression" "$subject"
else report FAIL "eval-fixture-latent-regression" "obtenu: ${subject:-$(tail -1 <<<"$out")}"; fi

echo ""
echo "── verify-test-first.sh ───────────────────────────────────"

make_lib() {
  mkdir -p "$1" && cd "$1" && git init -q -b main
  printf 'def total(xs):\n    return sum(xs)\n' > lib.py
  git add lib.py && git commit -qm init
}

# 10. Chemin nominal : le test échoue sur une assertion sans le fix, passe avec.
make_lib "$WORK/v-nominal"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
printf 'from lib import total\nassert total([1, None]) == 1\n' > test_lib.py
bash "$VERIFY" 'python3 -B test_lib.py' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]] && grep -q 'if x' lib.py; then report PASS "verify-nominal" "exit=0, fix restauré"; else report FAIL "verify-nominal" "exit=$rc"; fi

# 11. Même cas avec --expect-red : le bug (sum sur None → TypeError) est bien la cause du rouge.
bash "$VERIFY" --expect-red 'TypeError.*NoneType' 'python3 -B test_lib.py' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]]; then report PASS "verify-expect-red-match" "exit=0"; else report FAIL "verify-expect-red-match" "exit=$rc"; fi

# 11b. Commande de test qui contient `exit` : le script doit aller au bout (fix restauré).
bash "$VERIFY" 'python3 -B test_lib.py || exit 1' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]] && grep -q 'if x' lib.py; then report PASS "verify-exit-in-command" "exit=0, fix restauré"; else report FAIL "verify-exit-in-command" "exit=$rc"; fi

# 12. --expect-red qui ne correspond pas : refus.
bash "$VERIFY" --expect-red 'expected 80' 'python3 -B test_lib.py' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 1 ]] && grep -q 'if x' lib.py; then report PASS "verify-expect-red-mismatch" "exit=1, fix restauré"; else report FAIL "verify-expect-red-mismatch" "exit=$rc"; fi

# 13. Faux rouge : le test importe une fonction que le fix ajoute (PASS à tort avant).
make_lib "$WORK/v-import"
printf 'def total(xs):\n    return sum(xs)\ndef total_safe(xs):\n    return sum(x for x in xs if x)\n' > lib.py
printf 'from lib import total_safe\nassert total_safe([1, None]) == 1\n' > test_lib.py
out=$(bash "$VERIFY" 'python3 -B test_lib.py' -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'wrong reason' <<<"$out" && grep -q total_safe lib.py; then report PASS "verify-rejects-import-red" "exit=1, fix restauré"
else report FAIL "verify-rejects-import-red" "exit=$rc"; fi

# 14. Fix = nouveau fichier stagé avec `git add` (le conseil `git add -N` échouait).
make_lib "$WORK/v-newfile"
echo 'enabled' > feature.cfg && git add feature.cfg
bash "$VERIFY" 'test -s feature.cfg' -- feature.cfg >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 && -s feature.cfg ]]; then report PASS "verify-new-file-git-add" "exit=0"; else report FAIL "verify-new-file-git-add" "exit=$rc"; fi

# 15. Test déjà vert sans le fix : il ne reproduit pas le bug.
make_lib "$WORK/v-green"
printf 'def total(xs):\n    return sum(xs) + 0\n' > lib.py
printf 'from lib import total\nassert total([1, 2]) == 3\n' > test_lib.py
bash "$VERIFY" 'python3 -B test_lib.py' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 1 ]] && grep -q '+ 0' lib.py; then report PASS "verify-already-green" "exit=1, fix restauré"; else report FAIL "verify-already-green" "exit=$rc"; fi

# 16. Un fix déjà stagé le reste après la vérification.
make_lib "$WORK/v-staged"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py && git add lib.py
printf 'from lib import total\nassert total([1, None]) == 1\n' > test_lib.py
bash "$VERIFY" 'python3 -B test_lib.py' -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]] && ! git diff --cached --quiet -- lib.py; then report PASS "verify-keeps-staging" "exit=0, toujours stagé"
else report FAIL "verify-keeps-staging" "exit=$rc"; fi

echo ""
echo "── verify-suite.sh ────────────────────────────────────────"
SUITE="$SCRIPTS/verify-suite.sh"
UNIT='python3 -B -m unittest -q 2>&1'

# Repo avec lib.py bogué (sum sur None), son test de régression, et un test annexe.
make_suite() {
  make_lib "$1"
  printf 'import unittest\nfrom lib import total\nclass Lib(unittest.TestCase):\n    def test_none(self): self.assertEqual(total([1, None]), 1)\n    def test_ints(self): self.assertEqual(total([1, 2]), 3)\n' > test_lib.py
  git add test_lib.py && git commit -qm tests
}

# 17. Le fix rend la suite verte → 0.
make_suite "$WORK/s-green"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
bash "$SUITE" "$UNIT" -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]] && grep -q 'if x' lib.py; then report PASS "suite-green" "exit=0, fix restauré"; else report FAIL "suite-green" "exit=$rc"; fi

# 18. Un échec qui existait déjà sans le fix → 3, nommé, pas de revert.
make_suite "$WORK/s-pre"
printf 'import unittest\nclass Legacy(unittest.TestCase):\n    def test_legacy(self): self.assertEqual("a", "b")\n' > test_legacy.py
git add test_legacy.py && git commit -qm legacy
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
out=$(bash "$SUITE" "$UNIT" -- lib.py 2>&1); rc=$?
if [[ $rc -eq 3 ]] && grep -q 'test_legacy' <<<"$out" && ! grep -q 'NEW' <<<"$out"; then report PASS "suite-preexisting-failure" "exit=3, test_legacy nommé"
else report FAIL "suite-preexisting-failure" "exit=$rc"; fi

# 19. Le fix casse un autre test → 1, le test est nommé.
make_suite "$WORK/s-new"
printf 'def total(xs):\n    return sum(x for x in xs if x) + (1 if len(xs) == 2 and None not in xs else 0)\n' > lib.py
out=$(bash "$SUITE" "$UNIT" -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'NEW' <<<"$out" && grep -q 'test_ints' <<<"$out"; then report PASS "suite-new-failure" "exit=1, test_ints nommé"
else report FAIL "suite-new-failure" "exit=$rc"; fi

# 20. Rouge avant et après, sortie illisible → 1 UNVERIFIED (refus, pas de certification).
make_suite "$WORK/s-opaque"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
out=$(bash "$SUITE" 'echo boom; exit 1' -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'UNVERIFIED' <<<"$out"; then report PASS "suite-unparsable-refuses" "exit=1 UNVERIFIED"
else report FAIL "suite-unparsable-refuses" "exit=$rc"; fi

# 21. Vert sans le fix, rouge avec, sortie illisible → 1 (régression certaine).
out=$(bash "$SUITE" 'grep -q "if x" lib.py && exit 1; exit 0' -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'passes without the fix' <<<"$out"; then report PASS "suite-green-then-red" "exit=1"
else report FAIL "suite-green-then-red" "exit=$rc"; fi

# 22. --fail-pattern (TAP) : l'ancien bug disparaît, l'échec historique reste → 3.
cat > "$WORK/tap.sh" <<'EOF'
grep -q "if x" lib.py || echo "not ok 1 - total ignores None"
echo "not ok 2 - legacy/report"
exit 1
EOF
out=$(bash "$SUITE" --fail-pattern '^not ok [0-9]+ - (.*)$' "bash $WORK/tap.sh" -- lib.py 2>&1); rc=$?
if [[ $rc -eq 3 ]] && grep -q 'legacy/report' <<<"$out"; then report PASS "suite-fail-pattern" "exit=3, legacy/report nommé"
else report FAIL "suite-fail-pattern" "exit=$rc"; fi

# 23. Même échec, durée différente à chaque run (go test) → pas un « nouvel » échec.
cat > "$WORK/go.sh" <<'EOF'
echo "--- FAIL: TestLegacy (0.0$RANDOM s)"
printf 'FAIL\texample.com/pkg\t0.%ss\n' "$RANDOM"
exit 1
EOF
out=$(bash "$SUITE" "bash $WORK/go.sh" -- lib.py 2>&1); rc=$?
if [[ $rc -eq 3 ]]; then report PASS "suite-durations-normalised" "exit=3"
else report FAIL "suite-durations-normalised" "exit=$rc"; echo "$out" | tail -5 | sed 's/^/       /'; fi

# 24. Sortie de suite avec une ligne numérotée « 1) … » dans les deux runs, et
#     un nouvel échec que rien ne nomme : le motif « N) » ne doit pas fabriquer
#     un id commun qui transformerait le verdict en 3.
cat > "$WORK/numbered.sh" <<'EOS'
echo "1) Connecting to database"
grep -q "if x" lib.py && echo "boom: something else broke"
exit 1
EOS
make_suite "$WORK/s-numbered"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
out=$(bash "$SUITE" "bash $WORK/numbered.sh" -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]]; then report PASS "suite-numbered-log-not-an-id" "exit=1"
else report FAIL "suite-numbered-log-not-an-id" "exit=$rc — faux « pré-existant »"; fi

# 25. Fix = suppression d'un fichier suivi : accepté.
make_lib "$WORK/v-delete"
printf 'BROKEN\n' > flag.cfg && git add flag.cfg && git commit -qm flag
rm flag.cfg
bash "$VERIFY" '! test -e flag.cfg' -- flag.cfg >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 && ! -e flag.cfg ]]; then report PASS "verify-deleted-file" "exit=0"; else report FAIL "verify-deleted-file" "exit=$rc"; fi

# 25b. Faux rouge Go : la compilation du test échoue ([build failed]) → 1.
make_lib "$WORK/v-gobuild"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
out=$(bash "$VERIFY" 'grep -q "if x" lib.py || { echo "FAIL	example.com/pkg [build failed]"; exit 1; }' -- lib.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'wrong reason' <<<"$out"; then report PASS "verify-rejects-go-build-failed" "exit=1"
else report FAIL "verify-rejects-go-build-failed" "exit=$rc"; fi

echo ""
echo "── racine vs symptôme (verify multi-commandes) ────────────"
# Défaut partagé : core.norm() renvoie None sur liste vide ; api_a et api_b
# l'appellent. Fix au symptôme = garde dans api_a seulement.
make_shared() {
  mkdir -p "$1" && cd "$1" && git init -q -b main
  printf 'def norm(xs):\n    return sum(xs) / len(xs) if xs else None\n' > core.py
  printf 'from core import norm\ndef a(xs):\n    return round(norm(xs), 2)\n' > api_a.py
  printf 'from core import norm\ndef b(xs):\n    return norm(xs) * 100\n' > api_b.py
  git add . && git commit -qm init
}
TA='python3 -B -c "from api_a import a; assert a([]) == 0"'
TB='python3 -B -c "from api_b import b; assert b([]) == 0"'

# 26. Fix au symptôme : api_a vert, api_b reste rouge → 1.
make_shared "$WORK/m-symptom"
printf 'from core import norm\ndef a(xs):\n    return round(norm(xs) or 0, 2)\n' > api_a.py
out=$(bash "$VERIFY" "$TA" "$TB" -- api_a.py 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'symptom' <<<"$out"; then report PASS "verify-multi-symptom-fix-refused" "exit=1"
else report FAIL "verify-multi-symptom-fix-refused" "exit=$rc"; fi

# 27. Fix à la racine : les deux appelants passent → 0.
make_shared "$WORK/m-root"
printf 'def norm(xs):\n    return sum(xs) / len(xs) if xs else 0\n' > core.py
bash "$VERIFY" "$TA" "$TB" -- core.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 0 ]]; then report PASS "verify-multi-root-fix" "exit=0"; else report FAIL "verify-multi-root-fix" "exit=$rc"; fi

# 28. --repeat : un vert qui n'est vert qu'un appel sur deux → 1.
make_lib "$WORK/v-flaky"
printf 'def total(xs):\n    return sum(x for x in xs if x)\n' > lib.py
cat > "$WORK/flaky-green.sh" <<'EOS'
c=$(cat "$WORK_COUNTER" 2>/dev/null || echo 0); echo $((c + 1)) > "$WORK_COUNTER"
grep -q "if x" lib.py && [ $((c % 2)) -eq 0 ]
EOS
export WORK_COUNTER="$WORK/counter-green"
bash "$VERIFY" --repeat 4 "bash $WORK/flaky-green.sh" -- lib.py >/dev/null 2>&1; rc=$?
if [[ $rc -eq 1 ]]; then report PASS "verify-repeat-flaky-green" "exit=1"; else report FAIL "verify-repeat-flaky-green" "exit=$rc"; fi

echo ""
echo "── bisect : bornes ────────────────────────────────────────"
# 29. Le « bon » ref montre déjà le bug → refus avant tout bisect.
make_history "$WORK/b-endpoints" 6 1
out=$(bash "$BISECT" --good good -- bash -c 'grep -q good v' 2>&1); rc=$?
if [[ $rc -eq 1 ]] && grep -q 'already fails at --good' <<<"$out" && ! grep -q 'bisecting' <<<"$out"; then
  report PASS "bisect-good-endpoint-refused" "exit=1 avant bisect"
else report FAIL "bisect-good-endpoint-refused" "exit=$rc"; fi

echo ""
echo "── measure-repro.sh ───────────────────────────────────────"
MEASURE="$SCRIPTS/measure-repro.sh"
bash "$MEASURE" -n 5 -- false >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 ]] && report PASS "measure-deterministic" "exit=0" || report FAIL "measure-deterministic" "exit=$rc"
bash "$MEASURE" -n 5 -- true >/dev/null 2>&1; rc=$?
[[ $rc -eq 1 ]] && report PASS "measure-no-repro" "exit=1" || report FAIL "measure-no-repro" "exit=$rc"
export WORK_COUNTER="$WORK/counter-measure"
out=$(bash "$MEASURE" -n 10 -- 'c=$(cat "$WORK_COUNTER" 2>/dev/null || echo 0); echo $((c + 1)) > "$WORK_COUNTER"; [ $((c % 2)) -eq 0 ]' 2>&1); rc=$?
# 5/10 reproduit → N = ceil(ln 0.01 / ln 0.5) = 7
if [[ $rc -eq 3 ]] && grep -q 'reproduced 5/10' <<<"$out" && grep -q -- '--repeat 7' <<<"$out"; then
  report PASS "measure-intermittent" "exit=3, --repeat 7"
else report FAIL "measure-intermittent" "exit=$rc $(head -1 <<<"$out")"; fi

echo ""
echo "── check-ledger.sh ────────────────────────────────────────"
LEDGER="$SCRIPTS/check-ledger.sh"
ledger_case() {   # $1 = nom, $2 = exit attendu, $3 = options, stdin = registre
  mkdir -p .fix-root && cat > .fix-root/ledger
  # shellcheck disable=SC2086
  out=$(bash "$LEDGER" $3 2>&1); rc=$?
  if [[ $rc -eq $2 ]]; then report PASS "$1" "exit=$rc"; else report FAIL "$1" "exit=$rc attendu $2: $(head -1 <<<"$out")"; fi
}
make_shared "$WORK/l"
echo .fix-root >> .git/info/exclude
ledger_case "ledger-short-nominal" 0 "" <<'EOS'
track | short
repro | python3 -B -c "from api_b import b; assert b([]) == 0"
H1 | confirmed | core.py:2 | norm returns None on empty input | line 2: `else None`
EOS
ledger_case "ledger-cite-missing-line" 1 "" <<'EOS'
track | short
repro | x
H1 | confirmed | core.py:99 | norm returns None | -
EOS
ledger_case "ledger-full-needs-3" 1 "" <<'EOS'
track | full
repro | x
H1 | killed | api_a.py:3 | round fails on None | -
H2 | confirmed | core.py:2 | norm returns None | -
EOS
ledger_case "ledger-duplicate-hypothesis" 1 "" <<'EOS'
track | full
repro | x
H1 | killed | api_a.py:3 | Norm returns None | -
H2 | open | | caller passes empty list | -
H3 | open | | norm   returns none | -
EOS
ledger_case "ledger-two-failed-fixes" 1 "" <<'EOS'
track | short
repro | x
H1 | confirmed | core.py:2 | norm returns None | -
fix | H1 | fail
fix | H1 | fail
EOS
printf 'def norm(xs):\n    return sum(xs) / len(xs) if xs else 0\n' > core.py
printf 'from core import norm\ndef a(xs):\n    return round(norm(xs) or 0, 2)\n' > api_a.py
ledger_case "ledger-final-out-of-scope" 1 "--final" <<'EOS'
track | short
repro | x
H1 | confirmed | core.py:2 | norm returns None | -
EOS
git checkout -q -- api_a.py
printf 'import unittest\n' > test_core.py
ledger_case "ledger-final-in-scope" 0 "--final" <<'EOS'
track | short
repro | x
H1 | confirmed | core.py:2 | norm returns None | -
fix | H1 | pass
EOS
ledger_case "ledger-final-max-lines" 1 "--final --max-lines 1" <<'EOS'
track | short
repro | x
H1 | confirmed | core.py:2 | norm returns None | -
EOS

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════════"
exit $((FAIL > 0 ? 1 : 0))
