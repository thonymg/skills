#!/usr/bin/env bash
# Mechanically verifies fix-root's test-first rule: every test command must
# fail WITHOUT the fix and pass WITH it (red -> green). No LLM self-report
# involved — both states are replayed with git stash.
#
# Usage:
#   verify-test-first.sh [--expect-red <regex>] [--repeat N] <test-cmd> [<test-cmd> ...] -- <fix-file> [...]
#
# <fix-file>... are the uncommitted paths that make up the fix itself (NOT the
# test files). A deleted file counts.
#
# Several <test-cmd>: one per entry point that routes through the defect (the
# callers mapped in step 6). A fix at the symptom turns one caller green and
# leaves another red — that is a FAIL here, which is what proves root, not
# symptom.
#
# --expect-red <regex>: each red output must match it (e.g. 'expected 80').
#   Without it, a red run that never reached the code (import error, unresolved
#   symbol at compile time) is rejected — red for the wrong reason.
# --repeat N: for an intermittent bug. Red = at least one failure in N runs;
#   green = N passes out of N, so a lucky green does not count.
#
# Exit codes: 0 = red->green confirmed for every command, 1 = test-first
# violated, 2 = usage/environment error.
#
# Caveat: an untracked build cache (__pycache__, .tsbuildinfo, target/,
# node_modules/.cache) survives the stash swap and can fake either run. Pass
# commands that disable it (`python3 -B`, `jest --no-cache`, a clean build).
set -u

die() { echo "verify-test-first: $*" >&2; exit 2; }
usage="usage: verify-test-first.sh [--expect-red <regex>] [--repeat N] <test-cmd> [<test-cmd> ...] -- <fix-file> [...]"

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

expect_red=""; repeat=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --expect-red) [ "$#" -ge 2 ] || die "--expect-red needs a regex"; expect_red="$2"; shift 2 ;;
    --repeat)     [ "$#" -ge 2 ] || die "--repeat needs a value"; repeat="$2"; shift 2 ;;
    *) break ;;
  esac
done
case "$repeat" in (*[!0-9]*|""|0) die "--repeat takes a positive integer" ;; esac

test_cmds=()
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do test_cmds+=("$1"); shift; done
[ "${#test_cmds[@]}" -ge 1 ] && [ "${1:-}" = "--" ] || die "$usage"
shift
fix_files=("$@")
[ "${#fix_files[@]}" -ge 1 ] || die "no fix files given after --"

for f in "${fix_files[@]}"; do
  [ -e "$f" ] || git cat-file -e "HEAD:./$f" 2>/dev/null || die "fix file not found: $f"
  [ -e "$f" ] || git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 \
    || die "$f: staged deletion — git stash cannot target it; run 'git restore --staged $f' (the file stays deleted) and retry"
  git diff --quiet -- "$f" && git diff --cached --quiet -- "$f" \
    && die "no pending changes in $f — run this before committing the fix (a brand-new file must be staged with 'git add' first)"
done

stashed=0
log="$(mktemp)"
cleanup() {
  if [ "$stashed" -eq 1 ]; then
    git stash pop --index --quiet 2>/dev/null || git stash pop --quiet 2>/dev/null
  fi
  rm -f "$log"
}
trap cleanup EXIT

# Runs $1 up to $repeat times into $log. Returns 0 if every run passed,
# 1 at the first failure. Subshell: an `exit` in the command must not end
# this script.
run_all() {
  local i
  for i in $(seq 1 "$repeat"); do
    ( eval "$1" ) >"$log" 2>&1 || return 1
  done
  return 0
}

echo "== stashing fix: ${fix_files[*]}"
git stash push --quiet -m "verify-test-first $$" -- "${fix_files[@]}" \
  || die "git stash push failed — resolve working tree state and retry"
stashed=1

for cmd in "${test_cmds[@]}"; do
  echo "== WITHOUT the fix (expect RED): $cmd"
  if run_all "$cmd"; then
    tail -n 20 "$log" | sed 's/^/   | /'
    echo "FAIL: passed without the fix ($repeat run(s)) — this command does not reproduce the bug" >&2
    exit 1
  fi
  tail -n 10 "$log" | sed 's/^/   | /'
  if [ -n "$expect_red" ]; then
    grep -Eq -- "$expect_red" "$log" || {
      echo "FAIL: red for the wrong reason — output does not match --expect-red '$expect_red'" >&2; exit 1; }
  # Only signals that the TEST could not reach the code — never NameError or
  # NoMethodError, which are often the bug itself (a typo, a call on nil).
  elif grep -Eq 'ImportError|ModuleNotFoundError|Cannot find module|TS2305|cannot find symbol|error\[E0425\]|uninitialized constant|\[build failed\]|\[setup failed\]' "$log"; then
    echo "FAIL: red for the wrong reason — missing symbol (import/compile error), not the bug." >&2
    echo "      Call code that exists before the fix, or pass --expect-red '<assertion text>' if this error IS the bug." >&2
    exit 1
  fi
done

echo "== restoring fix"
if ! git stash pop --index --quiet 2>/dev/null && ! git stash pop --quiet; then
  stashed=0
  die "could not restore the fix — it is STILL IN THE STASH ($(git stash list | head -1)). Recover with: git checkout -- ${fix_files[*]} && git stash pop. Cause: a test command rewrote a fix file (formatter, codegen, snapshot update)."
fi
stashed=0

for cmd in "${test_cmds[@]}"; do
  echo "== WITH the fix (expect GREEN x$repeat): $cmd"
  if ! run_all "$cmd"; then
    tail -n 20 "$log" | sed 's/^/   | /'
    if [ "${#test_cmds[@]}" -gt 1 ]; then
      echo "FAIL: still red with the fix — if another command turned green, the fix sits at the symptom, not where all callers route through" >&2
    else
      echo "FAIL: still red with the fix — the diagnosis is refuted, log it in the ledger and re-diagnose" >&2
    fi
    exit 1
  fi
done

echo "PASS: red -> green confirmed (${#test_cmds[@]} command(s), x$repeat) for ${fix_files[*]}"
exit 0
