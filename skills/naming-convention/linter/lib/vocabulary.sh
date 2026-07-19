#!/usr/bin/env bash
# vocabulary.sh — Source ce fichier dans tous les scripts de lint.
# Vocabulaire extrait directement des fichiers vocabulary/*.md du skill.
#
# Chaque check DOIT appeler `init_vocabulary "$TARGET"` après avoir défini TARGET :
# cela fusionne vocabulary/custom.md du projet cible dans les patterns *_EFFECTIVE.

# ─── PRÉFIXES ────────────────────────────────────────────────────────────────

PREFIXES_READ="get|fetch|find|list"
PREFIXES_WRITE="create|update|delete|add|remove|set|send|upload"
PREFIXES_VERIFY="is|has|can|validate"
PREFIXES_COMPUTE="calculate|count|format"
PREFIXES_TRANSFORM="convert|parse|map|filter|serialize"
PREFIXES_ORCHESTRATE="handle|process|execute|sync"
PREFIXES_INIT="init|build|generate|reset"
PREFIXES_LIFECYCLE="run|start|stop|open|close|load|save|apply|refresh|retry"
PREFIXES_EVENT="register|subscribe|unsubscribe|emit|connect|disconnect|toggle|notify|render|use|on"

PREFIX_PATTERN="${PREFIXES_READ}|${PREFIXES_WRITE}|${PREFIXES_VERIFY}|${PREFIXES_COMPUTE}|${PREFIXES_TRANSFORM}|${PREFIXES_ORCHESTRATE}|${PREFIXES_INIT}|${PREFIXES_LIFECYCLE}|${PREFIXES_EVENT}"

# ─── SUFFIXES INFRA ───────────────────────────────────────────────────────────

SUFFIXES_INFRA="Service|Repository|Controller|Middleware|Router|Gateway|Client|Adapter|Queue|Worker|Factory|Builder|Mapper|Validator|Processor|Handler|Provider|Store|Reducer|Model|DTO|Schema|Enum|Util|Config|Logger|Constant|Mock|Stub|Fixture|Mailer|Migration|Policy|Serializer|Job"

# ─── SUFFIXES UI ──────────────────────────────────────────────────────────────

SUFFIXES_UI="Page|Screen|Layout|Header|Footer|Sidebar|Card|List|Item|Table|Badge|Avatar|Chart|Nav|Menu|Tabs|Breadcrumb|Pagination|Modal|Drawer|Toast|Tooltip|Spinner|Skeleton|Form|Input|Select|Button|Toggle|Checkbox|Icon"

# ─── SUFFIXES ENTITÉS ─────────────────────────────────────────────────────────

SUFFIXES_ENTITY="User|Session|Token|Role|Permission|Order|Cart|Item|Product|Payment|Invoice|Subscription|Message|Notification|Document|Report|Team|Project|Task|Event|Config|Log|Job|Request|Response|Error|Cache|Query"

# ─── SUFFIXES COLLECTIONS ─────────────────────────────────────────────────────

SUFFIXES_COLLECTION="List|Page|Batch|Results"

# ─── SUFFIXES ATTRIBUTS ───────────────────────────────────────────────────────

SUFFIXES_ATTR="Id|Code|Key|Hash|Password|Token|Name|Title|Description|Summary|Content|Status|Type|Priority|Count|Amount|Total|Price|Quantity|Limit|Offset|Date|Timestamp|Duration|Url|Path|Payload|Metadata|Version"

# Tous les suffixes reconnus pour les classes (infra + UI)
ALL_CLASS_SUFFIXES="${SUFFIXES_INFRA}|${SUFFIXES_UI}"

# ─── SUFFIXES STANDALONE INTERDITS ───────────────────────────────────────────
# Ces mots seuls comme nom de classe sont invalides — doivent être précédés d'une entité.

STANDALONE_FORBIDDEN="Manager|Handler|Helper|Processor|Util|Controller|Service"

# ─── MOTS VAGUES INTERDITS ────────────────────────────────────────────────────
# Uniquement des mots vagues structurels (cf. SKILL.md « HARD RULES »).
# value/result/item/element ne sont PAS ici : trop fréquents et légitimes
# (variables de boucle, suffixes d'entité) — voir la table de désambiguïsation.

FORBIDDEN_WORDS="data|info|temp|flag|misc|stuff|thing"

# ─── TERMES AMBIGUS SANS UNITÉ ────────────────────────────────────────────────
# Ces termes doivent être qualifiés d'une unité (ex: durationInSeconds, sizeInBytes)

AMBIGUOUS_UNITS="duration|timeout|interval|delay|size|length|width|height|weight|distance"

# ─── MÉTHODES EXEMPTÉES DU CONTRÔLE DE PRÉFIXE ───────────────────────────────
# Méthodes de cycle de vie / framework / langage / points d'entrée / tests

EXEMPT_METHODS="constructor|toString|valueOf|toJSON|toLocaleString|hasOwnProperty|isPrototypeOf|main"
EXEMPT_REACT="render|getDerivedStateFromProps|componentDidMount|componentDidUpdate|componentWillUnmount|shouldComponentUpdate|getSnapshotBeforeUpdate"
EXEMPT_ANGULAR="ngOnInit|ngOnDestroy|ngAfterViewInit|ngAfterContentInit|ngOnChanges|ngDoCheck|ngAfterViewChecked|ngAfterContentChecked"
EXEMPT_TESTING="beforeEach|afterEach|beforeAll|afterAll|setUp|tearDown|setup|teardown|describe|it|test|expect|assert|suite|bench"
# Ruby/Rails : actions REST des controllers, hooks de migration, conventions du langage
EXEMPT_RUBY="initialize|index|show|new|edit|destroy|up|down|change|perform|call|to_s|to_h|to_a|to_json|each|method_missing"
EXEMPT_PATTERN="${EXEMPT_METHODS}|${EXEMPT_REACT}|${EXEMPT_ANGULAR}|${EXEMPT_TESTING}"

# ─── CHARGEMENT DU VOCABULAIRE CUSTOM ────────────────────────────────────────
# Extrait tous les mots backtickés des tableaux de vocabulary/custom.md
# du projet cible. Liste plate : chaque mot custom est accepté comme préfixe,
# entité ou suffixe de classe (la casse d'usage désambiguïse en pratique).

load_custom_vocabulary() {
  local target="${1:-${TARGET:-.}}"
  local custom_file
  custom_file=$(find "$target" -name "custom.md" -path "*/vocabulary/*" \
    -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -1)
  [[ -z "$custom_file" || ! -f "$custom_file" ]] && return 0

  { grep -E '^\|[[:space:]]*`[a-zA-Z]' "$custom_file" || true; } \
    | sed -E 's/.*`([a-zA-Z][a-zA-Z0-9]*)`.*/\1/' \
    | tr '\n' '|' | sed 's/|$//'
  return 0
}

# Retire un mot d'une liste pipe-séparée
remove_from_list() {
  local list="$1" word="$2"
  { tr '|' '\n' <<< "$list" || true; } | grep -vxF "$word" | paste -sd'|' - || true
  return 0
}

# Initialise les patterns effectifs (core + custom.md du projet cible).
init_vocabulary() {
  local target="${1:-.}"
  local custom
  custom="$(load_custom_vocabulary "$target")" || custom=""

  PREFIX_PATTERN_EFFECTIVE="$PREFIX_PATTERN"
  ENTITY_PATTERN_EFFECTIVE="${SUFFIXES_ENTITY}|${SUFFIXES_COLLECTION}"
  CLASS_SUFFIX_PATTERN_EFFECTIVE="$ALL_CLASS_SUFFIXES"
  FORBIDDEN_WORDS_EFFECTIVE="$FORBIDDEN_WORDS"
  AMBIGUOUS_UNITS_EFFECTIVE="$AMBIGUOUS_UNITS"

  if [[ -n "$custom" ]]; then
    PREFIX_PATTERN_EFFECTIVE="${PREFIX_PATTERN_EFFECTIVE}|${custom}"
    ENTITY_PATTERN_EFFECTIVE="${ENTITY_PATTERN_EFFECTIVE}|${custom}"
    CLASS_SUFFIX_PATTERN_EFFECTIVE="${CLASS_SUFFIX_PATTERN_EFFECTIVE}|${custom}"
    # Un mot approuvé dans custom.md n'est plus ni vague ni ambigu
    local word
    for word in $(tr '|' ' ' <<< "$custom"); do
      FORBIDDEN_WORDS_EFFECTIVE="$(remove_from_list "$FORBIDDEN_WORDS_EFFECTIVE" "$word")"
      AMBIGUOUS_UNITS_EFFECTIVE="$(remove_from_list "$AMBIGUOUS_UNITS_EFFECTIVE" "$word")"
    done
  fi

  # Listes vides → placeholder qui ne matche jamais (évite les regex vides)
  [[ -z "$FORBIDDEN_WORDS_EFFECTIVE" ]] && FORBIDDEN_WORDS_EFFECTIVE="__none__"
  [[ -z "$AMBIGUOUS_UNITS_EFFECTIVE" ]] && AMBIGUOUS_UNITS_EFFECTIVE="__none__"

  # Regex préfixe : camelCase (TS/JS) et snake_case (Python)
  PREFIX_REGEX_EFFECTIVE="^(${PREFIX_PATTERN_EFFECTIVE})[A-Z_]"
  PREFIX_REGEX_PY_EFFECTIVE="^(${PREFIX_PATTERN_EFFECTIVE})(_|$)"
  return 0
}
