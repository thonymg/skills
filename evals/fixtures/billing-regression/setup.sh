#!/usr/bin/env bash
# Builds a history with one regression to find. Run from the workspace root
# by run-evals.py, from outside the tree so it never commits itself.
#
# v1.0 (good) ── noise ── noise ── noise ── CULPRIT ── noise ── noise ── HEAD
# The culprit reinterprets `rate` as percentage points; callers still pass a
# fraction, so every discount silently becomes ~nothing.
set -eu

git init -q .
git config user.email eval@local
git config user.name eval

cat > billing.py <<'PY'
def discount(total, rate):
    return total * (1 - rate)


def line_total(price, qty, rate=0.0):
    return discount(price * qty, rate)
PY
git add -A
git commit -qm "billing: discount and line_total"
git tag v1.0

for note in "log the cart id" "tidy imports" "bump copyright"; do
  printf '# %s\n' "$note" >> billing.py
  git commit -qam "chore: $note"
done

# The regression.
cat > billing.py <<'PY'
def discount(total, rate):
    return total * (1 - rate / 100)


def line_total(price, qty, rate=0.0):
    return discount(price * qty, rate)
PY
git commit -qam "billing: treat rate as percentage points"

for note in "rename local var" "extend docstring"; do
  printf '# %s\n' "$note" >> billing.py
  git commit -qam "chore: $note"
done

# Committed AFTER the regression on purpose: a bisect whose predicate runs
# this tracked file finds it absent at every older commit, reads the error
# as "bug present", and converges on a commit far too old. That is what
# --keep exists for.
cat > test_billing.py <<'PY'
from billing import discount, line_total

assert discount(100, 0.2) == 80, discount(100, 0.2)
assert line_total(50, 2, 0.1) == 90, line_total(50, 2, 0.1)
print("ok")
PY
git add -A
git commit -qm "test: cover discount and line_total"
