#!/usr/bin/env bash
# Invariant 3 (contrat additif) — liste les paires interdiction (ancêtre) /
# autorisation (enfant) candidates. Ne tranche jamais : revue humaine requise
# pour juger si l'autorisation contredit réellement l'interdiction.
# Usage: check-additive.sh [racine-du-repo]
# Sortie : rien si aucune paire candidate. Exit 0 toujours (revue, pas verdict).
# Portable bash 3.2 (macOS système) : pas de mapfile, `while read` uniquement.
# Pas de `set -u` : bash <4.4 lève "unbound variable" sur `"${arr[@]}"` même
# quand arr=() est déclaré vide — bug connu, pas une faute d'écriture ici.
set -eo pipefail
ROOT="${1:-.}"
cd "$ROOT"

[[ -f AGENTS.md ]] || { echo "AGENTS.md:0 — pas d'AGENTS.md racine"; exit 0; }

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

FORBID_RE='(interdit|jamais)'
ALLOW_RE='(autoris[ée]|peut |exception)'

for f in "${FILES[@]}"; do
  dir="${f%AGENTS.md}"

  ALLOWLINES=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && ALLOWLINES+=("$line")
  done < <(grep -noE ".*${ALLOW_RE}.*" "$f" || true)
  [[ ${#ALLOWLINES[@]} -eq 0 ]] && continue

  ancestors=("AGENTS.md")
  IFS='/' read -ra PARTS <<< "${dir%/}"
  acc=""
  for p in "${PARTS[@]}"; do
    acc="${acc}${p}/"
    candidate="${acc}AGENTS.md"
    if [[ "$candidate" != "$f" && -f "$candidate" ]]; then
      ancestors+=("$candidate")
    fi
  done

  for anc in "${ancestors[@]}"; do
    FORBIDLINES=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && FORBIDLINES+=("$line")
    done < <(grep -noE ".*${FORBID_RE}.*" "$anc" || true)
    for fl in "${FORBIDLINES[@]}"; do
      for al in "${ALLOWLINES[@]}"; do
        echo "CANDIDAT — ${anc}:${fl%%:*} (interdit) vs ${f}:${al%%:*} (autorise) — revue humaine requise"
        echo "  ancêtre> ${fl#*:}"
        echo "  enfant > ${al#*:}"
      done
    done
  done
done
