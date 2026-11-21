#!/usr/bin/env bash
# lint.sh — Point d'entrée du linter de convention de nommage.
# Le moteur est nc-lint.pl (Perl 5 de base, zéro dépendance, lecture seule).
#
# Usage:
#   ./lint.sh [TARGET...] [--only CHECK] [--json] [--summary] [--no-color]
#             [--baseline FILE.json] [--since REF]
#
# TARGET peut être un dossier OU un fichier unique (usage typique de l'agent :
# vérifier le fichier qu'il vient d'écrire).
#
# --since REF : ne signale que ce qui est NOUVEAU depuis REF (ex: HEAD). Sur un
# projet existant, ~3 fichiers sur 4 ont déjà des erreurs que l'agent n'a pas
# introduites ; sans ce mode il les « corrige » en passant (renommages hors
# scope, appelants cassés). La baseline = le linter lancé sur la version REF de
# chaque fichier ; un fichier absent de REF n'a pas de baseline.
#
# Checks : casing-files, casing-identifiers, prefixes, forbidden,
#          class-suffixes, standalone-suffixes, vocabulary
# Exit   : 0 si aucune erreur, 1 sinon, 2 si usage invalide.
set -u
ENGINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nc-lint.pl"

since=""; args=(); targets=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --since) [ "$#" -ge 2 ] || { echo "lint.sh: --since demande une ref git" >&2; exit 2; }
             since="$2"; shift 2 ;;
    --only|--baseline) [ "$#" -ge 2 ] || { echo "lint.sh: $1 demande une valeur" >&2; exit 2; }
             args+=("$1" "$2"); shift 2 ;;
    -*)      args+=("$1"); shift ;;
    *)       targets+=("$1"); shift ;;
  esac
done
[ "${#targets[@]}" -gt 0 ] || targets=(.)

[ -n "$since" ] || exec perl "$ENGINE" "${targets[@]}" ${args[@]+"${args[@]}"}

git rev-parse --verify --quiet "$since^{commit}" >/dev/null \
  || { echo "lint.sh: --since : ref git introuvable : $since" >&2; exit 2; }
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

# Fichiers concernés : la cible elle-même, ou ce qui a changé depuis REF sous
# un dossier (modifiés + non suivis) — les fichiers intacts n'ont rien de nouveau.
files=()
for t in "${targets[@]}"; do
  [ -e "$t" ] || { echo "lint.sh: cible introuvable : $t" >&2; exit 2; }
  if [ -d "$t" ]; then
    while IFS= read -r f; do [ -f "$f" ] && files+=("$f"); done < <(
      { git diff --name-only --relative "$since" -- "$t"; git ls-files --others --exclude-standard -- "$t"; } | sort -u)
  else
    files+=("$t")
  fi
done
if [ "${#files[@]}" -eq 0 ]; then
  echo "Aucun fichier modifié depuis $since sous ${targets[*]} — rien de nouveau à vérifier."
  exit 0
fi

# Version REF de chaque fichier, sous le même nom (la clé de baseline compare le
# basename) ; un sous-dossier par fichier pour éviter les collisions de noms.
i=0; old=()
for f in "${files[@]}"; do
  i=$((i + 1))
  rel="$(git ls-files --full-name --error-unmatch -- "$f" 2>/dev/null)" || continue
  mkdir -p "$work/ref/$i"
  git show "$since:$rel" > "$work/ref/$i/$(basename "$f")" 2>/dev/null && old+=("$work/ref/$i")
done

if [ "${#old[@]}" -gt 0 ]; then
  perl "$ENGINE" "${old[@]}" --json > "$work/baseline.json"
  rc=$?; [ "$rc" -le 1 ] || exit "$rc"
else
  echo '{"findings":[]}' > "$work/baseline.json"
fi
perl "$ENGINE" "${files[@]}" --baseline "$work/baseline.json" ${args[@]+"${args[@]}"}
