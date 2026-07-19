#!/usr/bin/env bash
# checks/class-suffixes.sh
# Vérifie que les noms de classes se terminent par un suffixe infra ou UI reconnu.
# Cas non couverts intentionnellement : entités domaine pures (User, Order, Task…)
# qui sont des noms substantifs sans suffixe — exclues via le vocabulaire entités.
#
# Règle : class Foo → Foo doit se terminer par un suffixe reconnu
#         OU être lui-même une entité pure (entités | collections | custom.md)
#
# Déduplication : les noms se terminant par un suffixe STANDALONE_FORBIDDEN
# (Manager, Helper…) sont la propriété de checks/standalone-suffixes.sh — skip ici,
# sinon `class Manager` serait compté deux fois.
#
# Dernière ligne machine-parsable : RESULT:class-suffixes:errors=N:warnings=0
#
# Usage: ./checks/class-suffixes.sh [TARGET_DIR]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/vocabulary.sh"

TARGET="${1:-.}"
init_vocabulary "$TARGET"

ERRORS=0

# Entité connue — tolère le pluriel Rails (Orders → Order, Batches → Batch)
match_known_entity() {
  local part="$1"
  echo "$part" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  [[ "$part" == *es ]] && echo "${part%es}" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  [[ "$part" == *s ]] && echo "${part%s}" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  return 1
}

check_class_name() {
  local file="$1" lineno="$2" name="$3"

  # Propriété de standalone-suffixes.sh (dédup du double comptage)
  echo "$name" | grep -qE "(${STANDALONE_FORBIDDEN})$" && return 0

  # Classe se terminant par un suffixe infra, UI ou custom → OK
  echo "$name" | grep -qE "(${CLASS_SUFFIX_PATTERN_EFFECTIVE})$" && return 0

  # Entité domaine pure (core ou custom.md) → OK
  match_known_entity "$name" && return 0

  # Classe d'erreur custom → OK si finit par Error
  echo "$name" | grep -qE "Error$" && return 0

  echo "❌ SUFFIX   ${file}:${lineno}  '${name}'"
  echo "   → classe sans suffixe reconnu — attend un suffixe infra/UI ou une entité du vocabulaire"
  ERRORS=$((ERRORS + 1))
  return 0
}

scan_ts_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Détecte : (export)? (abstract)? class Name
    if echo "$line" | grep -qE "^[[:space:]]*(export[[:space:]]+)?(default[[:space:]]+)?(abstract[[:space:]]+)?class[[:space:]]+[A-Z][a-zA-Z0-9]*"; then
      local name
      name=$(echo "$line" | sed -E "s/^[[:space:]]*(export[[:space:]]+)?(default[[:space:]]+)?(abstract[[:space:]]+)?class[[:space:]]+([A-Z][a-zA-Z0-9]*).*/\4/")
      check_class_name "$file" "$lineno" "$name"
    fi

  done < "$file"
}

scan_py_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # class Name ou class Name(Base):
    if echo "$line" | grep -qE "^class[[:space:]]+[A-Z][a-zA-Z0-9]*"; then
      local name
      name=$(echo "$line" | sed -E "s/^class[[:space:]]+([A-Z][a-zA-Z0-9]*).*/\1/")
      check_class_name "$file" "$lineno" "$name"
    fi

  done < "$file"
}

scan_rb_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    # Migrations Rails : classes verbe-first légitimes (CreateOrders) → skip
    echo "$line" | grep -q "ActiveRecord::Migration" && continue
    if echo "$line" | grep -qE "^[[:space:]]*class[[:space:]]+[A-Z]"; then
      local name
      name=$(echo "$line" | sed -E "s/^[[:space:]]*class[[:space:]]+([A-Z][a-zA-Z0-9:]*).*/\1/")
      name="${name##*::}"
      # Classes de base Rails (ApplicationController, ApplicationRecord…)
      echo "$name" | grep -qE "^Application[A-Z]" && continue
      check_class_name "$file" "$lineno" "$name"
    fi
  done < "$file"
}

# ── TS / JS ──────────────────────────────────────────────────────────────────
while IFS= read -r -d '' f; do
  scan_ts_file "$f"
done < <(find "$TARGET" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -print0)

# ── Python ───────────────────────────────────────────────────────────────────
while IFS= read -r -d '' f; do
  scan_py_file "$f"
done < <(find "$TARGET" -type f -name "*.py" \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -print0)

# ── Ruby ─────────────────────────────────────────────────────────────────────
while IFS= read -r -d '' f; do
  scan_rb_file "$f"
done < <(find "$TARGET" -type f -name "*.rb" \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" -print0)

echo ""
echo "class-suffixes : ${ERRORS} erreur(s), 0 warning(s)"
echo "RESULT:class-suffixes:errors=${ERRORS}:warnings=0"
exit $((ERRORS > 0 ? 1 : 0))
