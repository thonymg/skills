#!/usr/bin/env bash
# lint.sh — Script maître du linter de convention de nommage.
#
# Exécute tous les checks et produit un rapport agrégé.
# Chaque check émet une ligne machine-parsable `RESULT:<check>:errors=N:warnings=M` ;
# lint.sh ne parse QUE cette ligne (un check qui crashe = échec explicite, pas un
# compteur fantaisiste).
#
# Sévérité :
#   - erreurs  : violations structurelles → exit 1 (bloque la CI)
#   - warnings : mots hors vocabulaire    → affichés, n'échouent pas la CI
#
# Usage:
#   ./lint.sh [TARGET_DIR] [OPTIONS]
#
# Options:
#   --only casing-files|prefixes|forbidden|class-suffixes|standalone-suffixes
#       Exécute uniquement le check spécifié.
#   --no-color
#       Désactive les couleurs ANSI.
#   --summary
#       Affiche seulement le résumé final, pas les détails.
#   --json
#       Sortie JSON machine-parsable (implique --no-color, pas de détails).
#
# Exemples:
#   ./lint.sh ../../../my-project
#   ./lint.sh . --only prefixes
#   ./lint.sh --summary
#   ./lint.sh . --json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKS_DIR="$SCRIPT_DIR/checks"

# ── Arguments ────────────────────────────────────────────────────────────────
TARGET="."
ONLY=""
SUMMARY_ONLY=0
NO_COLOR=0
JSON_OUT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)    ONLY="$2";   shift 2 ;;
    --summary) SUMMARY_ONLY=1; shift ;;
    --no-color) NO_COLOR=1; shift ;;
    --json)    JSON_OUT=1; NO_COLOR=1; shift ;;
    -*)        echo "Option inconnue : $1"; exit 2 ;;
    *)         TARGET="$1"; shift ;;
  esac
done

# ── Couleurs ─────────────────────────────────────────────────────────────────
if [[ $NO_COLOR -eq 0 && -t 1 ]]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'
  BOLD='\033[1m'; RESET='\033[0m'; DIM='\033[2m'
else
  RED=''; YELLOW=''; GREEN=''; BOLD=''; RESET=''; DIM=''
fi

hr() { printf "${DIM}%s${RESET}\n" "────────────────────────────────────────────"; }

# ── Exécution ─────────────────────────────────────────────────────────────────
if [[ $JSON_OUT -eq 0 ]]; then
  echo ""
  printf "${BOLD}🔍 Linter convention de nommage${RESET}\n"
  printf "${DIM}   Cible : ${TARGET}${RESET}\n"
  echo ""
fi

CHECKS=("casing-files" "prefixes" "forbidden" "class-suffixes" "standalone-suffixes")
TOTAL_ERRORS=0
TOTAL_WARNINGS=0
BROKEN_CHECKS=()
JSON_CHECKS=""

for check in "${CHECKS[@]}"; do
  [[ -n "$ONLY" && "$ONLY" != "$check" ]] && continue

  script="$CHECKS_DIR/${check}.sh"

  if [[ $JSON_OUT -eq 0 ]]; then
    hr
    printf "${BOLD}▶ ${check}${RESET}\n"
  fi

  if [[ ! -f "$script" ]]; then
    [[ $JSON_OUT -eq 0 ]] && printf "  ${YELLOW}⚠ script introuvable : %s${RESET}\n" "$script"
    BROKEN_CHECKS+=("$check")
    continue
  fi

  output=""
  exit_code=0
  output=$(bash "$script" "$TARGET" 2>&1) || exit_code=$?

  # Parse UNIQUEMENT la ligne RESULT — jamais un nombre arbitraire de la sortie
  result_line=$(echo "$output" | grep -E "^RESULT:${check}:" | tail -1 || true)

  if [[ -z "$result_line" ]]; then
    if [[ $JSON_OUT -eq 0 ]]; then
      printf "  ${RED}✖ check en erreur (pas de ligne RESULT, exit=%s)${RESET}\n" "$exit_code"
      echo "$output" | tail -5 | sed 's/^/    /'
    fi
    BROKEN_CHECKS+=("$check")
    continue
  fi

  errors=$(echo "$result_line" | sed -E 's/.*errors=([0-9]+).*/\1/')
  warnings=$(echo "$result_line" | sed -E 's/.*warnings=([0-9]+).*/\1/')
  TOTAL_ERRORS=$((TOTAL_ERRORS + errors))
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))
  JSON_CHECKS="${JSON_CHECKS}\"${check}\":{\"errors\":${errors},\"warnings\":${warnings}},"

  if [[ $JSON_OUT -eq 0 && $SUMMARY_ONLY -eq 0 ]]; then
    filtered=$(echo "$output" | grep -vE "^(RESULT:|${check} :)" || true)
    [[ -n "${filtered// }" ]] && echo "$filtered"
  fi
done

# ── Sortie JSON ───────────────────────────────────────────────────────────────
if [[ $JSON_OUT -eq 1 ]]; then
  broken_json=""
  for b in ${BROKEN_CHECKS[@]+"${BROKEN_CHECKS[@]}"}; do broken_json="${broken_json}\"${b}\","; done
  printf '{"target":"%s","checks":{%s},"broken":[%s],"errors":%d,"warnings":%d}\n' \
    "$TARGET" "${JSON_CHECKS%,}" "${broken_json%,}" "$TOTAL_ERRORS" "$TOTAL_WARNINGS"
  [[ ${#BROKEN_CHECKS[@]} -gt 0 || $TOTAL_ERRORS -gt 0 ]] && exit 1
  exit 0
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
hr
echo ""
if [[ ${#BROKEN_CHECKS[@]} -gt 0 ]]; then
  printf "${RED}${BOLD}✖  Check(s) en erreur interne : %s${RESET}\n" "${BROKEN_CHECKS[*]}"
fi
if [[ $TOTAL_ERRORS -eq 0 && ${#BROKEN_CHECKS[@]} -eq 0 ]]; then
  printf "${GREEN}${BOLD}✅  Aucune erreur — convention respectée.${RESET}\n"
else
  printf "${RED}${BOLD}❌  ${TOTAL_ERRORS} erreur(s)${RESET}\n"
fi
if [[ $TOTAL_WARNINGS -gt 0 ]]; then
  printf "${YELLOW}${BOLD}⚠️  ${TOTAL_WARNINGS} warning(s)${RESET} ${DIM}(mots hors vocabulaire — n'échouent pas la CI)${RESET}\n"
  printf "${DIM}   Ajoute les mots intentionnels dans vocabulary/custom.md.${RESET}\n"
fi
echo ""

[[ ${#BROKEN_CHECKS[@]} -gt 0 || $TOTAL_ERRORS -gt 0 ]] && exit 1
exit 0
