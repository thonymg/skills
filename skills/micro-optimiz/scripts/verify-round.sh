#!/usr/bin/env bash
# Mechanically verifies micro-optimiz's two hard limits for one round:
#   1. Round budget   — <= 2 files, <= 50 changed lines (git numstat, exact).
#   2. Behavior kept  — the given verify command (tests/type-check/build)
#                        still exits 0 on the changed tree.
# "At most one structural reshape" stays a judgment call — no script can
# count reshapes, only lines and files.
#
# Usage:
#   verify-round.sh [--base <ref>] [--max-lines N] [--max-files N] [--json] [--verify-cmd "<cmd>"]
#
# --base defaults to HEAD (diff = working tree + staged changes vs HEAD).
# Without --verify-cmd, behavior preservation is reported as NOT CHECKED,
# never assumed.
#
# Exit codes: 0 = within budget (and verify-cmd passed, if given),
# 1 = budget exceeded, 2 = verify-cmd failed, 3 = usage/environment error.
set -u

die() { echo "verify-round: $*" >&2; exit 3; }

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

base="HEAD"
max_lines=50
max_files=2
json=0
verify_cmd=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base) base="$2"; shift 2 ;;
    --max-lines) max_lines="$2"; shift 2 ;;
    --max-files) max_files="$2"; shift 2 ;;
    --verify-cmd) verify_cmd="$2"; shift 2 ;;
    --json) json=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

numstat="$(git diff --numstat "$base" --)"
files_changed=0
lines_changed=0
if [ -n "$numstat" ]; then
  files_changed="$(printf '%s\n' "$numstat" | wc -l | tr -d ' ')"
  lines_changed="$(printf '%s\n' "$numstat" | awk '{ if ($1 != "-") a+=$1; if ($2 != "-") d+=$2 } END { print a+d+0 }')"
fi

budget_ok=1
[ "$files_changed" -le "$max_files" ] || budget_ok=0
[ "$lines_changed" -le "$max_lines" ] || budget_ok=0

verify_status="not_checked"
verify_exit=""
if [ -n "$verify_cmd" ]; then
  if eval "$verify_cmd"; then
    verify_status="passed"
  else
    verify_exit=$?
    verify_status="failed"
  fi
fi

if [ "$json" -eq 1 ]; then
  printf '{"files_changed":%s,"max_files":%s,"lines_changed":%s,"max_lines":%s,"budget_ok":%s,"verify_status":"%s"}\n' \
    "$files_changed" "$max_files" "$lines_changed" "$max_lines" \
    "$([ "$budget_ok" -eq 1 ] && echo true || echo false)" "$verify_status"
else
  echo "files changed: $files_changed / $max_files"
  echo "lines changed: $lines_changed / $max_lines"
  echo "behavior check: $verify_status"
fi

if [ "$budget_ok" -eq 0 ]; then
  [ "$json" -eq 1 ] || echo "FAIL: round budget exceeded — slice into references/multi-round.md instead" >&2
  exit 1
fi
if [ "$verify_status" = "failed" ]; then
  [ "$json" -eq 1 ] || echo "FAIL: verify-cmd failed — revert, don't patch forward" >&2
  exit 2
fi
exit 0
