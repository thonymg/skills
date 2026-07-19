#!/usr/bin/env bash
# checks/standalone-suffixes.sh
# Détecte les noms de classes qui SONT uniquement un suffixe infra sans entité.
#
# Règle : Manager ❌ (erreur), UserManager ✅
#         DataManager → ⚠️ warning : « Data » n'est pas une entité du vocabulaire
#
# Sévérité :
#   - Suffixe seul (class Manager)                → ❌ erreur (structurel)
#   - Entité inconnue devant le suffixe (Data…)   → ⚠️ warning (vocabulaire)
#
# Dernière ligne machine-parsable : RESULT:standalone-suffixes:errors=N:warnings=M
#
# Usage: ./checks/standalone-suffixes.sh [TARGET_DIR]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/vocabulary.sh"

TARGET="${1:-.}"
init_vocabulary "$TARGET"

ERRORS=0
WARNINGS=0

# Entité connue — tolère le pluriel Rails (OrdersController → Order ✅)
match_known_entity() {
  local part="$1"
  echo "$part" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  [[ "$part" == *es ]] && echo "${part%es}" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  [[ "$part" == *s ]] && echo "${part%s}" | grep -qE "^(${ENTITY_PATTERN_EFFECTIVE})$" && return 0
  return 1
}

check_class_name() {
  local file="$1" lineno="$2" name="$3"

  # Le nom est-il exactement l'un des suffixes interdits standalone ?
  if echo "$name" | grep -qE "^(${STANDALONE_FORBIDDEN})$"; then
    echo "❌ STANDALONE  ${file}:${lineno}  '${name}'"
    echo "   → suffixe seul sans entité — ex: Error${name}, User${name}, Order${name}"
    ERRORS=$((ERRORS + 1))
    return 0
  fi

  # Le nom se termine-t-il par un suffixe interdit SANS entité reconnue devant ?
  local suffix
  for suffix in $(tr '|' ' ' <<< "$STANDALONE_FORBIDDEN"); do
    if echo "$name" | grep -qE "${suffix}$"; then
      local prefix_part
      prefix_part=$(echo "$name" | sed -E "s/${suffix}$//")
      [[ -z "$prefix_part" ]] && break
      # prefix_part doit correspondre à une entité connue (core, custom.md, pluriel Rails)
      if ! match_known_entity "$prefix_part"; then
        echo "⚠️ ENTITY?    ${file}:${lineno}  '${name}'"
        echo "   → '${prefix_part}' n'est pas une entité du vocabulaire — ajoute-le dans custom.md si intentionnel"
        WARNINGS=$((WARNINGS + 1))
      fi
      break
    fi
  done
  return 0
}

scan_ts_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
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
    echo "$line" | grep -q "ActiveRecord::Migration" && continue
    if echo "$line" | grep -qE "^[[:space:]]*class[[:space:]]+[A-Z]"; then
      local name
      name=$(echo "$line" | sed -E "s/^[[:space:]]*class[[:space:]]+([A-Z][a-zA-Z0-9:]*).*/\1/")
      name="${name##*::}"
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
echo "standalone-suffixes : ${ERRORS} erreur(s), ${WARNINGS} warning(s)"
echo "RESULT:standalone-suffixes:errors=${ERRORS}:warnings=${WARNINGS}"
exit $((ERRORS > 0 ? 1 : 0))
