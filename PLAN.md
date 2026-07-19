# Plan de correction & optimisation — thonymg/skills

Basé sur l'audit du 19/07/2026 (bugs vérifiés par exécution) et la méthodologie
« Don't Ship Skills Without Evals » (P. Schmid, DeepMind).

Principe directeur : **mesurer avant de corriger**. Le harness d'éval se construit
en premier pour établir une baseline, puis chaque phase doit faire monter le score.

---

## Phase 0 — Harness d'éval & baseline (avant toute correction)

> Objectif : rendre chaque bug futur détectable automatiquement. C'est ce qui manquait
> pour attraper `forbidden.sh` mort et la description cassée.

### 0.1 Fixtures pour le linter
- `tests/fixtures/violations/` : fichiers TS + Python contenant chaque type de violation
  (mot vague, identifiant numéroté, terme sans unité, SCREAMING sur let, préfixe invalide,
  verbe composé, classe sans suffixe, suffixe standalone, casse de fichier).
- `tests/fixtures/clean/` : code 100 % conforme (zéro violation attendue).
- `tests/expected.json` : nombre exact de violations attendues par check et par fichier.
- `tests/run-linter-tests.sh` : exécute le linter sur les deux fixtures, compare aux attentes,
  exit 1 si écart. **Baseline actuelle : forbidden.sh détecte 0/4 violations → le test échoue.**

### 0.2 Prompt set pour les skills (15–20 prompts chacun)
- `evals/naming-convention.json` et `evals/archi-vide.json`, format :
  `{id, prompt, should_trigger, expected_checks[]}`.
- Couvrir : cas nominaux (7–8), garde-fous (mots interdits, verbes composés),
  cas hors vocabulaire (doit proposer custom.md), **tests négatifs (2–3)** où le skill
  ne doit PAS se déclencher (ex. « corrige ce bug CSS »).
- Checks déterministes en regex sur la sortie (ex. nom généré matche `^(get|fetch|find|list)…`).
- Exécution via `claude -p` (ou harness cible), 3–5 trials par prompt, environnement propre.

### 0.3 Baseline
- Lancer le tout, noter les scores. Test de retraite : relancer **sans** le skill chargé
  pour mesurer sa valeur ajoutée réelle.

**Livrables : `tests/`, `evals/`, script d'exécution, rapport baseline.**

---

## Phase 1 — Correctifs critiques (P0)

### 1.1 Description du frontmatter `naming-convention` (gain max / effort min)
Remplacer la description actuelle (argument-hint collé par erreur) par une vraie
description de déclenchement :
```yaml
description: Structured naming convention system for code identifiers.
  Use when naming or renaming variables, functions, methods, classes, files,
  DB tables/columns, routes, or CSS classes; when validating identifiers against
  a convention; or when the user mentions naming, camelCase, snake_case,
  kebab-case, prefixes, or suffixes. Enforces a closed vocabulary
  (prefix + entity + suffix) with per-language casing rules.
```
Valider avec les tests négatifs de la Phase 0 (pas de sur-déclenchement).

### 1.2 Réparer `forbidden.sh` (actuellement 100 % inopérant)
- **Crash `set -e`** : remplacer tous les `grep … | while` par
  `while … done < <(grep … || true)` — élimine aussi le bug des compteurs en sous-shell
  (`check_numbered_names`, `check_ambiguous_units`, `check_screaming_on_var`).
- **Regex des mots vagues malformée** : `([[:space:]]:=,\]})>|$)` n'est pas une classe
  de caractères. Corriger en vraie classe : `(^|[^a-zA-Z0-9_])(data|info|…)([^a-zA-Z0-9_]|$)`
  après strip des strings/commentaires.
- Vérifier avec les fixtures : 4/4 violations détectées sur le fichier test.

### 1.3 Brancher `load_custom_vocabulary`
- Appeler le loader dans les 5 checks et fusionner le résultat dans les patterns
  (`PREFIX_PATTERN`, `SUFFIXES_*`). Sans ça, le message « ajoute le mot dans custom.md »
  est un mensonge.
- Ajouter une fixture avec un `custom.md` rempli → le mot custom ne doit plus être flagué.

### 1.4 Casse des fichiers par langage (règle actuelle destructrice)
- `kebab-case tous langages` casse Python (`order-repository.py` non importable), Dart, Java.
- Nouvelle table : kebab-case (JS/TS/CSS/routes), snake_case (Python/Dart/Ruby),
  PascalCase (Java/C# classes). Mettre à jour SKILL.md, `casing-files.sh`,
  `references/language-specific-rules.md`.

### 1.5 Dédupliquer le double comptage
- `class Manager` déclenche `class-suffixes` ET `standalone-suffixes`.
  Faire de standalone un sous-cas prioritaire : si standalone détecté, class-suffixes skip.

**Critère de sortie : tests linter Phase 0 à 100 %, éval de déclenchement > 90 %.**

---

## Phase 2 — Réduction des faux positifs (P1)

### 2.1 Élargir le vocabulaire des préfixes
Constaté sur test : `main`, `subscribe`, `run_migration`, `useUserQuery` flagués.
- Ajouter : `run, start, stop, open, close, load, save, apply, register, subscribe,
  unsubscribe, emit, connect, disconnect, toggle, refresh, retry, notify, render, use`
  (hooks), `on` (handlers) — avec leur ligne « Use when » dans `prefixes.md`.
- Ajouter aux exemptions : `main`, entry points, conventions de test (`test_*`, `describe`, `it`).

### 2.2 Mode `--warn` pour les préfixes hors liste
- Préfixe inconnu = warning (n'échoue pas la CI), violation structurelle
  (verbe composé, mot vague, numéroté) = erreur. Évite que l'équipe désactive le linter.

### 2.3 Résoudre les tokens ambigus
`Item`, `List`, `Page`, `Config`, `Token` figurent dans plusieurs catégories.
- Attribuer une catégorie canonique unique à chaque mot + table de désambiguïsation
  dans SKILL.md (ex. `List` = collection en fin de nom, UI seulement en PascalCase composant).

### 2.4 Robustesse de `lint.sh`
- L'extraction du compteur (`tail -1 | grep -oE "[0-9]+"`) lit un nombre arbitraire si
  un check crashe. Faire émettre par chaque check une ligne machine-parsable
  (`RESULT:<check>:<count>`) et parser celle-là. Sortie `--json` optionnelle.

---

## Phase 3 — Cohérence inter-skills & contenu

### 3.1 archi-vide ↔ naming-convention
- `stubs.md` recommande `makeXStub()` mais `make` n'est pas un préfixe approuvé :
  ajouter `make` au vocabulaire OU ne garder que `createXStub()`/`buildXStub()`.
- Dépendance dure : ajouter un fallback dans SKILL.md
  (« si naming-convention indisponible, appliquer camelCase/PascalCase/kebab-case par défaut »).

### 3.2 Combler les trous d'archi-vide
- La procédure cite Go sans profil : créer `languages/go.md` ou retirer Go.
- Étoffer les patterns (13–23 lignes actuellement) : un squelette de code complet
  par pattern dans le langage de référence (TS), signatures + doc comments.

### 3.3 Réduire la taxe contextuelle de naming-convention
- Le « MANDATORY LOAD » de 3–4 fichiers (~250 lignes) s'applique à tout nommage.
- Ajouter une **table résumée** (liste plate des mots approuvés) directement dans SKILL.md
  pour les cas simples ; réserver la lecture des fichiers vocabulary/ aux cas ambigus
  ou à la validation formelle. Mesurer l'impact tokens avec l'éval d'efficacité.

---

## Phase 4 — Industrialisation & optimisation

### 4.1 Réécrire le linter en Node/TS (le repo a déjà package.json)
- Le bash ligne-par-ligne est lent, fragile (commentaires bloc, strings multilignes)
  et non testable unitairement. Cible : parsing AST léger (ex. regex structurées ou
  ts-morph/tree-sitter), respect de `.gitignore`, sortie JSON + format GitHub Actions.
- Garder `lint.sh` comme wrapper de compat le temps de la migration.

### 4.2 CI GitHub Actions
- Workflow : tests fixtures du linter + shellcheck + évals de déclenchement (si budget API).
- Les évals capability qui atteignent 100 % deviennent des évals de régression.

### 4.3 Cycle de vie des skills
- Ré-exécuter trimestriellement le test de retraite (évals sans skill chargé).
  Si le modèle passe seul, le skill (ou une section) est absorbé → l'alléger.
- Chaque bug remonté par un utilisateur = nouveau cas d'éval.

### 4.4 Hygiène du repo
- `.gitignore` : ajouter `.DS_Store`, `.claude/settings.local.json` (et les retirer de l'index).
- Supprimer ou documenter les dossiers vides (`instructions/`, `sources/`, `scripts/`, `vendor/`).
- README : ajouter une section « Testing » pointant vers `tests/` et `evals/`.

---

## Ordre d'exécution & effort estimé

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | 0.1 Fixtures linter + script de test | ~2 h | Détection de toutes les régressions |
| 2 | 1.1 Description frontmatter | 15 min | Le skill se déclenche enfin |
| 3 | 1.2–1.3 forbidden.sh + custom vocab | ~2 h | Linter enfin fonctionnel |
| 4 | 1.4–1.5 Casse par langage + dédup | ~1 h | Plus de règle destructrice |
| 5 | 0.2–0.3 Évals skills + baseline | ~3 h | Mesure objective |
| 6 | Phase 2 (faux positifs) | ~3 h | Linter utilisable en CI |
| 7 | Phase 3 (cohérence) | ~2 h | Skills alignés |
| 8 | Phase 4 (Node + CI) | 1–2 j | Pérennité |

## Critères de succès globaux

- Tests fixtures : 100 % (baseline actuelle : échec — forbidden.sh détecte 0 violation).
- Éval de déclenchement naming-convention : > 90 % positifs, 0 faux déclenchement sur négatifs.
- Faux positifs du linter sur un vrai projet échantillon : < 5 % des flags.
- CI verte sur chaque PR.
