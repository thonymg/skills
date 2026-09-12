#!/usr/bin/env bash
# Drives `git bisect run` against a repro predicate and prints the first bad
# commit. The bisection itself is git's; what this adds is the three guards
# that separate a real culprit from a confident wrong answer.
#
# Usage:
#   bisect-run.sh --good <ref> [--bad <ref>] [--keep <path>]... [--repeat N] -- <repro-cmd>
#
# Example:
#   bisect-run.sh --good v1.2.0 --keep test_regression.py -- python3 -B test_regression.py
#
# <repro-cmd> must exit 0 when the behavior is CORRECT and non-zero when the
# bug is present — same polarity as a test. Exit 125 means "this commit can't
# be tested" (broken build, missing dep); git skips it instead of blaming it.
#
# Guards:
#   1. Refuses to start on a dirty working tree. Bisect checks out other
#      commits; uncommitted work is either carried across them, silently
#      changing what you measure, or lost.
#   2. --keep <path> survives the checkouts. A repro that lives on a tracked
#      test file disappears the moment bisect lands before that file existed,
#      and every commit then reports "cannot test" — the classic trap that
#      makes bisect converge on nothing. Kept files are copied out, restored
#      before each run, and removed after so the next checkout stays clean.
#   3. `git bisect reset` always runs, including on interrupt. A repo left
#      mid-bisect is a detached HEAD for whoever opens it next.
#   4. --repeat N runs the predicate N times per commit and calls it good
#      only if all N pass. An intermittent bug makes a single "good" verdict
#      meaningless, and bisect then converges on noise — with exactly the
#      same confident output as a correct run.
#
# Exit codes: 0 = culprit identified, 1 = bisect could not conclude,
# 2 = usage/environment error.
set -u

die() { echo "bisect-run: $*" >&2; exit 2; }

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

good=""; bad="HEAD"; repeat=1; keep=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --good) good="${2:-}"; shift 2 ;;
    --bad)  bad="${2:-}"; shift 2 ;;
    --keep) keep+=("${2:-}"); shift 2 ;;
    --repeat) repeat="${2:-}"; shift 2 ;;
    --) shift; break ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$repeat" in (*[!0-9]*|"") die "--repeat takes a positive integer" ;; esac
[ "$repeat" -ge 1 ] || die "--repeat takes a positive integer"

[ -n "$good" ] || die "usage: bisect-run.sh --good <ref> [--bad <ref>] [--keep <path>]... -- <repro-cmd>"
[ "$#" -ge 1 ] || die "no repro command given after --"
repro_cmd="$*"

git rev-parse --verify --quiet "$good^{commit}" >/dev/null || die "not a commit: $good"
git rev-parse --verify --quiet "$bad^{commit}" >/dev/null || die "not a commit: $bad"

# Guard 1 — never bisect over uncommitted work.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "working tree is dirty — commit or stash first; bisect checks out other commits and would carry or clobber these changes"
fi

workdir="$(mktemp -d)"
keep_dir="$workdir/keep"
predicate="$workdir/predicate.sh"
repo_root="$(git rev-parse --show-toplevel)"
start_ref="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"

cleanup() {
  git bisect reset --quiet >/dev/null 2>&1 || git bisect reset >/dev/null 2>&1
  # The monotonicity re-check below checks out commits after bisect ends;
  # put HEAD back where it started whatever happens.
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$start_ref" ] || git checkout -q "$start_ref" 2>/dev/null
  rm -rf "$workdir"
}
trap cleanup EXIT INT TERM

# Guard 2 — copy kept files out of the tree before any checkout touches them.
mkdir -p "$keep_dir"
for path in "${keep[@]+"${keep[@]}"}"; do
  [ -e "$path" ] || die "--keep path not found: $path"
  mkdir -p "$keep_dir/$(dirname "$path")"
  cp -R "$path" "$keep_dir/$path"
done

# The predicate lives outside the tree on purpose: a checkout can't delete it.
{
  echo '#!/usr/bin/env bash'
  echo 'set -u'
  echo "cd \"$repo_root\" || exit 125"
  for path in "${keep[@]+"${keep[@]}"}"; do
    printf 'mkdir -p "$(dirname %q)"; cp -R %q %q\n' "$path" "$keep_dir/$path" "$path"
  done
  # An intermittent bug makes every single "good" verdict unreliable, and
  # bisect then converges on noise with full confidence. Repeating turns
  # "did not reproduce once" into "did not reproduce N times".
  echo 'status=0'
  echo "for _ in \$(seq 1 $repeat); do"
  echo "  eval $(printf '%q' "$repro_cmd")"
  echo '  rc=$?'
  echo '  if [ "$rc" -ne 0 ]; then status=$rc; break; fi'
  echo 'done'
  for path in "${keep[@]+"${keep[@]}"}"; do
    # Leave the tree exactly as the revision has it, or bisect's next
    # checkout aborts on a modified/untracked file.
    printf 'if git ls-files --error-unmatch %q >/dev/null 2>&1; then git checkout -q -- %q; else rm -rf %q; fi\n' \
      "$path" "$path" "$path"
  done
  echo 'exit $status'
} > "$predicate"
chmod +x "$predicate"

echo "== bisecting  bad=$bad  good=$good"
echo "== predicate: $repro_cmd"
git bisect start "$bad" "$good" --  >/dev/null || die "git bisect start failed"

log="$workdir/bisect.log"
if ! git bisect run "$predicate" 2>&1 | tee "$log"; then
  grep -qi "first bad commit" "$log" || { echo "bisect-run: bisect did not converge — check the predicate's exit codes (0=good, non-zero=bad, 125=skip)" >&2; exit 1; }
fi

culprit="$(grep -oE '^[0-9a-f]{7,40} is the first bad commit' "$log" | head -1 | cut -d' ' -f1)"
if [ -z "$culprit" ]; then
  echo "bisect-run: no first-bad-commit in the bisect output" >&2
  exit 1
fi

# Guard 5 — bisect assumes ONE good→bad transition. A bug introduced, then
# partly fixed, then reintroduced still yields a single commit, reported as
# confidently as a correct one. Re-testing both sides catches the common
# shape of that.
git bisect reset --quiet >/dev/null 2>&1 || git bisect reset >/dev/null 2>&1
echo
echo "== monotonicity re-check"
at_commit() { git checkout -q "$1" 2>/dev/null || return 125; "$predicate" >/dev/null 2>&1; }

at_commit "$culprit"; culprit_rc=$?
parent="$(git rev-parse --quiet --verify "${culprit}^" 2>/dev/null || true)"
parent_rc=0
if [ -n "$parent" ]; then at_commit "$parent"; parent_rc=$?; fi
git checkout -q "$start_ref" 2>/dev/null

unreliable=0
[ "$culprit_rc" -ne 0 ] || { echo "   culprit does NOT reproduce the bug" >&2; unreliable=1; }
if [ -n "$parent" ]; then
  [ "$parent_rc" -eq 0 ] || { echo "   parent is ALSO bad — the range has more than one transition" >&2; unreliable=1; }
else
  echo "   culprit is the root commit — no parent to verify against"
fi

if [ "$unreliable" -eq 1 ]; then
  echo
  echo "UNRELIABLE: the history is not monotonic over this range, so a single" >&2
  echo "first-bad-commit is not a meaningful answer. Read the range instead:" >&2
  echo "  git log -p $good..$bad -- <failing-subsystem>" >&2
  exit 1
fi
echo "   parent good, culprit bad — single transition confirmed"

echo
echo "== first bad commit: $culprit"
git --no-pager show --stat --oneline "$culprit" | head -40
echo
echo "This commit is where the behavior changed — not automatically the root"
echo "cause. It may have exposed a latent bug rather than introduced one."
echo "Read its diff before concluding: git show $culprit"
exit 0
