#!/usr/bin/env bash
# Measures how often a repro reproduces the bug, so the triage criterion
# "intermittent" is a number, not an impression — and so --repeat for
# bisect-run.sh / verify-test-first.sh is computed, not guessed.
#
# Usage:
#   measure-repro.sh [-n RUNS] -- <repro-cmd>
#
# <repro-cmd>: same polarity as a test — exit 0 when the behavior is CORRECT,
# non-zero when the bug is present. Several words (argv) or one shell string.
#
# Prints `reproduced k/n` and the recommended --repeat: the smallest N with
# (1 - rate)^N < 1%, i.e. N runs that all pass leave under 1% chance the bug
# was simply missed.
#
# Exit codes: 0 = reproduced every run (deterministic), 3 = intermittent
# (escalate to the full track, use the printed --repeat), 1 = never
# reproduced (no repro yet — don't diagnose), 2 = usage error.
set -u

die() { echo "measure-repro: $*" >&2; exit 2; }
runs=20
while [ "$#" -gt 0 ]; do
  case "$1" in
    -n) [ "$#" -ge 2 ] || die "-n needs a value"; runs="$2"; shift 2 ;;
    --) shift; break ;;
    *) die "usage: measure-repro.sh [-n RUNS] -- <repro-cmd>" ;;
  esac
done
case "$runs" in (*[!0-9]*|""|0) die "-n takes a positive integer" ;; esac
[ "$#" -ge 1 ] || die "no repro command given after --"
if [ "$#" -eq 1 ]; then cmd="$1"; else cmd="$(printf '%q ' "$@")"; fi

log="$(mktemp)"; trap 'rm -f "$log"' EXIT
k=0
for _ in $(seq 1 "$runs"); do
  if ! ( eval "$cmd" ) >"$log" 2>&1; then k=$((k + 1)); last_red="$(tail -n 5 "$log")"; fi
done

echo "reproduced $k/$runs"
if [ "$k" -eq 0 ]; then
  echo "NO REPRO: the command never showed the bug in $runs runs — get a failing repro before diagnosing" >&2
  exit 1
fi
echo "last red output:"; sed 's/^/   | /' <<<"$last_red"
if [ "$k" -eq "$runs" ]; then
  echo "DETERMINISTIC: --repeat 1 is enough"
  exit 0
fi
repeat=$(awk -v k="$k" -v n="$runs" 'BEGIN { r = k / n; x = log(0.01) / log(1 - r); c = int(x); if (c < x) c++; print c }')
echo "INTERMITTENT ($(( 100 * k / runs ))%): full track. Use --repeat $repeat with bisect-run.sh and verify-test-first.sh"
exit 3
