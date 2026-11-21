#!/usr/bin/env bash
# Mechanically verifies fix-root step 10: the full suite, run WITHOUT then
# WITH the fix, and the failing tests compared. Replaces "I ran the suite,
# the remaining failure was already there" — a self-report — with a diff of
# two measured runs.
#
# Usage:
#   verify-suite.sh [--fail-pattern <ERE>] "<suite-cmd>" -- <fix-file> [<fix-file> ...]
#
# <fix-file>... are the uncommitted files that make up the fix (same as
# verify-test-first.sh). The new test file stays in place for both runs.
#
# Exit codes — each one is a decision, not a hint:
#   0 = suite green with the fix.
#   3 = only PRE-EXISTING failures remain (they fail without the fix too):
#       the fix introduced nothing; report them as separate bugs, don't revert.
#   1 = the fix introduced a NEW failure (revert and re-diagnose, never patch
#       forward) — or the suite fails and its failing tests cannot be
#       identified, so new and pre-existing cannot be told apart: UNVERIFIED.
#   2 = usage/environment error.
#
# Failing tests are identified from the suite output with built-in patterns
# (pytest, unittest, go test, cargo test, jest/vitest, rspec, mocha,
# phpunit, minitest). --fail-pattern <ERE> replaces them: an extended regex
# matching a WHOLE output line (^…$) whose first group captures one failing
# test id, e.g.
#   --fail-pattern '^not ok [0-9]+ - (.*)$'          (TAP)
#
# Zero dependencies beyond bash, git, sed, sort, comm.
set -u

die() { echo "verify-suite: $*" >&2; exit 2; }
usage="usage: verify-suite.sh [--fail-pattern <ERE>] \"<suite-cmd>\" -- <fix-file> [<fix-file> ...]"

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

fail_pattern=""
if [ "${1:-}" = "--fail-pattern" ]; then
  [ "$#" -ge 2 ] || die "--fail-pattern needs an extended regex with one capture group"
  fail_pattern="$2"; shift 2
fi
[ "$#" -ge 1 ] || die "$usage"
suite_cmd="$1"; shift
[ "${1:-}" = "--" ] || die "$usage"
shift
fix_files=("$@")
[ "${#fix_files[@]}" -ge 1 ] || die "no fix files given after --"

for f in "${fix_files[@]}"; do
  [ -e "$f" ] || die "fix file not found: $f"
  git diff --quiet -- "$f" && git diff --cached --quiet -- "$f" \
    && die "no pending changes in $f — run this before committing the fix (a brand-new file must be staged with 'git add' first)"
done

work="$(mktemp -d)"
stashed=0
cleanup() {
  if [ "$stashed" -eq 1 ]; then
    git stash pop --index --quiet 2>/dev/null || git stash pop --quiet 2>/dev/null
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# One failing-test id per line, sorted and de-duplicated. ANSI colours and
# trailing durations are stripped so the same test matches in both runs.
esc="$(printf '\033')"
sep="$(printf '\001')"   # sed delimiter that can't appear in a --fail-pattern
failing_ids() {
  sed -E "s/${esc}\[[0-9;]*[A-Za-z]//g" "$1" > "$1.plain"
  if [ -n "$fail_pattern" ]; then
    sed -nE "s${sep}${fail_pattern}${sep}\\1${sep}p" "$1.plain"
  else
    sed -nE \
      -e 's/^(FAILED|ERROR) ([^ ]+::[^ ]+).*$/\2/p' \
      -e 's/^(FAIL|ERROR): (.+)$/\2/p' \
      -e 's/^[[:space:]]*--- FAIL: ([^ ]+).*$/\1/p' \
      -e 's/^test ([^ ]+) \.\.\. FAILED$/\1/p' \
      -e 's/^[[:space:]]*(✕|×) (.+)$/\2/p' \
      -e 's/^[[:space:]]*FAIL[[:space:]]+(.+)$/\1/p' \
      -e 's/^rspec (\.\/[^ ]+).*$/\1/p' \
      -e 's/^[[:space:]]*[0-9]+\) (.+)$/\1/p' \
      -e 's/^([A-Za-z_][A-Za-z0-9_:]*#test_[A-Za-z0-9_]+).*$/\1/p' \
      "$1.plain"
  fi | sed -E 's/[[:space:]]*[[(][0-9.]+ ?(ms|s)[])]$//; s/[[:space:]]+[0-9.]+m?s$//; s/[[:space:]]+$//' | sort -u
}

run_suite() {   # $1 = label, $2 = log file; echoes the exit code
  echo "== running suite $1: $suite_cmd" >&2
  ( eval "$suite_cmd" ) >"$2" 2>&1   # subshell: an `exit` in the command must not end this script
  echo $?
}

echo "== stashing fix changes: ${fix_files[*]}"
git stash push --quiet -m "verify-suite $$" -- "${fix_files[@]}" \
  || die "git stash push failed — resolve working tree state and retry"
stashed=1
rc_before=$(run_suite "WITHOUT the fix" "$work/before.log")

echo "== restoring fix changes"
if ! git stash pop --index --quiet 2>/dev/null && ! git stash pop --quiet; then
  stashed=0
  die "could not restore the fix — it is STILL IN THE STASH ($(git stash list | head -1)). Recover with: git checkout -- ${fix_files[*]} && git stash pop. Cause: the suite rewrote a fix file (formatter, codegen, snapshot update)."
fi
stashed=0
rc_after=$(run_suite "WITH the fix" "$work/after.log")

failing_ids "$work/before.log" > "$work/before.ids"
failing_ids "$work/after.log"  > "$work/after.ids"
comm -13 "$work/before.ids" "$work/after.ids" > "$work/new.ids"
comm -12 "$work/before.ids" "$work/after.ids" > "$work/pre.ids"
comm -23 "$work/before.ids" "$work/after.ids" > "$work/fixed.ids"

list() { [ -s "$1" ] && sed 's/^/   - /' "$1"; }
echo "== exit code: without fix=$rc_before, with fix=$rc_after"
if [ -s "$work/fixed.ids" ]; then echo "== failing without the fix, passing with it:"; list "$work/fixed.ids"; fi

if [ "$rc_after" -eq 0 ]; then
  echo "PASS: full suite green with the fix"
  exit 0
fi

echo "== tail of the failing run:"
tail -n 20 "$work/after.log" | sed 's/^/   | /'

if [ -s "$work/new.ids" ]; then
  echo "FAIL: the fix introduced NEW failures — revert and re-diagnose, don't patch forward:" >&2
  list "$work/new.ids" >&2
  exit 1
fi
if [ "$rc_before" -eq 0 ]; then
  echo "FAIL: the suite passes without the fix and fails with it — the fix introduced a failure (its test ids could not be parsed; pass --fail-pattern to name it)" >&2
  exit 1
fi
if [ ! -s "$work/after.ids" ]; then
  echo "FAIL: UNVERIFIED — the suite fails with and without the fix, but no failing test could be identified in its output, so new and pre-existing failures cannot be told apart. Pass --fail-pattern '<ERE with one group>'." >&2
  exit 1
fi
echo "PRE-EXISTING: every remaining failure already fails without the fix — report each as a separate bug, don't revert:"
list "$work/pre.ids"
exit 3
