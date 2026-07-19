#!/usr/bin/env bash
# checks/prefixes.sh
# Vérifie que les fonctions/méthodes commencent par un préfixe autorisé.
# Détecte aussi les verbes composés (processAndSave, getOrCreate…).
#
# Sévérité :
#   - Préfixe hors vocabulaire → ⚠️ warning (n'échoue pas la CI)
#   - Verbe composé (And/Or)   → ❌ erreur (violation structurelle)
#
# Langages : TypeScript, JavaScript, Python
# Dernière ligne machine-parsable : RESULT:prefixes:errors=N:warnings=M
#
# Limitations connues (faux positifs) :
#   - Méthodes de librairies tierces redéfinies
#   - Certains callbacks passés en argument peuvent être flagués
#
# Usage: ./checks/prefixes.sh [TARGET_DIR]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/vocabulary.sh"

TARGET="${1:-.}"
init_vocabulary "$TARGET"

ERRORS=0
WARNINGS=0

# Extrait le nom d'une méthode/fonction depuis une ligne TS/JS
# Retourne "" si la ligne ne contient pas de déclaration détectable
extract_ts_name() {
  local line="$1"
  local name=""

  # 1. function name( ou async function name(
  if echo "$line" | grep -qE "(async[[:space:]]+)?function[[:space:]]+[a-z][a-zA-Z0-9]*[[:space:]]*\("; then
    name=$(echo "$line" | sed -E "s/.*function[[:space:]]+([a-z][a-zA-Z0-9]*)[[:space:]]*\(.*/\1/")

  # 2. Arrow function uniquement : const name = (async)? ( …
  #    Ignoré si le RHS est un scalaire (= 5000, = "foo", = true, = variable…)
  elif echo "$line" | grep -qE "^[[:space:]]*(export[[:space:]]+)?(const|let)[[:space:]]+[a-z][a-zA-Z0-9]*[[:space:]]*=[[:space:]]*(async[[:space:]]+)?(\(|function[[:space:]])"; then
    name=$(echo "$line" | sed -E "s/^[[:space:]]*(export[[:space:]]+)?(const|let)[[:space:]]+([a-z][a-zA-Z0-9]*)[[:space:]]*=.*/\3/")

  # 3. Méthode de classe avec modificateurs (public|private|protected|static|async|override|abstract)
  elif echo "$line" | grep -qE "^[[:space:]]+(public|private|protected|static|async|override|abstract|readonly)"; then
    name=$(echo "$line" | sed -E "s/^[[:space:]]+(public[[:space:]]+|private[[:space:]]+|protected[[:space:]]+|static[[:space:]]+|async[[:space:]]+|override[[:space:]]+|abstract[[:space:]]+|readonly[[:space:]]+)*//g" \
                        | sed -E "s/[[:space:]]*\(.*//")
    echo "$name" | grep -qE "^[a-z][a-zA-Z0-9]*$" || name=""

  # 4. Méthode simple indentée sans modificateur : "  methodName("
  elif echo "$line" | grep -qE "^[[:space:]]{2,}[a-z][a-zA-Z0-9]*[[:space:]]*\("; then
    name=$(echo "$line" | sed -E "s/^[[:space:]]+([a-z][a-zA-Z0-9]*)[[:space:]]*\(.*/\1/")
  fi

  echo "$name"
}

check_name_ts() {
  local file="$1" lineno="$2" name="$3"
  [[ -z "$name" ]] && return 0

  # Mots-clés et méthodes exemptées
  echo "$name" | grep -qE "^(if|for|while|switch|catch|try|return|throw|typeof|instanceof|new|delete|void|yield|await|super)$" && return 0
  echo "$name" | grep -qE "^(${EXEMPT_PATTERN})$" && return 0
  [[ "$name" == "get" || "$name" == "set" ]] && return 0

  # ① Préfixe hors vocabulaire → warning
  if ! echo "$name" | grep -qE "$PREFIX_REGEX_EFFECTIVE"; then
    echo "⚠️ PREFIX   ${file}:${lineno}  '${name}'"
    echo "   → ne commence pas par un préfixe approuvé — ajoute-le dans vocabulary/custom.md si intentionnel"
    WARNINGS=$((WARNINGS + 1))
  fi

  # ② Verbe composé → erreur
  if echo "$name" | grep -qE "(And|Or)[A-Z]"; then
    echo "❌ COMPOUND ${file}:${lineno}  '${name}'"
    echo "   → verbe composé interdit — une seule action par méthode"
    ERRORS=$((ERRORS + 1))
  fi
  return 0
}

scan_ts_file() {
  local file="$1"
  local lineno=0
  local in_block_comment=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Gestion commentaires bloc /* … */
    echo "$line" | grep -q "/\*" && in_block_comment=1
    echo "$line" | grep -q "\*/" && { in_block_comment=0; continue; }
    [[ $in_block_comment -eq 1 ]] && continue

    # Ligne vide ou commentaire ligne
    [[ -z "${line// }" ]] && continue
    echo "$line" | grep -qE "^[[:space:]]*//" && continue

    local name
    name="$(extract_ts_name "$line")"
    check_name_ts "$file" "$lineno" "$name"

  done < "$file"
}

scan_py_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Commentaires / lignes vides
    [[ -z "${line// }" ]] && continue
    echo "$line" | grep -qE "^[[:space:]]*#" && continue

    # def name( ou async def name(
    if echo "$line" | grep -qE "^[[:space:]]*(async[[:space:]]+)?def[[:space:]]+[a-z_][a-zA-Z0-9_]*[[:space:]]*\("; then
      local name
      name=$(echo "$line" | sed -E "s/^[[:space:]]*(async[[:space:]]+)?def[[:space:]]+([a-z_][a-zA-Z0-9_]*)[[:space:]]*\(.*/\2/")

      # Méthodes spéciales Python (dunder), tests, exemptions framework
      echo "$name" | grep -qE "^__.*__$" && continue
      echo "$name" | grep -qE "^test_" && continue
      echo "$name" | grep -qE "^(${EXEMPT_PATTERN})$" && continue

      # Préfixe attendu en snake_case — méthodes privées : ignore les underscores de tête
      local bare_name
      bare_name=$(echo "$name" | sed -E "s/^_+//")
      if ! echo "$bare_name" | grep -qE "$PREFIX_REGEX_PY_EFFECTIVE"; then
        echo "⚠️ PREFIX   ${file}:${lineno}  '${name}'"
        echo "   → ne commence pas par un préfixe approuvé — ajoute-le dans vocabulary/custom.md si intentionnel"
        WARNINGS=$((WARNINGS + 1))
      fi

      # Verbe composé Python : fetch_and_save, process_or_skip
      if echo "$name" | grep -qE "_(and|or)_"; then
        echo "❌ COMPOUND ${file}:${lineno}  '${name}'"
        echo "   → verbe composé interdit (and/or)"
        ERRORS=$((ERRORS + 1))
      fi
    fi

  done < "$file"
}

scan_rb_file() {
  local file="$1"
  local lineno=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Commentaires / lignes vides
    [[ -z "${line// }" ]] && continue
    echo "$line" | grep -qE "^[[:space:]]*#" && continue

    # def name, def self.name — prédicats (?) et bangs (!) inclus
    if echo "$line" | grep -qE "^[[:space:]]*def[[:space:]]+"; then
      local raw
      raw=$(echo "$line" | sed -E "s/^[[:space:]]*def[[:space:]]+(self\.)?([a-zA-Z_][a-zA-Z0-9_]*[?!]?).*/\2/")
      # Méthodes opérateurs (def ==, def [], …) → pas un identifiant, skip
      echo "$raw" | grep -qE "^[a-zA-Z_][a-zA-Z0-9_]*[?!]?$" || continue

      # Prédicat Ruby : `active?` = préfixe verify implicite → exempt
      [[ "$raw" == *\? ]] && continue

      local name="${raw%!}"

      # Conventions Ruby/Rails, tests, exemptions framework
      echo "$name" | grep -qE "^(${EXEMPT_RUBY})$" && continue
      echo "$name" | grep -qE "^test_" && continue
      echo "$name" | grep -qE "^(${EXEMPT_PATTERN})$" && continue

      local bare_name
      bare_name=$(echo "$name" | sed -E "s/^_+//")
      if ! echo "$bare_name" | grep -qE "$PREFIX_REGEX_PY_EFFECTIVE"; then
        echo "⚠️ PREFIX   ${file}:${lineno}  '${name}'"
        echo "   → ne commence pas par un préfixe approuvé — ajoute-le dans vocabulary/custom.md si intentionnel"
        WARNINGS=$((WARNINGS + 1))
      fi

      if echo "$name" | grep -qE "_(and|or)_"; then
        echo "❌ COMPOUND ${file}:${lineno}  '${name}'"
        echo "   → verbe composé interdit (and/or)"
        ERRORS=$((ERRORS + 1))
      fi
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
echo "prefixes : ${ERRORS} erreur(s), ${WARNINGS} warning(s)"
echo "RESULT:prefixes:errors=${ERRORS}:warnings=${WARNINGS}"
exit $((ERRORS > 0 ? 1 : 0))
