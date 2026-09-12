#!/usr/bin/env bash
# Mechanically verifies fix-root's test-first rule: the new/changed test
# must fail WITHOUT the fix and pass WITH it (red -> green). No LLM
# self-report involved — this replays both states with git stash.
#
# Usage:
#   verify-test-first.sh <test-cmd> -- <fix-file> [<fix-file> ...]
#
# <fix-file>... are the paths already modified in the working tree that
# constitute the fix itself (NOT the test file). The script temporarily
# removes just those changes, runs <test-cmd> and expects it to fail,
# restores them, runs <test-cmd> again and expects it to pass.
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

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

[ "$#" -ge 1 ] || die "usage: verify-test-first.sh <test-cmd> -- <fix-file> [<fix-file> ...]"
test_cmd="$1"; shift
[ "${1:-}" = "--" ] || die "usage: verify-test-first.sh <test-cmd> -- <fix-file> [<fix-file> ...]"
shift
fix_files=("$@")
[ "${#fix_files[@]}" -ge 1 ] || die "no fix files given after --"

for f in "${fix_files[@]}"; do
  [ -e "$f" ] || die "fix file not found: $f"
  git diff --quiet -- "$f" && git diff --cached --quiet -- "$f" \
    && die "no pending changes in $f — run this before committing the fix"
done

stash_marker="verify-test-first $$"
stashed=0

cleanup() {
  if [ "$stashed" -eq 1 ]; then
    git stash pop --quiet 2>/dev/null
  fi
}
trap cleanup EXIT

echo "== stashing fix changes: ${fix_files[*]}"
if ! git stash push --quiet -m "$stash_marker" -- "${fix_files[@]}"; then
  die "git stash push failed — resolve working tree state and retry"
fi
stashed=1

echo "== running test command WITHOUT the fix (expect RED): $test_cmd"
if eval "$test_cmd"; then
  echo "FAIL: test command succeeded even without the fix — it doesn't reproduce the bug" >&2
  exit 1
fi
echo "== confirmed red"

echo "== restoring fix changes"
if ! git stash pop --quiet; then
  die "could not restore the fix — it is STILL IN THE STASH ($(git stash list | head -1)). Recover with: git checkout -- ${fix_files[*]} && git stash pop. Cause: the test command rewrote a fix file (formatter, codegen, snapshot update)."
fi
stashed=0

echo "== running test command WITH the fix (expect GREEN): $test_cmd"
if ! eval "$test_cmd"; then
  echo "FAIL: test command still fails with the fix applied" >&2
  exit 1
fi

echo "PASS: red -> green confirmed for ${fix_files[*]}"
exit 0
