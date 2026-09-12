# Linter — Convention de nommage

Mécanise les règles **déterministes** du skill `naming-convention`.
Moteur : `nc-lint.pl` (Perl 5 de base). Zéro dépendance, lecture seule, un seul processus.

## D'où vient le gain (précision d'attribution)

L'ancien moteur (5 scripts bash, ~950 lignes, ligne par ligne) mettait 7 min 07 s sur
234 fichiers, avec ~85 % de faux positifs sur du code conforme. Le nouveau : 0,07 s,
0 faux positif sur le même corpus.

**L'essentiel vient du principe ci-dessous (identifiants déclarés, une passe par
fichier), pas de Perl.** Mesuré : le même principe réécrit en bash nu tombe déjà à
~0,7 s sur ces 234 fichiers — l'architecture explique un facteur ~585, Perl
n'ajoute qu'un facteur ~10 par-dessus (un seul processus, hash natifs pour le
vocabulaire). La précision (0 %→100 %) et le rappel (73 %→100 %) viennent
entièrement de la réécriture identifiant-first, dans n'importe quel langage.

## Principe : orienté identifiant, pas orienté ligne

Le linter extrait d'abord les identifiants **déclarés** (fonction, méthode, classe,
composant, variable, propriété, fichier), puis teste l'identifiant. Il ne teste jamais
la ligne de texte brute.

C'est ce qui élimine par construction — pas par liste d'exceptions — les faux positifs
sur les attributs JSX (`data-testid`), les clés d'objet de style (`{ width: 100 }`),
les sites d'appel (`next(error)`, `clearTimeout(ref)`), le destructuring d'API tierces
(`const { data } = useQuery()`) et les liaisons d'import (`const User = require(…)`).
Et c'est ce qui permet d'attraper les tokens **à l'intérieur** d'un identifiant :
`getUserData` est signalé, `data-testid` ne l'est pas.

Corollaire : un identifiant déclaré une fois = **un** finding, quel que soit son nombre
d'usages.

## Usage

```bash
./lint.sh <fichier-ou-dossier> [--json] [--only CHECK] [--summary] [--no-color]

./lint.sh src/user-service.ts            # un seul fichier (usage typique de l'agent)
./lint.sh .                              # tout le projet
./lint.sh . --only prefixes              # un seul check
./lint.sh . --json                       # sortie machine, courte
```

**Exit code** : `0` si aucune erreur, `1` sinon → intégrable en pre-commit ou CI.

## Checks

| Check | Règles | Sévérité |
|---|---|---|
| `casing-files` | `CASING` — casse du nom de fichier, par langage | erreur |
| `casing-identifiers` | `CASING` `SCREAMING` — casse de l'identifiant selon son type et son langage | erreur |
| `prefixes` | `PREFIX` `COMPOUND` — préfixe hors vocabulaire, verbe composé | erreur |
| `forbidden` | `VAGUE` `NUMBERED` (erreur), `UNIT` (warning) | mixte |
| `class-suffixes` | `SUFFIX` — classe (erreur) / composant (warning) sans suffixe reconnu | mixte |
| `standalone-suffixes` | `STANDALONE` (erreur), `ENTITY?` (warning) | mixte |

**Erreurs vs warnings** : une violation du vocabulaire ou de la structure est une
**erreur** et bloque la CI. Les jugements contextuels (`UNIT`, `ENTITY?`, composant sans
suffixe UI) sont des **warnings**.

`UNIT` ne s'applique qu'aux **unités de temps** (`duration`, `timeout`, `delay`,
`interval`, `ttl`) : `width`/`height`/`size` ont une unité implicite imposée par la
plateforme, les signaler est du bruit.

Chaque check émet une ligne machine-parsable `RESULT:<check>:errors=N:warnings=M`.

## Langages

| | Identifiants | Nom de fichier |
|---|---|---|
| TypeScript / JavaScript / TSX / JSX | ✅ | ✅ kebab ou Pascal |
| Python | ✅ | ✅ snake |
| Ruby / Rails | ✅ | ✅ snake + migrations timestampées |
| Dart | — | ✅ snake |
| Java / Kotlin / C# | — | ✅ Pascal |
| CSS / SCSS / Sass / Less | — | ✅ kebab (+ partiels `_`, `*.module.*` exclus) |

Spécificités prises en compte : composants React (fonction ou `const` PascalCase dans un
`.tsx`/`.jsx`, y compris paramètres multi-lignes), prédicats Ruby (`active?`), actions REST
Rails, migrations ActiveRecord, classes `Application*`, pluriels Rails
(`OrdersController` → entité `Order`), dunders Python, conventions de test.

## Vocabulaire

Lu au **runtime** depuis `../vocabulary/*.md` — source unique de vérité, pas de copie à
resynchroniser.

Le projet cible peut étendre le vocabulaire via son propre `vocabulary/custom.md`
(même format que celui du skill, qui sert de gabarit). Les mots sont **catégorisés par
section** : un mot ajouté sous « Custom Entity Suffixes » vaut comme entité, pas comme
préfixe.

Recherché à la fois **en descendant** (un `vocabulary/custom.md` sous la cible) et **en
remontant** depuis la cible jusqu'à la racine git (un `vocabulary/custom.md` au-dessus).
Ce second sens est ce qui permet de linter un seul fichier profond dans l'arbre — le cas
d'usage principal de l'agent — en trouvant quand même le vocabulaire défini à la racine
du projet.

## Ce que le linter NE peut PAS vérifier

| Règle | Pourquoi |
|---|---|
| `get` vs `fetch` vs `find` | demande de savoir si c'est sync / async / nullable |
| Redondance contextuelle `user.getUserName()` | demande le type de l'appelant |
| Pertinence de l'entité choisie | sémantique — `Order` vs `Cart` vs `Item` |
| Décision d'ajout dans `custom.md` | jugement humain |

## Tests

```bash
bash ../../../tests/run-linter-tests.sh
```

Quatre fixtures : `violations` (compteurs attendus par check), `clean`, `custom-vocab`, et
`realistic` — du vrai code React/TS/Python conforme, qui **doit** sortir 0 erreur. C'est le
test anti-faux-positifs : sans lui, rien n'empêche le bruit de revenir à la prochaine
modification de regex.

## Intégration pre-commit

`lint.sh` accepte plusieurs cibles (fichiers et/ou dossiers) en argument.
Laisser pre-commit passer les fichiers **stagés** (`pass_filenames: true`) plutôt
que de scanner tout le repo à chaque commit : sur un projet existant qui a déjà
des violations, `args: ["."]` + `pass_filenames: false` bloquerait *tous* les
commits futurs, même ceux qui ne touchent aucun fichier fautif.

```yaml
repos:
  - repo: local
    hooks:
      - id: naming-convention
        name: Naming Convention Lint
        entry: /path/to/linter/lint.sh
        language: script
        pass_filenames: true
        types_or: [ts, tsx, javascript, jsx, python, ruby]
```

**Adoption sur un repo existant** : lancer d'abord `./lint.sh . --summary` pour
chiffrer la dette avant de brancher le hook — un legacy repo a presque toujours
des violations `casing-files` (fichiers déjà nommés en camelCase, etc.) qu'il
faut choisir de corriger ou de suivre, pas découvrir en pleine CI.
