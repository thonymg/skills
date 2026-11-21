#!/usr/bin/env bash
# Drives `git bisect run` against a repro predicate and prints the first bad
# commit. The bisection itself is git's; what this adds is the guards that
# separate a real culprit from a confident wrong answer.
#
# Usage:
#   bisect-run.sh --good <ref> [--bad <ref>] [--keep <path>]... [--repeat N] -- <repro-cmd>
#
# Examples:
#   bisect-run.sh --good v1.2.0 --keep test_regression.py -- python3 -B test_regression.py
#   bisect-run.sh --good v1.2.0 -- python3 -B -c "from m import f; assert f() == 1"
#   bisect-run.sh --good v1.2.0 -- 'make build && ./run-check'
#
# <repro-cmd> is either several words (argv, quoting preserved) or one single
# shell string (pipes, &&). It runs from the directory you launched this
# script from, so relative paths keep working from a subfolder.
#
# <repro-cmd> must exit 0 when the behavior is CORRECT and non-zero when the
# bug is present — same polarity as a test. Exit 125 means "this commit can't
# be tested" (broken build, missing dep); git skips it instead of blaming it.
# Exit codes >= 128 (a crash: SIGSEGV, SIGABRT) are mapped to 1 — "bad" —
# because `git bisect run` aborts the whole bisection on them otherwise.
#
# Guards:
#   1. Refuses to start on a dirty working tree. Bisect checks out other
#      commits; uncommitted work is either carried across them, silently
#      changing what you measure, or lost.
#   2. --keep <path> survives the checkouts. A repro on a test file committed
#      AFTER the regression is missing at older commits: the command fails,
#      git reads that non-zero exit as "bug present", and bisect converges on
#      a commit far older than the real one. Kept files are copied out,
#      restored before each run, removed after so the next checkout stays
#      clean — and restored into the tree at the end, so an uncommitted test
#      is never lost.
#   3. `git bisect reset` always runs, including on interrupt. A repo left
#      mid-bisect is a detached HEAD for whoever opens it next.
#   4. --repeat N runs the predicate N times per commit and calls it good
#      only if all N pass. An intermittent bug makes a single "good" verdict
#      meaningless, and bisect then converges on noise — with exactly the
#      same confident output as a correct run.
#   5. Endpoint pre-check: before spending ~log2(n) builds, the predicate must
#      pass on --good and fail on --bad. A wrong "it worked at vX" claim, or a
#      repro file that doesn't exist at --good (pass --keep), stops here.
#   6. Monotonicity re-check: after converging, the culprit must be bad and
#      its parent good, or the result is reported as unreliable.
#
# Output is kept short on purpose: the step-by-step bisect log goes to a file,
# only the culprit (or the log tail on failure) is printed.
#
# Exit codes: 0 = culprit identified, 1 = bisect could not conclude,
# 2 = usage/environment error.
set -u

die() { echo "bisect-run: $*" >&2; exit 2; }
need_value() { [ "$2" -ge 2 ] || die "$1 needs a value"; }

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

good=""; bad="HEAD"; repeat=1; keep=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --good)   need_value "$1" "$#"; good="$2"; shift 2 ;;
    --bad)    need_value "$1" "$#"; bad="$2"; shift 2 ;;
    --keep)   need_value "$1" "$#"; keep+=("$2"); shift 2 ;;
    --repeat) need_value "$1" "$#"; repeat="$2"; shift 2 ;;
    --) shift; break ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$repeat" in (*[!0-9]*|"") die "--repeat takes a positive integer" ;; esac
[ "$repeat" -ge 1 ] || die "--repeat takes a positive integer"

[ -n "$good" ] || die "usage: bisect-run.sh --good <ref> [--bad <ref>] [--keep <path>]... -- <repro-cmd>"
[ "$#" -ge 1 ] || die "no repro command given after --"
# One word = a shell string the caller already quoted; several = argv, each
# word re-quoted so `-c "a; b"` stays one argument through eval.
if [ "$#" -eq 1 ]; then repro_cmd="$1"; else repro_cmd="$(printf '%q ' "$@")"; fi

git rev-parse --verify --quiet "$good^{commit}" >/dev/null || die "not a commit: $good"
git rev-parse --verify --quiet "$bad^{commit}" >/dev/null || die "not a commit: $bad"
# Pinned to SHAs: the endpoint pre-check checks commits out, after which a
# symbolic --bad HEAD would point at --good.
good_sha="$(git rev-parse "$good^{commit}")"; bad_sha="$(git rev-parse "$bad^{commit}")"

# Guard 1 — never bisect over uncommitted work.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "working tree is dirty — commit or stash first; bisect checks out other commits and would carry or clobber these changes"
fi

workdir="$(mktemp -d)"
keep_dir="$workdir/keep"
predicate="$workdir/predicate.sh"
start_dir="$PWD"
start_ref="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"

cleanup() {
  git bisect reset >/dev/null 2>&1
  # The monotonicity re-check below checks out commits after bisect ends;
  # put HEAD back where it started whatever happens.
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$start_ref" ] || git checkout -q "$start_ref" 2>/dev/null
  # Guard 2, last half — a kept file the start ref doesn't track (the test
  # just written for step 7) was removed by the predicate; put it back.
  for path in "${keep[@]+"${keep[@]}"}"; do
    case "$path" in /*) dest="$path" ;; *) dest="$start_dir/$path" ;; esac
    if [ ! -e "$dest" ] && [ -e "$keep_dir/$path" ]; then
      mkdir -p "$(dirname "$dest")"
      cp -R "$keep_dir/$path" "$dest"
    fi
  done
  rm -rf "$workdir"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

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
  printf 'cd %q || exit 125\n' "$start_dir"
  for path in "${keep[@]+"${keep[@]}"}"; do
    printf 'mkdir -p "$(dirname %q)"; cp -R %q %q\n' "$path" "$keep_dir/$path" "$path"
  done
  # Guard 4 — repeating turns "did not reproduce once" into "did not
  # reproduce N times".
  echo 'status=0'
  echo "for _ in \$(seq 1 $repeat); do"
  # Subshell: an `exit` in the command would skip the --keep cleanup below.
  echo "  ( eval $(printf '%q' "$repro_cmd") )"
  echo '  rc=$?'
  # A crash (>=128) would make `git bisect run` abort the bisection.
  echo '  if [ "$rc" -ge 128 ]; then rc=1; fi'
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

at_commit() { git checkout -q "$1" 2>/dev/null || return 125; "$predicate" >/dev/null 2>&1; }

echo "== predicate: $repro_cmd"
# Guard 5 — both endpoints must agree with the claim before bisecting.
at_commit "$good_sha"; good_rc=$?
at_commit "$bad_sha"; bad_rc=$?
git checkout -q "$start_ref" 2>/dev/null
if [ "$good_rc" -ne 0 ]; then
  echo "FAIL: the predicate already fails at --good $good (exit $good_rc) — this range is not a regression." >&2
  echo "      Wrong good ref, a repro file missing at $good (pass --keep <file>), or a build that can't run there (exit 125)." >&2
  exit 1
fi
if [ "$bad_rc" -eq 0 ]; then
  echo "FAIL: the predicate passes at --bad $bad — it does not reproduce the bug there." >&2
  exit 1
fi
echo "== endpoints confirmed: good passes, bad fails"

echo "== bisecting  bad=$bad  good=$good  ($(git rev-list --count "$good_sha..$bad_sha") commits)"
git bisect start "$bad_sha" "$good_sha" --  >/dev/null || die "git bisect start failed"

log="$workdir/bisect.log"
git bisect run "$predicate" >"$log" 2>&1

culprit="$(grep -oE '^[0-9a-f]{7,40} is the first bad commit' "$log" | head -1 | cut -d' ' -f1)"
if [ -z "$culprit" ]; then
  tail -n 20 "$log" | sed 's/^/   | /'
  echo "bisect-run: bisect did not converge — check the predicate's exit codes (0=good, non-zero=bad, 125=skip)" >&2
  exit 1
fi
echo "== converged in $(grep -c '^running' "$log") step(s)"

# Guard 6 — bisect assumes ONE good→bad transition. A bug introduced, then
# partly fixed, then reintroduced still yields a single commit, reported as
# confidently as a correct one. Re-testing both sides catches the common
# shape of that.
git bisect reset >/dev/null 2>&1
echo "== monotonicity re-check"

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
  echo "UNRELIABLE: the history is not monotonic over this range, so a single" >&2
  echo "first-bad-commit is not a meaningful answer. Read the range instead:" >&2
  echo "  git log -p $good..$bad -- <failing-subsystem>" >&2
  exit 1
fi
echo "   parent good, culprit bad — single transition confirmed"

echo "== first bad commit: $culprit"
git --no-pager show --stat --oneline "$culprit" | head -15
echo "Where the behavior CHANGED, not automatically the root cause — it may have"
echo "exposed a latent bug. Read the diff before concluding: git show $culprit"
exit 0
