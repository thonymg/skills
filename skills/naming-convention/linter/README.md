# Linter — Convention de nommage

Scripts bash qui mécanisent les règles **déterministes** du skill `naming-convention`.  
Pas d'AST, pas de dépendances — `grep` + `sed` + `bash` uniquement.

## Usage

```bash
# Scanner tout un projet
./lint.sh /chemin/vers/projet

# Un seul check
./lint.sh /chemin/vers/projet --only prefixes

# Mode CI (résumé uniquement, sortie propre)
./lint.sh /chemin/vers/projet --summary --no-color

# Sortie machine (JSON)
./lint.sh /chemin/vers/projet --json

# Depuis le projet cible (cd dedans d'abord)
cd mon-projet && /path/to/linter/lint.sh .
```

**Exit code** : `0` si aucune **erreur**, `1` sinon → intégrable en pre-commit ou CI.

**Erreurs vs warnings** : les violations *structurelles* (verbe composé, mot vague,
nom numéroté, terme sans unité, SCREAMING sur var/let, suffixe seul, casse de fichier)
sont des **erreurs** et font échouer la CI. Les mots simplement *hors vocabulaire*
(préfixe inconnu, entité inconnue devant un suffixe) sont des **warnings** : ils
s'affichent mais ne bloquent pas — ajoute les mots intentionnels dans
`vocabulary/custom.md`.

Chaque check émet une dernière ligne machine-parsable
`RESULT:<check>:errors=N:warnings=M` — c'est la seule ligne que `lint.sh` (et les
tests) parsent ; un check qui crashe est signalé comme tel au lieu de produire un
compteur fantaisiste.

---

## Checks disponibles

| Script | Tag | Sévérité | Ce qu'il vérifie |
|--------|-----|----------|-----------------|
| `checks/casing-files.sh` | `CASING` | erreur | Casse des fichiers **par langage** : kebab (JS/TS/CSS), snake (Python/Ruby/Dart), Pascal (Java/Kotlin/C#) |
| `checks/prefixes.sh` | `PREFIX` | warning | Méthodes sans préfixe approuvé |
| `checks/prefixes.sh` | `COMPOUND` | erreur | Verbes composés (`And`/`Or`) |
| `checks/forbidden.sh` | `VAGUE` / `NUMBERED` / `UNIT` / `SCREAMING` | erreur | Mots vagues, noms numérotés, termes sans unité, SCREAMING sur var/let |
| `checks/class-suffixes.sh` | `SUFFIX` | erreur | Classes sans suffixe infra/UI reconnu (skip les noms gérés par standalone) |
| `checks/standalone-suffixes.sh` | `STANDALONE` | erreur | Suffixe seul comme nom de classe (Manager, Handler…) |
| `checks/standalone-suffixes.sh` | `ENTITY?` | warning | Entité inconnue devant un suffixe (`DataManager`) |

**Langages scannés** : TypeScript/JavaScript, Python, **Ruby/Rails**.
Spécificités Ruby prises en compte :

- prédicats `active?` exempts du contrôle de préfixe (le `?` remplace `is_`/`has_`) ;
- actions REST Rails (`index`, `show`, `new`, `edit`, `destroy`…) et hooks de
  migration (`up`, `down`, `change`, `perform`) exemptés ;
- classes `< ActiveRecord::Migration` ignorées (noms verbe-first légitimes) ;
- classes de base `Application*` (ApplicationController, ApplicationRecord…) ignorées ;
- pluriels Rails tolérés : `OrdersController` → entité `Order` ✅ ;
- fichiers de migration timestampés (`20240101120000_create_orders.rb`) acceptés.

## Tests

```bash
bash ../../../tests/run-linter-tests.sh   # ou npm test depuis la racine du repo
```

Fixtures avec compteurs attendus dans `tests/fixtures/` + `tests/expected.json`.

---

## Ce que le linter NE peut PAS faire

Ces règles restent de la responsabilité du LLM / du reviewer humain :

| Règle | Pourquoi non automatisable |
|-------|---------------------------|
| Choisir `get` vs `fetch` vs `find` | Requiert comprendre sync/async/nullable |
| Redondance contextuelle `user.getUserName()` | Nécessite l'analyse du type de l'appelant |
| Pertinence de l'entité choisie | Sémantique — `Order` vs `Cart` vs `Item` |
| Décision d'ajout dans `custom.md` | Jugement humain |

---

## Étendre le vocabulaire

1. Ajoute tes mots dans `vocabulary/custom.md` du skill
2. Les scripts lisent automatiquement ce fichier s'il est dans le projet cible  
   (cherche `*/vocabulary/custom.md` au moment du lint)

## Intégration pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: naming-convention
        name: Naming Convention Lint
        entry: /path/to/linter/lint.sh
        language: script
        pass_filenames: false
        args: ["."]
```

## Intégration package.json

```json
{
  "scripts": {
    "lint:naming": "/path/to/linter/lint.sh ."
  }
}
```
