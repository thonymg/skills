#!/usr/bin/env bash
# Mechanically verifies fix-root's test-first rule: the new/changed test
# must fail WITHOUT the fix and pass WITH it (red -> green). No LLM
# self-report involved — this replays both states with git stash.
#
# Usage:
#   verify-test-first.sh [--expect-red <regex>] <test-cmd> -- <fix-file> [<fix-file> ...]
#
# <fix-file>... are the paths already modified in the working tree that
# constitute the fix itself (NOT the test file). The script temporarily
# removes just those changes, runs <test-cmd> and expects it to fail,
# restores them, runs <test-cmd> again and expects it to pass.
#
# Red for the wrong reason: a test that imports a function the fix adds
# fails without the fix on an ImportError — red, yet it never exercised the
# bug. By default a red run whose output shows the test could not even reach
# the code (import error, unresolved symbol at compile time) is rejected. --expect-red <regex>
# replaces that heuristic: the red output must match <regex> (e.g.
# 'AssertionError', 'expected 80'), which is the stronger check.
#
# Exit codes: 0 = red->green confirmed, 1 = test-first violated,
# 2 = usage/environment error.
#
# Caveat (found while testing this script): a bytecode/build cache that
# isn't tracked by git (__pycache__, .tsbuildinfo, target/, node_modules/.cache)
# can survive the stash swap and make the "red" run silently reuse the
# fixed build, producing a false PASS or a false FAIL. Pass a <test-cmd>
# that disables its cache (`python3 -B`, `jest --no-cache`, a clean build)
# if your stack has one.
set -u

die() { echo "verify-test-first: $*" >&2; exit 2; }
usage="usage: verify-test-first.sh [--expect-red <regex>] <test-cmd> -- <fix-file> [<fix-file> ...]"

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

expect_red=""
if [ "${1:-}" = "--expect-red" ]; then
  [ "$#" -ge 2 ] || die "--expect-red needs a regex"
  expect_red="$2"; shift 2
fi
[ "$#" -ge 1 ] || die "$usage"
test_cmd="$1"; shift
[ "${1:-}" = "--" ] || die "$usage"
shift
fix_files=("$@")
[ "${#fix_files[@]}" -ge 1 ] || die "no fix files given after --"

for f in "${fix_files[@]}"; do
  [ -e "$f" ] || die "fix file not found: $f"
  git diff --quiet -- "$f" && git diff --cached --quiet -- "$f" \
    && die "no pending changes in $f — run this before committing the fix (a brand-new file must be staged with 'git add' first)"
done

stash_marker="verify-test-first $$"
stashed=0
red_log="$(mktemp)"

cleanup() {
  if [ "$stashed" -eq 1 ]; then
    git stash pop --index --quiet 2>/dev/null || git stash pop --quiet 2>/dev/null
  fi
  rm -f "$red_log"
}
trap cleanup EXIT

echo "== stashing fix changes: ${fix_files[*]}"
if ! git stash push --quiet -m "$stash_marker" -- "${fix_files[@]}"; then
  die "git stash push failed — resolve working tree state and retry"
fi
stashed=1

echo "== running test command WITHOUT the fix (expect RED): $test_cmd"
if ( eval "$test_cmd" ) >"$red_log" 2>&1; then   # subshell: an `exit` in the command must not end this script
  cat "$red_log"
  echo "FAIL: test command succeeded even without the fix — it doesn't reproduce the bug" >&2
  exit 1
fi
echo "== red output (last lines):"
tail -n 15 "$red_log" | sed 's/^/   | /'

if [ -n "$expect_red" ]; then
  if ! grep -Eq -- "$expect_red" "$red_log"; then
    echo "FAIL: red for the wrong reason — the output does not match --expect-red '$expect_red'" >&2
    exit 1
  fi
# Only signals that the TEST could not reach the code — never NameError or
# NoMethodError, which are often the bug itself (a typo, a call on nil).
elif grep -Eq 'ImportError|ModuleNotFoundError|Cannot find module|TS2305|cannot find symbol|error\[E0425\]|uninitialized constant' "$red_log"; then
  echo "FAIL: red for the wrong reason — the test failed on a missing symbol (import/name/compile error), not on the bug." >&2
  echo "      Make the test call code that exists before the fix, or pass --expect-red '<assertion text>' if this error IS the bug." >&2
  exit 1
fi
echo "== confirmed red"

echo "== restoring fix changes"
if ! git stash pop --index --quiet 2>/dev/null && ! git stash pop --quiet; then
  stashed=0
  die "could not restore the fix — it is STILL IN THE STASH ($(git stash list | head -1)). Recover with: git checkout -- ${fix_files[*]} && git stash pop. Cause: the test command rewrote a fix file (formatter, codegen, snapshot update)."
fi
stashed=0

echo "== running test command WITH the fix (expect GREEN): $test_cmd"
if ! ( eval "$test_cmd" ); then
  echo "FAIL: test command still fails with the fix applied" >&2
  exit 1
fi

echo "PASS: red -> green confirmed for ${fix_files[*]}"
exit 0
