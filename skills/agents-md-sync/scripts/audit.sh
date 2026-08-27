#!/usr/bin/env bash
# Invariants 1 (non-répétition), 2 (isolation), 4 (carte synchrone).
# Usage: audit.sh [racine-du-repo]
# Sortie : une ligne par violation, rien si aucune. Exit 1 si violations.
# Portable bash 3.2 (macOS système) : pas de mapfile, `while read` uniquement.
# Pas de `set -u` : bash <4.4 lève "unbound variable" sur `"${arr[@]}"` même
# quand arr=() est déclaré vide — bug connu, pas une faute d'écriture ici.
set -eo pipefail
ROOT="${1:-.}"
cd "$ROOT"

[[ -f AGENTS.md ]] || { echo "AGENTS.md:0 — invariant 4 (carte synchrone) — pas d'AGENTS.md racine"; exit 1; }

# Exclusions : deps vendorisées (.venv, node_modules, site-packages) et
# artefacts de build ne sont jamais des sous-arbres de règles.
EXCLUDES=(-not -path './AGENTS.md'
  -not -path '*/node_modules/*'
  -not -path './docs/*'
  -not -path '*/.venv/*' -not -path '*/venv/*'
  -not -path '*/site-packages/*'
  -not -path '*/.git/*'
  -not -path '*/dist/*' -not -path '*/build/*'
  -not -path '*/staticfiles/*')

FILES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && FILES+=("$line")
done < <(find . -name AGENTS.md "${EXCLUDES[@]}" | sed 's#^\./##' | sort)

VIOLATIONS=0

# --- Invariant 4 : carte synchrone --------------------------------------

CARTE=()
while IFS= read -r line; do
  [[ -n "$line" ]] && CARTE+=("$line")
done < <(awk '/^## Carte/{f=1;next} /^## /{f=0} f && /^- /{print}' AGENTS.md \
  | sed -E 's/^- `?([^`: ]+\/)`?.*/\1/')

for c in "${CARTE[@]}"; do
  if [[ ! -f "${c}AGENTS.md" ]]; then
    echo "AGENTS.md:carte — invariant 4 (carte synchrone) — fantôme: ${c}"
    VIOLATIONS=1
  fi
done

for f in "${FILES[@]}"; do
  dir="${f%AGENTS.md}"
  present=0
  for c in "${CARTE[@]}"; do
    [[ "$c" == "$dir" ]] && present=1 && break
  done
  if [[ "$present" -eq 0 ]]; then
    echo "${f}:1 — invariant 4 (carte synchrone) — orphelin: absent de la Carte"
    VIOLATIONS=1
  fi
done

# --- Invariant 1 : non-répétition ----------------------------------------
# Une règle (ligne "- ...") hors sections Territoire/Redirections ne doit
# apparaître que dans un seul AGENTS.md.

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

for f in "AGENTS.md" "${FILES[@]}"; do
  awk -v file="$f" '
    /^## Territoire/{skip=1; next}
    /^## Redirections/{skip=1; next}
    /^## /{skip=0}
    skip{next}
    /^- / {
      line=$0
      gsub(/^[ \t]+|[ \t]+$/, "", line)
      printf "%s\t%s:%d\n", line, file, NR
    }
  ' "$f" >> "$TMP"
done

DUPS=$(sort -t $'\t' -k1,1 "$TMP" | awk -F'\t' '
  NR==1 { prev=$1; prevloc=$2; next }
  $1==prev {
    if (!emitted) { print prevloc" — invariant 1 (non-répétition) — "prev; emitted=1 }
    print $2" — invariant 1 (non-répétition) — "$1
    next
  }
  { prev=$1; prevloc=$2; emitted=0 }
')
if [[ -n "$DUPS" ]]; then
  echo "$DUPS"
  VIOLATIONS=1
fi

# --- Invariant 2 : isolation ----------------------------------------------
# Aucun AGENTS.md non-racine ne mentionne un chemin hors de son sous-arbre,
# sauf dérogation citée entre backticks dans l'AGENTS.md racine.

TOPDIRS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && TOPDIRS+=("$line")
done < <(printf '%s\n' "${FILES[@]}" | sed -E 's#^([^/]+)/.*#\1#' | sort -u)

ALLOWED=()
while IFS= read -r line; do
  [[ -n "$line" ]] && ALLOWED+=("$line")
done < <(grep -oE '`[^`]*/[^`]*`' AGENTS.md | tr -d '`')

for f in "${FILES[@]}"; do
  own="${f%%/*}"
  for other in "${TOPDIRS[@]}"; do
    [[ "$other" == "$own" ]] && continue
    while IFS=: read -r lineno content; do
      [[ -z "${lineno:-}" ]] && continue
      allowed=0
      for a in "${ALLOWED[@]}"; do
        [[ "$content" == *"$a"* ]] && allowed=1 && break
      done
      if [[ "$allowed" -eq 0 ]]; then
        echo "${f}:${lineno} — invariant 2 (isolation) — mentionne ${other}/ : ${content# }"
        VIOLATIONS=1
      fi
    done < <(grep -nE "(^|[^A-Za-z0-9_])${other}/" "$f" || true)
  done
done

exit "$VIOLATIONS"
