#!/usr/bin/env perl
# nc-lint.pl — Linter de convention de nommage, orienté IDENTIFIANT.
#
# Principe : on extrait d'abord les identifiants DÉCLARÉS (fonction, méthode,
# classe, variable, propriété, fichier), puis on teste l'identifiant. Jamais la
# ligne de texte brute — c'est ce qui élimine les faux positifs sur les attributs
# JSX, les clés d'objet de style, les sites d'appel et le destructuring d'API tierces.
#
# Vocabulaire : lu au runtime depuis ../vocabulary/*.md (source unique de vérité)
# + vocabulary/custom.md du projet cible (catégorisé par section).
#
# Zéro dépendance : Perl 5 de base (JSON::PP fait partie du core depuis 5.14),
# lecture seule, un seul processus — aucun sous-processus. Ce qui demande git
# (`--since`) vit dans lint.sh, qui fabrique une baseline et la passe ici.
#
# Attribution du gain vs l'ancien moteur bash (5 scripts, ligne par ligne) :
# l'essentiel vient du principe ci-dessus (une passe par fichier, jamais par
# ligne) — mesuré : le même principe réécrit en bash nu tombe déjà à ~0,7 s sur
# 234 fichiers (contre 7 min 07 s pour l'ancien moteur). Perl n'ajoute qu'un
# facteur ~10 par-dessus (un seul processus, hash natifs pour le vocabulaire),
# au prix d'un vrai piège de langage : `my (@a, $b) = (...)` engloutit toute
# la liste de droite dans @a — corrigé une fois pendant le développement.
# Ne pas porter ce gain au crédit du langage : c'est l'architecture qui compte,
# le langage est un détail d'implémentation.
#
# Usage: nc-lint.pl [TARGET...] [--only CHECK] [--json] [--summary] [--no-color]
#                   [--baseline FILE.json]
# Exit : 0 si aucune erreur, 1 sinon, 2 si usage invalide (cible introuvable,
#        check inconnu, baseline illisible) — jamais un faux « ✅ ».

use strict;
use warnings;
use File::Basename qw(basename dirname);
use File::Find ();
use Cwd qw(abs_path);
use JSON::PP ();

my $SCRIPT_DIR = dirname(abs_path($0));
my $SKILL_DIR  = abs_path("$SCRIPT_DIR/..");

my @CHECKS = qw(casing-files casing-identifiers prefixes forbidden class-suffixes
                standalone-suffixes vocabulary);

sub usage_error { print STDERR "nc-lint: $_[0]\n"; exit 2 }

# ─── Arguments ───────────────────────────────────────────────────────────────
# Plusieurs cibles sont acceptées (fichiers et/ou dossiers) — nécessaire pour
# qu'un hook pre-commit puisse passer juste les fichiers stagés (`pass_filenames:
# true`) au lieu de scanner tout le repo à chaque commit.
my @TARGETS;
my ($ONLY, $JSON, $SUMMARY, $NOCOLOR, $BASELINE) = ('', 0, 0, 0, '');
while (@ARGV) {
    my $a = shift @ARGV;
    if    ($a eq '--only')     { $ONLY = shift @ARGV // usage_error('--only demande un nom de check') }
    elsif ($a eq '--baseline') { $BASELINE = shift @ARGV // usage_error('--baseline demande un fichier JSON') }
    elsif ($a eq '--json')     { $JSON = 1; $NOCOLOR = 1 }
    elsif ($a eq '--summary')  { $SUMMARY = 1 }
    elsif ($a eq '--no-color') { $NOCOLOR = 1 }
    elsif ($a =~ /^-/)         { usage_error("option inconnue : $a") }
    else                       { push @TARGETS, $a }
}
@TARGETS = ('.') unless @TARGETS;
# Un check mal tapé ou une cible introuvable filtrait tout en silence → « ✅ ».
usage_error("check inconnu : '$ONLY' (attendu : @CHECKS)")
    if $ONLY && !grep { $_ eq $ONLY } @CHECKS;
for my $t (@TARGETS) { usage_error("cible introuvable : $t") unless -e $t }
my $USE_COLOR = (!$NOCOLOR && -t STDOUT) ? 1 : 0;
sub c { my ($code, $s) = @_; $USE_COLOR ? "\e[${code}m$s\e[0m" : $s }

# ─── Vocabulaire ─────────────────────────────────────────────────────────────
my %V = map { $_ => {} } qw(PREFIX ENTITY COLLECTION ATTR INFRA UI);
my %FILE_CASING;   # extension => { kebab|camel|pascal|snake => 1 } — casses ajoutées par custom.md

sub add_word { my ($cat, $w) = @_; $V{$cat}{lc $w} = 1 if $cat && length $w }

my %CASING_ALIAS = (camelcase => 'camel', camel => 'camel', pascalcase => 'pascal', pascal => 'pascal',
                    'kebab-case' => 'kebab', kebabcase => 'kebab', kebab => 'kebab',
                    snake_case => 'snake', snakecase => 'snake', snake => 'snake');

sub parse_vocab_file {
    my ($file, $default_cat, $section_map) = @_;
    open my $fh, '<', $file or return;
    my $cat = $default_cat;
    while (my $line = <$fh>) {
        if ($line =~ /^##+\s*(.+?)\s*$/) {
            my $section = $1;
            $cat = $default_cat;
            for my $k (keys %$section_map) {
                $cat = $section_map->{$k} if $section =~ /\Q$k\E/i;
            }
            next;
        }
        # Section « Custom File Casing » : | `ts` | `camelCase` |
        if (defined $cat && $cat eq 'FILE_CASING') {
            if ($line =~ /^\|\s*`\.?([A-Za-z0-9]+)`\s*\|\s*`?([A-Za-z_-]+)`?/) {
                my $casing = $CASING_ALIAS{lc $2};
                $FILE_CASING{lc $1}{$casing} = 1 if $casing;
            }
            next;
        }
        # Ligne de tableau : | `word` | ... |
        add_word($cat, $1) if $line =~ /^\|\s*`([A-Za-z][A-Za-z0-9_]*)`/;
    }
    close $fh;
}

parse_vocab_file("$SKILL_DIR/vocabulary/prefixes.md",               'PREFIX', {});
parse_vocab_file("$SKILL_DIR/vocabulary/suffixes-entities.md",      'ENTITY',
                 { 'Collection' => 'COLLECTION' });
parse_vocab_file("$SKILL_DIR/vocabulary/suffixes-attributes.md",    'ATTR',   {});
parse_vocab_file("$SKILL_DIR/vocabulary/suffixes-infrastructure.md",'INFRA',  {});
parse_vocab_file("$SKILL_DIR/vocabulary/suffixes-ui.md",            'UI',     {});

# custom.md du PROJET CIBLE (catégorisé par section, pas à plat)
my $custom_map = {
    'Custom Prefixes'                => 'PREFIX',
    'Custom Entity Suffixes'         => 'ENTITY',
    'Custom Attribute Suffixes'      => 'ATTR',
    'Custom Infrastructure Suffixes' => 'INFRA',
    'Custom UI Suffixes'             => 'UI',
    'Custom File Casing'             => 'FILE_CASING',
};
sub find_custom_vocab {
    my ($root) = @_;
    my @hits;
    my $dir = -d $root ? abs_path($root) : abs_path(dirname($root));
    return unless defined $dir;

    # ① Descendant depuis la cible — trouve vocabulary/custom.md sous un dossier.
    File::Find::find({ wanted => sub {
        $File::Find::prune = 1, return if -d $_ && /^(node_modules|\.git|dist|build|vendor)$/;
        push @hits, $File::Find::name
            if -f $_ && $_ eq 'custom.md' && $File::Find::dir =~ m{vocabulary/?$};
    }, no_chdir => 0 }, $dir) if -d $dir;

    # ② Ascendant depuis la cible — cas principal documenté : l'agent lint UN
    # fichier qu'il vient d'écrire, potentiellement profond dans l'arbre, alors
    # que vocabulary/custom.md vit à la racine du projet. Sans ce parcours, le
    # même fichier passe ou échoue selon qu'on lint le fichier ou tout le repo.
    my $walk = $dir;
    while (1) {
        my $candidate = "$walk/vocabulary/custom.md";
        push @hits, $candidate if -f $candidate;
        last if -e "$walk/.git" || $walk eq '/';
        my $parent = dirname($walk);
        last if $parent eq $walk;
        $walk = $parent;
    }

    my %seen; return grep { !$seen{$_}++ } sort @hits;
}
my %custom_seen;
for my $t (@TARGETS) {
    for my $cf (find_custom_vocab($t)) {
        next if $custom_seen{$cf}++;
        parse_vocab_file($cf, undef, $custom_map);
    }
}

# ─── Listes fixes (règles structurelles, pas du vocabulaire) ─────────────────
my %VAGUE       = map { $_ => 1 } qw(data info temp tmp flag misc stuff thing);
my %STANDALONE  = map { $_ => 1 } qw(manager handler helper processor util controller service);
# Unités AMBIGUËS : uniquement le temps (ms vs s). Width/height/size ont une unité
# implicite imposée par la plateforme (px, octets) — les flagger est du bruit.
my %UNIT_AMBIG  = map { $_ => 1 } qw(duration timeout delay interval ttl);
my %NUM_OK      = map { $_ => 1 } qw(base64 sha1 sha256 sha512 md5 utf8 utf16 oauth2
                                     http2 http3 i18n a11y l10n x509 s3 ec2 vec2 vec3 vec4
                                     mat3 mat4 int8 int16 int32 int64 uint8 uint16 uint32
                                     float32 float64 argon2 md4 ipv4 ipv6 base32 crc32);
# Conventions CSS/Tailwind/design-system : niveaux de titre, breakpoints, échelle
# d'espacement — des noms de variable réels et fréquents en front, pas des
# `status2` oubliés.
my $NUM_OK_PATTERN = qr/^(?:h[1-6]|col\d+|row\d+|md\d+|lg\d+|sm\d+|xl\d+|xs\d+|
                          px\d+|mt\d+|mb\d+|ml\d+|mr\d+|mx\d+|my\d+|
                          pt\d+|pb\d+|pl\d+|pr\d+|px\d+|py\d+|z\d+)$/ix;
# Mots structurels admis par la règle VOCAB? sans être du vocabulaire métier :
# les connecteurs des patterns 5 et 8, et les unités que la règle UNIT demande
# d'écrire (`durationInSeconds`).
my %STRUCTURAL  = map { $_ => 1 } qw(to from in by per of
                                     ms millis milliseconds seconds secs minutes mins hours days
                                     weeks months years px bytes kb mb gb percent);
my %EXEMPT_FN = map { $_ => 1 } qw(
    constructor tostring valueof tojson tolocalestring main
    render getderivedstatefromprops componentdidmount componentdidupdate
    componentwillunmount shouldcomponentupdate getsnapshotbeforeupdate
    ngoninit ngondestroy ngafterviewinit ngaftercontentinit ngonchanges ngdocheck
    ngafterviewchecked ngaftercontentchecked
    beforeeach aftereach beforeall afterall setup teardown set_up tear_down
    describe it test expect assert suite bench
    initialize index show new edit destroy up down change perform call
    to_s to_h to_a to_json each method_missing respond_to_missing
);
# Noms imposés par Rails : strong params (`order_params`), helpers d'auth
# (`current_user`, fourni par Devise), conversions surchargées (`to_param`).
my $RB_FRAMEWORK_FN = qr/^(?:current_\w+|to_\w+|\w+_params)$/;
# Fabriques de composants : `const Button = defineComponent(…)` est un composant
# même dans un .ts (test Vue, story), pas une variable.
my $COMPONENT_FACTORY = qr/^(?:defineComponent|defineAsyncComponent|forwardRef|React\.forwardRef|
                             memo|React\.memo|styled\.|styled\()/x;
my %KEYWORDS = map { $_ => 1 } qw(if else for while switch case catch try return throw
    typeof instanceof new delete void yield await super this import export default
    do in of let const var function class extends implements with as from);

# ─── Découpe d'un identifiant en tokens ──────────────────────────────────────
sub tokens {
    my ($name) = @_;
    $name =~ s/^_+//;
    $name =~ s/[?!]$//;
    $name =~ s/_+$//;
    return () unless length $name;
    my @parts = split /_+/, $name;
    my @out;
    for my $p (@parts) {
        $p =~ s/([a-z0-9])([A-Z])/$1 $2/g;
        $p =~ s/([A-Z]+)([A-Z][a-z])/$1 $2/g;
        for my $t (grep { length } split /\s+/, $p) {
            # Chiffres en fin de mot séparés (`Data2` → Data, 2) pour que VAGUE
            # et VOCAB? voient le mot — sauf les noms techniques (`s3`, `sha256`).
            if (!$NUM_OK{lc $t} && $t =~ /^([A-Za-z]+)([0-9]+)$/) { push @out, $1, $2 }
            else                                                  { push @out, $t }
        }
    }
    return @out;
}
sub in_vocab { my ($tok, @cats) = @_; for (@cats) { return 1 if $V{$_}{lc $tok} } 0 }
sub is_entity_like {
    my ($tok) = @_;
    return 1 if in_vocab($tok, 'ENTITY', 'COLLECTION');
    return 1 if $tok =~ /es$/i && in_vocab(substr($tok, 0, -2), 'ENTITY', 'COLLECTION');
    return 1 if $tok =~ /s$/i  && in_vocab(substr($tok, 0, -1), 'ENTITY', 'COLLECTION');
    0;
}
sub is_known_token {
    my ($tok) = @_;
    return 1 if $tok =~ /^[0-9]+$/ || length($tok) == 1;
    return 1 if $STRUCTURAL{lc $tok} || $NUM_OK{lc $tok} || $VAGUE{lc $tok};
    for my $t ($tok, ($tok =~ /es$/i ? substr($tok, 0, -2) : ()), ($tok =~ /s$/i ? substr($tok, 0, -1) : ())) {
        return 1 if in_vocab($t, keys %V);
    }
    0;
}

# ─── Casse ───────────────────────────────────────────────────────────────────
sub is_camel  { $_[0] =~ /^[a-z][a-zA-Z0-9]*$/ }
sub is_pascal { $_[0] =~ /^[A-Z][a-zA-Z0-9]*$/ }
sub is_snake  { $_[0] =~ /^[a-z_][a-z0-9_]*$/ }
sub is_scream { $_[0] =~ /^[A-Z][A-Z0-9_]*$/ }
sub is_kebab  { $_[0] =~ /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/ }

# ─── Findings ────────────────────────────────────────────────────────────────
my @F;
sub add {
    my ($cat, $rule, $sev, $file, $line, $name, $msg) = @_;
    return if $ONLY && $ONLY ne $cat;
    push @F, { cat => $cat, rule => $rule, sev => $sev, file => $file,
               line => $line, name => $name, msg => $msg };
}

my $ADD_CUSTOM = 'propose l\'ajout dans vocabulary/custom.md (après confirmation de l\'utilisateur) si le mot est voulu';

# ─── Vérification d'un identifiant déclaré ───────────────────────────────────
# $id = { name, line, kind, lang, base? }
#   kind ∈ function method component class type accessor property variable const
#   base = classe parente déclarée, si l'extracteur l'a vue
sub check_identifier {
    my ($file, $id) = @_;
    my ($name, $line, $kind, $lang) = @$id{qw(name line kind lang)};
    return unless defined $name && length $name;
    return if $KEYWORDS{lc $name};
    my $bare = $name; $bare =~ s/^_+//; $bare =~ s/[?!]$//;
    my @tok  = tokens($name);
    return unless @tok;
    my $exempt_fn = $EXEMPT_FN{lc $bare} || $bare =~ /^test_/i || $name =~ /^__\w+__$/
                 || ($lang eq 'rb' && $bare =~ $RB_FRAMEWORK_FN);

    # ── 1. CASSE ─────────────────────────────────────────────────────────────
    my $want;
    if ($kind =~ /^(class|type|component)$/) { $want = 'PascalCase' }
    elsif ($kind eq 'const' && is_scream($name)) { $want = undef }
    elsif ($lang eq 'py' || $lang eq 'rb') {
        $want = ($kind eq 'const') ? 'SCREAMING_SNAKE_CASE' : 'snake_case';
    }
    else { $want = 'camelCase' }
    # SCREAMING sur let/var est reporté par la règle SCREAMING — pas deux fois
    my $screaming_var = ($kind eq 'variable' && $lang !~ /^(py|rb)$/ && is_scream($bare));
    if (defined $want && !$screaming_var) {
        my $ok = $want eq 'PascalCase'           ? is_pascal($bare)
               : $want eq 'snake_case'           ? is_snake($bare)
               : $want eq 'SCREAMING_SNAKE_CASE' ? (is_scream($bare) || is_snake($bare))
               :                                   is_camel($bare);
        add('casing-identifiers', 'CASING', 'error', $file, $line, $name,
            "attendu en $want pour un(e) $kind") unless $ok;
    }
    # SCREAMING sur let/var (mutable) — règle explicite du SKILL
    add('casing-identifiers', 'SCREAMING', 'error', $file, $line, $name,
        'SCREAMING_SNAKE_CASE réservé aux constantes immuables (const)')
        if $kind eq 'variable' && $lang !~ /^(py|rb)$/ && is_scream($bare);

    # ── 2. MOT VAGUE (token-level : attrape getUserData, pas data-testid) ────
    my $has_vague = 0;
    for my $t (@tok) {
        next unless $VAGUE{lc $t};
        $has_vague = 1;
        add('forbidden', 'VAGUE', 'error', $file, $line, $name,
            "token vague '$t' — utilise un terme précis du vocabulaire");
        last;
    }

    # ── 3. IDENTIFIANT NUMÉROTÉ (le NOM finit par un chiffre) ────────────────
    add('forbidden', 'NUMBERED', 'error', $file, $line, $name,
        'identifiant numéroté — nomme le concept explicitement')
        if $bare =~ /[0-9]$/ && !$NUM_OK{lc $bare} && !is_scream($bare) && $bare !~ $NUM_OK_PATTERN;

    # ── 4. UNITÉ AMBIGUË (temps uniquement) → warning ────────────────────────
    if (@tok && $UNIT_AMBIG{lc $tok[-1]} && $name !~ /[Ii]n[A-Z_]/) {
        add('forbidden', 'UNIT', 'warning', $file, $line, $name,
            "unité ambiguë — ex: ${bare}InSeconds, ${bare}InMs");
    }

    # ── 5. PRÉFIXE + VERBE COMPOSÉ (fonctions et méthodes) ───────────────────
    my $is_fn = ($kind =~ /^(function|method)$/);
    if ($is_fn && !$exempt_fn) {
        unless ($lang eq 'rb' && $name =~ /\?$/) {   # prédicat Ruby = préfixe verify
            add('prefixes', 'PREFIX', 'error', $file, $line, $name,
                "ne commence pas par un préfixe approuvé — $ADD_CUSTOM")
                unless in_vocab($tok[0], 'PREFIX');
        }
        add('prefixes', 'COMPOUND', 'error', $file, $line, $name,
            'verbe composé interdit — une seule action par méthode')
            if grep { lc($_) eq 'and' || lc($_) eq 'or' } @tok[1 .. $#tok];
    }

    # ── 6. SUFFIXE DE CLASSE / COMPOSANT ─────────────────────────────────────
    # SUFFIX ne s'applique qu'aux classes (Service/Repository/...) : convention
    # à haute conformité dans le vrai code. Un composant React nommé par son
    # rôle sans suffixe générique (`SlideA`, `CarouselLogin`, `App`) est un
    # usage courant et légitime, pas une violation — mesuré : 71 warnings sur
    # un projet réel de 150 fichiers, presque aucun vrai. Le pattern 7 du
    # SKILL.md reste un guide de génération pour le LLM, pas une règle d'audit.
    my ($entity_warned, $suffix_err) = (0, 0);
    if ($kind eq 'class' || $kind eq 'component') {
        my $last = $tok[-1];
        if ($kind eq 'class') {
            my $ok = in_vocab($last, 'INFRA', 'UI', 'COLLECTION')
                  || $bare =~ /Error$/
                  || ($id->{base} // '') =~ /(?:Error|Exception)$/   # classe d'exception
                  || is_entity_like($bare)
                  || is_entity_like($last)
                  || $STANDALONE{lc $bare};   # reporté par STANDALONE — pas deux fois
            unless ($ok) {
                $suffix_err = 1;
                add('class-suffixes', 'SUFFIX', 'error', $file, $line, $name,
                    'suffixe non reconnu — attend un suffixe infra/UI ou une entité du vocabulaire');
            }
        }
        # Suffixe structurel seul, ou entité inconnue devant lui — reste vérifié
        # pour les composants : `Manager` ou `DataManager` n'est légitime dans
        # aucun des deux cas.
        if ($STANDALONE{lc $bare}) {
            add('standalone-suffixes', 'STANDALONE', 'error', $file, $line, $name,
                "suffixe seul sans entité — ex: User$bare, Order$bare");
        }
        elsif (@tok > 1 && $STANDALONE{lc $last} && !$has_vague) {
            my $head = join '', @tok[0 .. $#tok - 1];
            unless (is_entity_like($head) || is_entity_like($tok[-2])) {
                $entity_warned = 1;
                add('standalone-suffixes', 'ENTITY?', 'warning', $file, $line, $name,
                    "'$head' n'est pas une entité du vocabulaire — $ADD_CUSTOM");
            }
        }
    }

    # ── 7. VOCABULAIRE FERMÉ (mots du milieu) → warning ──────────────────────
    # Le SKILL déclare invalide tout mot hors vocabulaire ; PREFIX et SUFFIX ne
    # regardent que le premier et le dernier mot. VOCAB? couvre le reste en
    # warning : un mot de domaine légitime ne doit pas bloquer la CI, mais ne
    # doit plus passer en « ✅ » silencieux non plus. Aucune tolérance par type de
    # fichier ni par mot courant : sur un projet à refactoriser, ce bruit EST le
    # travail à faire.
    # Pas de doublon : un mot déjà signalé par une autre règle (COMPOUND, STANDALONE,
    # ENTITY?, SUFFIX, PREFIX) n'est pas répété ici — il reste signalé par celle-là.
    return if $exempt_fn || $entity_warned;
    # Classe d'exception : le SKILL accepte tout nom (« any class ending in Error »).
    return if $bare =~ /Error$/;
    my @check = $is_fn ? @tok[1 .. $#tok] : @tok;
    pop @check if $suffix_err;
    my @unknown = grep { !is_known_token($_)
                         && !$STANDALONE{lc $_}
                         && lc($_) ne 'and' && lc($_) ne 'or' } @check;
    if (@unknown) {
        my %u; @unknown = grep { !$u{lc $_}++ } @unknown;
        add('vocabulary', 'VOCAB?', 'warning', $file, $line, $name,
            'hors vocabulaire : ' . join(', ', @unknown) . " — $ADD_CUSTOM");
    }
}

# ─── EXTRACTEURS ─────────────────────────────────────────────────────────────
# Chaque extracteur retourne la liste des identifiants DÉCLARÉS.
# Discriminant déclaration/appel en TS : la ligne doit finir par `{` ou `;`
# juste après la liste d'arguments — `trackEvent('x')` ou `useEffect(() => {`
# ne matchent pas, `handleClick() {` matche.

my $TS_MODS = qr/(?:export|default|public|private|protected|static|async|override|abstract|readonly|declare)\s+/;

sub extract_ts {
    my ($file, $lines, $is_jsx) = @_;
    my @ids;
    my $in_comment = 0;
    my $lineno = 0;
    for my $raw (@$lines) {
        $lineno++;
        my $l = $raw;
        if ($in_comment) { $in_comment = 0 if $l =~ m{\*/}; next }
        $in_comment = 1 if $l =~ m{/\*} && $l !~ m{\*/};
        next if $l =~ m{^\s*(//|\*|/\*)};
        next if $l =~ /^\s*$/;

        # class / interface / type / enum
        if ($l =~ /^\s*(?:$TS_MODS)*class\s+([A-Za-z_]\w*)(?:\s*<[^>]*>)?(?:\s+extends\s+([\w.]+))?/) {
            push @ids, { name => $1, line => $lineno, kind => 'class', lang => 'ts', base => $2 }; next;
        }
        if ($l =~ /^\s*(?:$TS_MODS)*(?:interface|type|enum)\s+([A-Za-z_]\w*)/) {
            push @ids, { name => $1, line => $lineno, kind => 'type', lang => 'ts' }; next;
        }
        # function
        if ($l =~ /^\s*(?:$TS_MODS)*function\s*\*?\s*([A-Za-z_]\w*)\s*[(<]/) {
            my $n = $1;
            my $kind = ($is_jsx && $n =~ /^[A-Z]/) ? 'component' : 'function';
            push @ids, { name => $n, line => $lineno, kind => $kind, lang => 'ts' }; next;
        }
        # const/let/var — fonction fléchée vs valeur
        if ($l =~ /^\s*(?:export\s+)?(const|let|var)\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(.*)$/) {
            my ($decl, $n, $rhs) = ($1, $2, $3);
            # Liaison d'import : le nom est imposé par le module, pas choisi ici
            next if $rhs =~ /^(?:await\s+)?(?:require|import)\s*\(/;
            my $is_fn = ($rhs =~ /^(?:async\s+)?(?:function\b|\([^()]*\)\s*(?::[^=]*)?=>|[A-Za-z_]\w*\s*=>|<[^>]*>\s*\()/) ? 1 : 0;
            # Dans un fichier JSX, un const PascalCase est un composant — y compris
            # quand la liste de paramètres est sur plusieurs lignes (`= ({` … `}) => {`).
            # Partout, un const PascalCase créé par une fabrique de composants l'est aussi.
            my $is_component = $n =~ /^[A-Z]/ && ($is_jsx || $rhs =~ $COMPONENT_FACTORY);
            my $kind = $is_component ? 'component'
                     : $is_fn        ? 'function'
                     : ($decl eq 'const' ? 'const' : 'variable');
            push @ids, { name => $n, line => $lineno, kind => $kind, lang => 'ts' }; next;
        }
        # destructuring : on ne vérifie QUE les noms choisis par le dev
        #   const { data: userList } = …  → userList vérifié, `data` ignoré (imposé par l'API)
        #   const { data } = …            → ignoré entièrement
        if ($l =~ /^\s*(?:export\s+)?(?:const|let|var)\s*\{([^}]*)\}\s*=/) {
            for my $part (split /,/, $1) {
                push @ids, { name => $1, line => $lineno, kind => 'variable', lang => 'ts' }
                    if $part =~ /:\s*([A-Za-z_]\w*)\s*$/;
            }
            next;
        }
        if ($l =~ /^\s*(?:export\s+)?(?:const|let|var)\s*\[([^\]]*)\]\s*=/) {
            for my $part (split /,/, $1) {
                push @ids, { name => $1, line => $lineno, kind => 'variable', lang => 'ts' }
                    if $part =~ /^\s*([A-Za-z_]\w*)\s*$/;
            }
            next;
        }
        # accesseur get/set → propriété, casse uniquement
        if ($l =~ /^\s+(?:$TS_MODS)*(?:get|set)\s+([A-Za-z_]\w*)\s*\(\s*[^()]*\)\s*(?::[^{;]+)?\s*\{\s*$/) {
            push @ids, { name => $1, line => $lineno, kind => 'property', lang => 'ts' }; next;
        }
        # méthode : ( args sans parens imbriquées ) puis soit `{` (implémentation),
        # soit `: Type;` (signature d'interface). Un `;` nu = appel — `next(error);`
        # et `clearTimeout(ref);` sont rejetés.
        if ($l =~ /^\s+(?:$TS_MODS)*([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\([^()]*\)\s*(?:\{|:[^{;]+[;{])\s*$/) {
            push @ids, { name => $1, line => $lineno, kind => 'method', lang => 'ts' }; next;
        }
        # champ de classe fléché : handleClick = () => {
        if ($l =~ /^\s+(?:$TS_MODS)*([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^()]*\)\s*(?::[^=]*)?=>/) {
            push @ids, { name => $1, line => $lineno, kind => 'method', lang => 'ts' }; next;
        }
        # propriété de classe avec modificateur
        if ($l =~ /^\s+(?:private|public|protected|readonly|static)\s+(?:$TS_MODS)*([A-Za-z_]\w*)\s*[:=]/) {
            push @ids, { name => $1, line => $lineno, kind => 'property', lang => 'ts' }; next;
        }
    }
    return @ids;
}

# Svelte : seul le contenu des blocs <script> est du code (le reste devient des
# lignes vides, les numéros de ligne restent justes), plus deux sortes de noms
# choisis par le dev que l'extracteur TS ligne à ligne ne voit pas : les props
# déstructurées de `$props()` (souvent sur plusieurs lignes) et les snippets.
sub extract_svelte {
    my ($file, $lines) = @_;
    my $text = join "\n", @$lines;
    my ($script, $pos) = ('', 0);
    while ($text =~ /<script\b[^>]*>(.*?)<\/script>/gs) {
        my ($s, $e) = ($-[1], $+[1]);
        (my $gap = substr($text, $pos, $s - $pos)) =~ s/[^\n]//g;
        $script .= $gap . substr($text, $s, $e - $s);
        $pos = $e;
    }
    (my $tail = substr($text, $pos)) =~ s/[^\n]//g;
    $script .= $tail;
    my @ids = extract_ts($file, [ split /\n/, $script, -1 ], 0);
    # Lignes comptées dans le texte où l'offset a été mesuré : $script garde les
    # sauts de ligne de $text mais pas ses offsets.
    my $line_at = sub { my ($src, $at) = @_; 1 + (substr($src, 0, $at) =~ tr/\n//) };
    while ($script =~ /\b(?:let|const)\s*\{(.*?)\}\s*(?::[^=]*)?=\s*\$props\s*\(/gs) {
        my ($body, $start) = ($1, $-[1]);
        my ($depth, $from) = (0, 0);
        for my $i (0 .. length($body)) {
            my $ch = $i < length($body) ? substr($body, $i, 1) : ',';
            $depth++ if $ch =~ /[(\[{]/;
            $depth-- if $ch =~ /[)\]}]/;
            next unless $ch eq ',' && $depth <= 0;
            my $part = substr($body, $from, $i - $from);
            my $off = $from;
            $from = $i + 1;
            my $name = $part =~ /^\s*[\w\$]+\s*:\s*([A-Za-z_]\w*)/ ? $1       # { class: className }
                     : $part =~ /^\s*(?:\.\.\.)?([A-Za-z_]\w*)/   ? $1       # { title }, { a = 1 }, { ...rest }
                     : next;
            my ($lead) = $part =~ /^(\s*)/;
            push @ids, { name => $name, line => $line_at->($script, $start + $off + length $lead), kind => 'variable', lang => 'ts' };
        }
    }
    while ($text =~ /\{#snippet\s+([A-Za-z_]\w*)\s*\(/g) {
        push @ids, { name => $1, line => $line_at->($text, $-[1]), kind => 'variable', lang => 'ts' };
    }
    return @ids;
}

sub extract_py {
    my ($file, $lines) = @_;
    my @ids; my $lineno = 0;
    my $decorator = '';   # dernier décorateur vu, consommé par le `def` suivant
    for my $l (@$lines) {
        $lineno++;
        next if $l =~ /^\s*#/ || $l =~ /^\s*$/;
        if ($l =~ /^\s*@([\w.]+)/) { $decorator = $1; next }
        if ($l =~ /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/) {
            my ($indent, $n) = ($1, $2);   # avant tout autre match, qui écraserait $1/$2
            # @property / @cached_property / @x.setter : un attribut, nommé comme tel
            my $kind = $decorator =~ /(?:^|\.)(?:property|cached_property|setter|getter|deleter)$/ ? 'property'
                     : length($indent) ? 'method' : 'function';
            $decorator = '';
            push @ids, { name => $n, line => $lineno, kind => $kind, lang => 'py' }; next;
        }
        $decorator = '';
        if ($l =~ /^\s*class\s+([A-Za-z_]\w*)\s*(?:\(\s*([\w.]+))?/) {
            push @ids, { name => $1, line => $lineno, kind => 'class', lang => 'py', base => $2 }; next;
        }
        if ($l =~ /^([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*[^=]/) {
            my $n = $1;
            push @ids, { name => $n, line => $lineno,
                         kind => (is_scream($n) ? 'const' : 'variable'), lang => 'py' };
        }
    }
    return @ids;
}

sub extract_rb {
    my ($file, $lines) = @_;
    my @ids; my $lineno = 0;
    for my $l (@$lines) {
        $lineno++;
        next if $l =~ /^\s*#/ || $l =~ /^\s*$/;
        next if $l =~ /ActiveRecord::Migration/;
        if ($l =~ /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/) {
            push @ids, { name => $1, line => $lineno, kind => 'method', lang => 'rb' }; next;
        }
        if ($l =~ /^\s*(?:class|module)\s+([A-Z][\w:]*)(?:\s*<\s*([\w:]+))?/) {
            my ($n, $base) = ($1, $2); $n =~ s/.*:://;
            next if $n =~ /^Application[A-Z]/;
            push @ids, { name => $n, line => $lineno, kind => 'class', lang => 'rb', base => $base }; next;
        }
        if ($l =~ /^\s*([A-Z][A-Z0-9_]*)\s*=\s*[^=]/) {
            push @ids, { name => $1, line => $lineno, kind => 'const', lang => 'rb' }; next;
        }
        if ($l =~ /^\s*([a-z_]\w*)\s*=\s*[^=~]/) {
            push @ids, { name => $1, line => $lineno, kind => 'variable', lang => 'rb' };
        }
    }
    return @ids;
}

# ─── Casse des noms de fichiers ──────────────────────────────────────────────
my %CASING_TEST = (kebab => \&is_kebab, camel => \&is_camel, pascal => \&is_pascal, snake => \&is_snake);

sub check_filename {
    my ($path) = @_;
    my $base = basename($path);
    return if $base =~ /^\./;                       # dotfiles
    return if $base =~ /\.module\./;                # CSS Modules, *.module.css/scss
    return if $base =~ /\.d\.ts$/;                  # déclarations TS
    # Routage par fichiers : `[id].tsx`, `[...slug].tsx` (Next/Nuxt), `+page.ts`
    # (SvelteKit), `_app.tsx`/`_document.tsx` (Next) — noms imposés par le framework.
    return if $base =~ /^[\[+]/;
    my ($stem) = $base =~ /^([^.]+)/;
    return unless defined $stem && length $stem;
    return if $stem =~ /^_(?:app|document|error)$/;
    my ($ext) = $base =~ /\.([A-Za-z0-9]+)$/;
    # Casses ajoutées par le projet (`## Custom File Casing` dans custom.md)
    for my $casing (keys %{ $FILE_CASING{lc($ext // '')} // {} }) {
        return if $CASING_TEST{$casing}->($stem);
    }

    if ($path =~ /\.(css|scss|sass|less)$/) {
        (my $s = $stem) =~ s/^_//;                  # partiel Sass : le _ est obligatoire
        add('casing-files', 'CASING', 'error', $path, 0, $stem,
            "attendu en kebab-case") unless is_kebab($s);
    }
    elsif ($path =~ /\.(py|rb|dart)$/) {
        return if $stem =~ /^(__init__|__main__|conftest|Gemfile|Rakefile)$/;
        return if $path =~ /\.rb$/ && $stem =~ /^[0-9]{8,}_[a-z0-9_]+$/;   # migration Rails
        add('casing-files', 'CASING', 'error', $path, 0, $stem,
            "attendu en snake_case") unless is_snake($stem);
    }
    elsif ($path =~ /\.(java|kt|cs)$/) {
        add('casing-files', 'CASING', 'error', $path, 0, $stem,
            "attendu en PascalCase") unless is_pascal($stem);
    }
    elsif ($path =~ /\.(ts|tsx|js|jsx|mjs|cjs|svelte)$/) {
        add('casing-files', 'CASING', 'error', $path, 0, $stem,
            "attendu en kebab-case (module) ou PascalCase (composant/classe) — une casse propre au projet se déclare dans custom.md")
            unless is_kebab($stem) || is_pascal($stem);
    }
}

# ─── Parcours ────────────────────────────────────────────────────────────────
my @FILES;
my $SKIP_DIR = qr/^(node_modules|\.git|dist|build|vendor|coverage|__pycache__|\.venv|venv|\.next|target|out|tmp)$/;
for my $t (@TARGETS) {
    if (-f $t) { push @FILES, $t }
    elsif (-d $t) {
        File::Find::find({ wanted => sub {
            if (-d $_) { $File::Find::prune = 1 if $_ =~ $SKIP_DIR; return }
            push @FILES, $File::Find::name
                if -f $_ && /\.(ts|tsx|js|jsx|mjs|cjs|svelte|py|rb|dart|java|kt|cs|css|scss|sass|less)$/;
        }, no_chdir => 0 }, $t);
    }
}
{ my %seen_file; @FILES = grep { !$seen_file{$_}++ } @FILES; }

for my $file (sort @FILES) {
    check_filename($file);
    next unless $file =~ /\.(ts|tsx|js|jsx|mjs|cjs|svelte|py|rb)$/;
    open my $fh, '<', $file or next;
    my @lines = <$fh>;
    close $fh;
    chomp @lines;
    my @ids = $file =~ /\.(py)$/      ? extract_py($file, \@lines)
            : $file =~ /\.(rb)$/      ? extract_rb($file, \@lines)
            : $file =~ /\.svelte$/    ? extract_svelte($file, \@lines)
            :                           extract_ts($file, \@lines, ($file =~ /\.(tsx|jsx)$/ ? 1 : 0));
    # Dédup : un identifiant déclaré une fois = un finding, pas un par occurrence
    my %seen;
    for my $id (@ids) {
        next if $seen{"$id->{name}\@$id->{line}"}++;
        check_identifier($file, $id);
    }
}

# ─── Baseline : ne garder que ce qui est NOUVEAU ─────────────────────────────
# Clé indépendante du numéro de ligne (une insertion décale tout le reste) :
# règle + identifiant + nom de fichier. `lint.sh --since <ref>` fabrique la
# baseline depuis git ; ici on se contente de la lire.
sub finding_key { my ($f) = @_; join "\0", $f->{rule}, $f->{name}, basename($f->{file}) }
if ($BASELINE) {
    open my $bh, '<', $BASELINE or usage_error("baseline illisible : $BASELINE");
    my $raw = do { local $/; <$bh> };
    close $bh;
    my $base = eval { JSON::PP->new->decode($raw) } or usage_error("baseline invalide (JSON attendu de --json) : $BASELINE");
    my %known;
    $known{ finding_key($_) }++ for @{ $base->{findings} // [] };
    # Multiset : 2 occurrences dans la baseline masquent 2 findings identiques, pas un 3e.
    @F = grep { my $k = finding_key($_); $known{$k} ? ($known{$k}--, 0) : 1 } @F;
}

# ─── Rapport ─────────────────────────────────────────────────────────────────
my %COUNT = map { $_ => { errors => 0, warnings => 0 } } @CHECKS;
$COUNT{ $_->{cat} }{ $_->{sev} eq 'error' ? 'errors' : 'warnings' }++ for @F;
my $ERRORS   = 0; $ERRORS   += $COUNT{$_}{errors}   for @CHECKS;
my $WARNINGS = 0; $WARNINGS += $COUNT{$_}{warnings} for @CHECKS;
my @SORTED = sort { $a->{file} cmp $b->{file} || $a->{line} <=> $b->{line} || $a->{rule} cmp $b->{rule} } @F;

if ($JSON) {
    # Les erreurs elles-mêmes, pas seulement les compteurs : l'agent doit savoir
    # QUOI corriger sans relancer le linter.
    my $out = {
        target   => (@TARGETS == 1 ? $TARGETS[0] : scalar(@TARGETS) . " cibles"),
        files    => scalar(@FILES),
        checks   => { map { $_ => { errors => $COUNT{$_}{errors} + 0, warnings => $COUNT{$_}{warnings} + 0 } } @CHECKS },
        errors   => $ERRORS + 0,
        warnings => $WARNINGS + 0,
        findings => [ map { { check => $_->{cat}, rule => $_->{rule}, severity => $_->{sev},
                              file => $_->{file}, line => $_->{line} + 0, name => $_->{name},
                              message => $_->{msg} } } @SORTED ],
    };
    print JSON::PP->new->canonical->encode($out), "\n";
    exit($ERRORS > 0 ? 1 : 0);
}

unless ($SUMMARY) {
    for my $f (@SORTED) {
        my $loc = $f->{line} ? "$f->{file}:$f->{line}" : $f->{file};
        my $tag = $f->{sev} eq 'error' ? c('0;31', "❌ " . sprintf('%-10s', $f->{rule}))
                                       : c('0;33', "⚠️  " . sprintf('%-10s', $f->{rule}));
        print "$tag $loc  '$f->{name}'\n";
        print "   → $f->{msg}\n";
    }
}
for my $ch (@CHECKS) {
    next if $ONLY && $ONLY ne $ch;
    print "RESULT:$ch:errors=$COUNT{$ch}{errors}:warnings=$COUNT{$ch}{warnings}\n";
}
print "\n";
print $ERRORS == 0 ? c('0;32', "✅  Aucune erreur — convention respectée.\n")
                   : c('0;31', "❌  $ERRORS erreur(s)\n");
print c('0;33', "⚠️  $WARNINGS warning(s) (n'échouent pas la CI)\n") if $WARNINGS;
exit($ERRORS > 0 ? 1 : 0);
