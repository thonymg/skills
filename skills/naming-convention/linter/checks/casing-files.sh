#!/usr/bin/env bash
# checks/casing-files.sh
# Vérifie le nommage des fichiers selon leur extension — règle PAR LANGAGE.
#
# Règles :
#   *.css / *.scss                → kebab-case
#   *.py / *.rb / *.dart          → snake_case (importable / convention du langage)
#   *.java / *.kt / *.cs          → PascalCase (fichier = nom de classe)
#   *.ts / *.tsx / *.js / *.jsx   → kebab-case (module) OU PascalCase (composant)
#
# Dernière ligne machine-parsable : RESULT:casing-files:errors=N:warnings=0
#
# Usage: ./checks/casing-files.sh [TARGET_DIR]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/vocabulary.sh"

TARGET="${1:-.}"
init_vocabulary "$TARGET"

ERRORS=0

KEBAB_PATTERN="^[a-z][a-z0-9]*(-[a-z0-9]+)*$"
SNAKE_PATTERN="^[a-z][a-z0-9]*(_[a-z0-9]+)*$"
PASCAL_PATTERN="^[A-Z][a-zA-Z0-9]*$"

# Retire l'extension(s) d'un nom de fichier (gère .test.ts, .spec.ts, etc.)
basename_no_ext() {
  local name
  name="$(basename "$1")"
  echo "${name%%.*}"
}

check() {
  local file="$1" expected="$2" pattern="$3"
  local name
  name="$(basename_no_ext "$file")"
  if ! echo "$name" | grep -qE "$pattern"; then
    echo "❌ CASING  $file"
    echo "   → '$name' attendu en $expected"
    ERRORS=$((ERRORS + 1))
  fi
  return 0
}

# ── CSS / SCSS → kebab-case ──────────────────────────────────────────────────
while IFS= read -r -d '' f; do
  check "$f" "kebab-case" "$KEBAB_PATTERN"
done < <(find "$TARGET" -type f \( -name "*.css" -o -name "*.scss" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -print0)

# ── Python / Ruby / Dart → snake_case ────────────────────────────────────────
while IFS= read -r -d '' f; do
  name="$(basename_no_ext "$f")"
  # Fichiers spéciaux autorisés
  case "$name" in
    __init__|__main__|conftest|Gemfile|Rakefile) continue ;;
  esac
  # Migrations Rails : timestamp + snake_case (20240101120000_create_orders.rb)
  case "$f" in
    *.rb) echo "$name" | grep -qE "^[0-9]{8,}_[a-z0-9_]+$" && continue ;;
  esac
  check "$f" "snake_case" "$SNAKE_PATTERN"
done < <(find "$TARGET" -type f \( -name "*.py" -o -name "*.rb" -o -name "*.dart" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" -print0)

# ── Java / Kotlin / C# → PascalCase (fichier = classe) ───────────────────────
while IFS= read -r -d '' f; do
  check "$f" "PascalCase" "$PASCAL_PATTERN"
done < <(find "$TARGET" -type f \( -name "*.java" -o -name "*.kt" -o -name "*.cs" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/build/*" -print0)

# ── TS / JS → kebab-case ou PascalCase ──────────────────────────────────────
while IFS= read -r -d '' f; do
  name="$(basename_no_ext "$f")"
  # Fichiers de config à la racine autorisés (vite.config, jest.config…)
  case "$name" in
    *config*|*setup*|*env*|index|main|app|server) continue ;;
  esac
  if ! echo "$name" | grep -qE "^([a-z][a-z0-9]*(-[a-z0-9]+)*|[A-Z][a-zA-Z0-9]*)$"; then
    echo "❌ CASING  $f"
    echo "   → '$name' doit être kebab-case (module) ou PascalCase (composant/classe)"
    ERRORS=$((ERRORS + 1))
  fi
done < <(find "$TARGET" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -print0)

echo ""
echo "casing-files : ${ERRORS} erreur(s), 0 warning(s)"
echo "RESULT:casing-files:errors=${ERRORS}:warnings=0"
exit $((ERRORS > 0 ? 1 : 0))
