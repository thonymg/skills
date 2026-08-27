---
name: agents-md-sync
description: Gère le cycle de vie de la hiérarchie AGENTS.md/CLAUDE.md du projet — création (scaffold un nouveau sous-dossier avec règles locales), synchronisation (Carte racine vs fichiers réels), audit (invariants de non-répétition, isolation, contrat additif, carte synchrone). Déclencheurs — "AGENTS.md", "CLAUDE.md", "scaffold feature", "audit hiérarchie", "synchroniser carte", "créer un nouveau module/dossier avec ses conventions", "vérifier les AGENTS.md".
---

# agents-md-sync

Applique le modèle déjà en place dans ce repo : `AGENTS.md` = contenu
canonique, `CLAUDE.md` = pointeur `@AGENTS.md`, racine = orchestration
uniquement, sous-dossiers = règles locales uniquement (jamais de répétition
d'un ancêtre, jamais de mention d'un voisin hors dérogation explicite).

Trois opérations. Détecter laquelle depuis la demande de l'utilisateur :
"crée/scaffold un AGENTS.md pour X" → `create`. "vérifie/synchronise la
carte" → `sync`. "audit/vérifie la hiérarchie AGENTS.md" → `audit`.

## Opération `create <chemin> <rôle en une ligne>`

1. **Refus si existant.** Si `<chemin>/AGENTS.md` existe déjà : arrêter,
   le dire, ne rien écrire. Jamais d'écrasement.

2. **Inventaire des ressources imposables — OBLIGATOIRE, jamais codé en
   dur** (les ressources évoluent, une liste figée périmerait) :
   - Agents projet : `ls .claude/agents/*.md`. Agents globaux :
     `ls ~/.claude/agents/*.md`.
   - Skills : utiliser la liste des skills disponibles annoncée par le
     système à chaque session (bloc "The following skills are available
     for use with the Skill tool") — elle inclut les skills projet,
     utilisateur ET ceux fournis par des plugins, déjà sous leur forme
     d'invocation correcte (certains préfixés `plugin:skill`, d'autres
     non). Ne PAS se fier à `ls .claude/skills/*/SKILL.md` seul : cette
     commande ne voit aucun skill de plugin (ils vivent sous
     `~/.claude/plugins/**/skills/*/SKILL.md`) et ne peut pas deviner s'il
     faut préfixer le nom.
   - MCP : `.mcp.json` du projet + `claude mcp list` (couvre projet et
     utilisateur). Vérifier spécifiquement `codebase-memory-mcp` — c'est
     l'outil de recherche/exploration de code par défaut pour cet
     utilisateur, à imposer en priorité dès que le sous-arbre contient du
     code.
   - Fusionner les deux portées par nom. Même nom des deux côtés → la
     version PROJET prime ; le signaler dans le rapport final, ne
     référencer que ce nom.
   - Référencer toute ressource par NOM uniquement, jamais par chemin —
     un chemin `~/...` casse pour les autres membres de l'équipe.
   - Une ressource restée uniquement globale mais retenue quand même →
     suffixer sa ligne avec `(global — non versionné, vérifier sa
     présence chez chaque dev)` et le signaler comme risque de
     divergence d'équipe dans le rapport.
   - Avant de lister quoi que ce soit : lire la section `## Outillage
     imposé` de l'`AGENTS.md` racine. Tout ce qui y figure déjà
     (`codebase-memory-mcp`, agents `recon`/`planner`/`builder`/`auditor`,
     `naming-convention`, `ponytail:*`, `micro-optimiz`, `codebase-memory`,
     `fix-root`) est hérité — ne JAMAIS le recopier dans un fichier
     enfant (violerait l'invariant 1). Le fichier enfant n'ajoute que ce
     que la racine ne couvre pas déjà pour ce sous-arbre précis.

3. **Générer `<chemin>/AGENTS.md`** depuis `templates/AGENTS.template.md`
   (placeholders `{{CHEMIN}}`, `{{ROLE}}`, `{{TERRITOIRE}}`, `{{GLOBS}}`,
   `{{RESSOURCES}}`, `{{REDIRECTIONS}}`, `{{REGLES_LOCALES}}`) :
   - **Territoire** : 1-3 lignes, ce que le dossier possède. Jamais une
     description de l'architecture actuelle du code — elle périme.
   - **Modifiable ici** : globs du sous-arbre.
   - **Ressources imposées** : uniquement ce qui est pertinent pour CE
     sous-arbre ET absent de `## Outillage imposé` racine (voir étape 2),
     format directif (`→ utiliser X`, `jamais réimplémenter Y`). Rien de
     spécifique au-delà de la racine → une seule ligne :
     `- Rien au-delà de l'outillage imposé racine (codebase-memory-mcp,
     recon/planner/builder/auditor, naming-convention, ponytail…).`
   - **Redirections** : `Si le besoin est <X> → <module propriétaire>`.
   - **Règles locales** : uniquement des règles ABSENTES de tous les
     ancêtres — lire chaque `AGENTS.md` ancêtre avant d'écrire une ligne
     ici pour vérifier l'absence.
   - Interdictions plutôt qu'explications. Jamais de mention de `docs/`.
     Français, cohérent avec les fichiers existants. Cible ≤ 15 lignes
     hors template vide.

4. **Générer `<chemin>/CLAUDE.md`** : exactement une ligne, `@AGENTS.md`.

5. **Mettre à jour la Carte.** Ajouter `- <chemin>/ : <rôle>` dans la
   section `## Carte` de l'`AGENTS.md` racine, ordre alphabétique par
   chemin. Ne toucher aucune autre section de l'`AGENTS.md` racine, ni
   aucun autre fichier `AGENTS.md`/`CLAUDE.md` existant.

6. **Aucun fichier intermédiaire.** Si un dossier parent du chemin cible
   n'a pas de règles communes propres, il ne reçoit rien.

7. Lancer `audit` (voir plus bas) et rapporter son résultat.

## Opération `sync`

1. Extraire la section `## Carte` de l'`AGENTS.md` racine.
2. Lister les `AGENTS.md` réels avec les mêmes exclusions que l'audit
   (voir `scripts/audit.sh` — dépendances vendorisées, `docs/`, artefacts
   de build exclus ; la commande brute donnée à l'origine,
   `find . -name AGENTS.md -not -path './node_modules/*' -not -path
   './docs/*'`, remonte des faux positifs dans ce repo — `.venv/` et
   `dataformulator/.venv/` contiennent des `AGENTS.md` vendorisés par des
   dépendances Python ; le script exclut aussi `.venv/`, `venv/`,
   `site-packages/`, `.git/`, `dist/`, `build/`, `staticfiles/`).
3. Signaler dans les deux sens :
   - entrées de Carte sans fichier correspondant (fantômes)
   - fichiers `AGENTS.md` sans entrée de Carte (orphelins)
4. Proposer les lignes à ajouter/retirer. **N'écrire qu'après validation
   explicite de l'utilisateur** — jamais d'application automatique.

## Opération `audit`

Exécuter `scripts/audit.sh` (invariants 1, 2, 4) puis
`scripts/check-additive.sh` (invariant 3), fusionner leurs sorties.

- **Invariant 1 — non-répétition.** Chaque règle normalisée (ligne
  commençant par `- `, hors sections `Territoire`/`Redirections`)
  n'apparaît que dans un seul `AGENTS.md`.
- **Invariant 2 — isolation.** Aucun `AGENTS.md` non-racine ne mentionne
  un chemin hors de son propre sous-arbre, sauf dérogation citée entre
  backticks dans l'`AGENTS.md` racine.
- **Invariant 3 — contrat additif.** `check-additive.sh` liste les paires
  candidates (ligne d'interdiction chez un ancêtre / ligne d'autorisation
  chez un enfant) — il ne juge jamais si ça contredit réellement : la
  décision reste humaine.
- **Invariant 4 — carte synchrone.** Équivalent de `sync`.

Sortie : une ligne par violation, format `FICHIER:LIGNE — invariant —
extrait`. Zéro violation sur les deux scripts → une seule ligne :
`OK — N fichiers, 4 invariants` (N = nombre d'`AGENTS.md` trouvés, racine
incluse).

## Contraintes dures

- Ne modifie jamais : `docs/`, `.claude/agents/`, les `AGENTS.md`
  existants autres que la section `## Carte` de la racine (et uniquement
  pendant `create`). Ne supprime jamais rien.
- Toute écriture hors `create` (corrections de `sync`/`audit`) exige une
  validation explicite avant d'écrire.
- Scripts sous `scripts/` : bash portable (3.2 compris — pas de
  `mapfile`, pas de `set -u` sur tableaux potentiellement vides), zéro
  dépendance externe. La rédaction du contenu (Territoire, Ressources
  imposées, Règles locales) reste au jugement du modèle ; la vérification
  reste mécanique.
