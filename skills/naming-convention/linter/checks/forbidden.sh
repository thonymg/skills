#!/usr/bin/env bash
# checks/forbidden.sh
# Détecte les patterns interdits dans les identifiants :
#   1. Mots vagues (data, info, temp, flag…)           → erreur VAGUE
#   2. Noms numérotés (status2, user1, error3…)         → erreur NUMBERED
#   3. Termes ambigus sans unité (duration, timeout…)   → erreur UNIT
#   4. SCREAMING_SNAKE_CASE sur des non-constantes      → erreur SCREAMING
#
# Toutes les violations de ce check sont structurelles → erreurs (pas de warning).
# Dernière ligne machine-parsable : RESULT:forbidden:errors=N:warnings=0
#
# Usage: ./checks/forbidden.sh [TARGET_DIR]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/vocabulary.sh"

TARGET="${1:-.}"
init_vocabulary "$TARGET"

ERRORS=0

report() {
  local file="$1" lineno="$2" tag="$3" name="$4" msg="$5"
  echo "❌ ${tag}  ${file}:${lineno}  '${name}'"
  echo "   → ${msg}"
  ERRORS=$((ERRORS + 1))
}

# Retire strings et commentaires de fin de ligne
strip_code() {
  sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g; s|//.*||; s|#.*||" <<< "$1"
}

# Faux positifs connus pour les noms « numérotés »
NUMBERED_EXEMPT="^(h[1-6]|col[0-9]+|row[0-9]+|md[0-9]+|lg[0-9]+|sm[0-9]+|xl[0-9]+|px[0-9]+|mt[0-9]+|mb[0-9]+|utf8|utf16|base64|sha1|sha256|sha512|md5|s3|ec2|oauth2|http2|http3|es6|es2015|i18n|a11y|x509)$"

check_file() {
  local file="$1"
  local lineno=0 line

  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))

    # Lignes de commentaire entières
    grep -qE '^[[:space:]]*(//|#|\*|/\*)' <<< "$line" && continue
    [[ -z "${line// }" ]] && continue

    local stripped
    stripped=$(strip_code "$line")

    # ── 1. MOTS VAGUES ── identifiant exactement égal à un mot vague
    local word
    for word in $(tr '|' ' ' <<< "$FORBIDDEN_WORDS_EFFECTIVE"); do
      if grep -qE "(^|[^a-zA-Z0-9_])${word}([^a-zA-Z0-9_]|\$)" <<< "$stripped"; then
        report "$file" "$lineno" "VAGUE   " "$word" "mot vague interdit — utilise un terme précis du vocabulaire"
        break  # une seule violation VAGUE par ligne
      fi
    done

    # ── 2. NOMS NUMÉROTÉS ── identifiant se terminant par des chiffres
    local matches
    matches=$({ grep -oE "[a-zA-Z][a-zA-Z_]*[0-9]+" <<< "$stripped" || true; } \
      | { grep -vE "$NUMBERED_EXEMPT" || true; })
    if [[ -n "$matches" ]]; then
      local m
      while IFS= read -r m; do
        report "$file" "$lineno" "NUMBERED" "$m" "identifiant numéroté interdit — nomme le concept explicitement"
      done <<< "$matches"
    fi

    # ── 3. TERMES AMBIGUS SANS UNITÉ ── duration → durationInSeconds, etc.
    for word in $(tr '|' ' ' <<< "$AMBIGUOUS_UNITS_EFFECTIVE"); do
      if grep -qE "(^|[^a-zA-Z0-9_])${word}([^a-zA-Z0-9_]|\$)" <<< "$stripped" \
         && ! grep -qE "${word}(In)?[A-Z_]" <<< "$stripped"; then
        report "$file" "$lineno" "UNIT    " "$word" "terme ambigu sans unité — ex: ${word}InSeconds, ${word}InMs, ${word}InBytes"
      fi
    done

    # ── 4. SCREAMING_SNAKE_CASE SUR var/let ──
    if grep -qE "^[[:space:]]*(var|let)[[:space:]]+[A-Z][A-Z0-9_]+" <<< "$line"; then
      local name
      name=$(sed -E "s/^[[:space:]]*(var|let)[[:space:]]+([A-Z][A-Z0-9_]+).*/\2/" <<< "$line")
      report "$file" "$lineno" "SCREAMING" "$name" "SCREAMING_SNAKE_CASE réservé aux constantes (const)"
    fi

  done < "$file"
}

# ── Application sur tous les fichiers ────────────────────────────────────────

while IFS= read -r -d '' f; do
  check_file "$f"
done < <(find "$TARGET" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.rb" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/vendor/*" -print0)

echo ""
echo "forbidden : ${ERRORS} erreur(s), 0 warning(s)"
echo "RESULT:forbidden:errors=${ERRORS}:warnings=0"
exit $((ERRORS > 0 ? 1 : 0))
