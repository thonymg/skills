#!/usr/bin/env bash
# Checks the fix-root ledger — the written trace of the diagnosis — so that
# "cited", "rejected", "minimal" and "stop retrying" are checked by a script
# instead of self-reported, and so a killed hypothesis is never re-tested
# after the context was compacted.
#
# Usage:
#   check-ledger.sh [--final] [--max-lines N] [<ledger>]     (default .fix-root/ledger)
#
# Ledger format — one entry per line, fields separated by `|`, `#` comments:
#   track | short|full|regression
#   repro | <command that exits non-zero while the bug is present>
#   H1    | open|killed|confirmed | <path:line> | <statement> | <evidence>
#   fix   | H1 | fail|pass                 one line per verify-test-first run
#   allow | <path> | <reason>              extra file the fix may touch (sibling occurrence)
# Paths are relative to the repository root.
#
# Always checked: one track, a repro, every killed/confirmed hypothesis cites
# a path:line that exists, at most one confirmed, no duplicate statements,
# full track >= 3 hypotheses, short track exactly 1, and no hypothesis with 2
# failed fixes (a failed red->green refutes the diagnosis: re-diagnose, don't
# keep retouching the fix).
#
# --final adds: exactly one confirmed hypothesis, and the diff against HEAD
# only touches the confirmed file, `allow` paths and test files, with no
# rename and at most --max-lines (default 40) changed non-test lines.
#
# Exit codes: 0 = ledger valid, 1 = violations (listed), 2 = usage error.
set -u

die() { echo "check-ledger: $*" >&2; exit 2; }
final=0; max_lines=40; ledger=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --final) final=1; shift ;;
    --max-lines) [ "$#" -ge 2 ] || die "--max-lines needs a value"; max_lines="$2"; shift 2 ;;
    -*) die "unknown option: $1" ;;
    *) ledger="$1"; shift ;;
  esac
done
case "$max_lines" in (*[!0-9]*|"") die "--max-lines takes an integer" ;; esac

root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
ledger="${ledger:-$root/.fix-root/ledger}"
[ -f "$ledger" ] || die "ledger not found: $ledger (create it at step 1, add .fix-root to .git/info/exclude)"
ledger="$(cd "$(dirname "$ledger")" && pwd)/$(basename "$ledger")"
cd "$root" || die "cannot cd to $root"

errors=()
err() { errors+=("$*"); }
trim() { sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$1"; }

track=""; repro=""; n_hyp=0; confirmed_file=""; n_confirmed=0
hyp_ids=" "; statements=""; allowed=""; fails=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$(trim "$line")" in ""|\#*) continue ;; esac
  IFS='|' read -r f1 f2 f3 f4 _ <<<"$line"
  f1="$(trim "$f1")"; f2="$(trim "${f2:-}")"; f3="$(trim "${f3:-}")"; f4="$(trim "${f4:-}")"
  case "$f1" in
    track) track="$f2" ;;
    repro) repro="$f2" ;;
    allow) allowed="$allowed$f2"$'\n' ;;
    fix)
      case "$hyp_ids" in *" $f2 "*) ;; *) err "fix line names unknown hypothesis '$f2'" ;; esac
      [ "$f3" = fail ] && fails="$fails$f2"$'\n' ;;
    H[0-9]*)
      n_hyp=$((n_hyp + 1)); hyp_ids="$hyp_ids$f1 "
      case "$f2" in open|killed|confirmed) ;; *) err "$f1: status '$f2' is not open|killed|confirmed" ;; esac
      [ -n "$f4" ] || err "$f1: no statement"
      norm="$(tr '[:upper:]' '[:lower:]' <<<"$f4" | tr -s '[:space:]' ' ')"
      if [ -n "$norm" ] && grep -qxF -- "$norm" <<<"$statements"; then err "$f1: duplicate of an earlier hypothesis — it was already tested"; fi
      statements="$statements$norm"$'\n'
      if [ "$f2" != open ] || [ -n "$f3" ]; then
        path="${f3%:*}"; num="${f3##*:}"
        if [ -z "$f3" ] || [ "$path" = "$f3" ] || [ -z "$num" ] || [ -n "${num//[0-9]/}" ]; then
          err "$f1: '$f2' needs a path:line citation, got '$f3'"
        elif [ ! -f "$path" ]; then
          err "$f1: cited file does not exist: $path"
        elif [ "$num" -lt 1 ] || [ "$num" -gt "$(wc -l <"$path")" ]; then
          err "$f1: $path has no line $num"
        fi
      fi
      if [ "$f2" = confirmed ]; then n_confirmed=$((n_confirmed + 1)); confirmed_file="${f3%:*}"; fi ;;
    *) err "unknown entry '$f1'" ;;
  esac
done <"$ledger"

case "$track" in
  short)      [ "$n_hyp" -eq 1 ] || err "short track has exactly 1 hypothesis, found $n_hyp — a second one is the signal to escalate: set 'track | full'" ;;
  full)       [ "$n_hyp" -ge 3 ] || err "full track needs >= 3 hypotheses from different angles, found $n_hyp" ;;
  regression) [ "$n_hyp" -ge 1 ] || err "regression track: record the culprit's defect as a hypothesis" ;;
  *) err "track must be short|full|regression, got '${track:-none}'" ;;
esac
[ -n "$repro" ] || err "no repro line — a failing repro comes before any diagnosis"
[ "$n_confirmed" -le 1 ] || err "$n_confirmed confirmed hypotheses — exactly one root cause"
twice="$(sort <<<"$fails" | uniq -d | sed '/^$/d')"
[ -z "$twice" ] || err "2 failed fixes for $(tr '\n' ' ' <<<"$twice")— the diagnosis is refuted: mark it killed and re-diagnose, don't retouch the fix again"

if [ "$final" -eq 1 ]; then
  [ "$n_confirmed" -eq 1 ] || err "--final needs exactly one confirmed hypothesis, found $n_confirmed"
  is_test() { grep -Eq '(^|/)(tests?|spec|__tests__)/|(^|/)test_[^/]*$|[._-](test|spec)\.[^/]+$' <<<"$1"; }
  changed=0
  while IFS=$'\t' read -r status p1 p2; do
    [ -n "$status" ] || continue
    case "$status" in R*) err "rename in the diff ($p1 -> $p2) — a rename is a refactor, not part of this fix"; continue ;; esac
    is_test "$p1" && continue
    if [ "$p1" != "$confirmed_file" ] && ! grep -qxF -- "$p1" <<<"$allowed"; then
      err "diff touches $p1 — not the confirmed root cause file nor an 'allow' line"
    fi
  done < <(git diff HEAD -M --name-status; git ls-files --others --exclude-standard | grep -v "^\.fix-root/" | sed 's/^/A\t/')
  while IFS=$'\t' read -r add del p; do
    [ -n "$p" ] && ! is_test "$p" || continue
    [ "$add" = - ] || changed=$((changed + add + del))
  done < <(git diff HEAD -M --numstat)
  while IFS= read -r p; do
    [ -n "$p" ] && ! is_test "$p" && changed=$((changed + $(wc -l <"$p")))
  done < <(git ls-files --others --exclude-standard | grep -v "^\.fix-root/")
  [ "$changed" -le "$max_lines" ] || err "$changed changed non-test lines > --max-lines $max_lines — minimal fix only, note the rest as follow-up"
fi

if [ "${#errors[@]}" -gt 0 ]; then
  printf 'FAIL: %s\n' "${errors[@]}" >&2
  exit 1
fi
echo "PASS: ledger valid (track=$track, $n_hyp hypothesis(es), $n_confirmed confirmed$([ "$final" -eq 1 ] && echo ", diff in scope"))"
exit 0
