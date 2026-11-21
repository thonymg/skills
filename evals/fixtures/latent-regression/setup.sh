#!/usr/bin/env bash
# History where a LEGITIMATE commit exposes a latent bug. Run from the
# workspace root by run-evals.py, from outside the tree.
#
# v1.0 (good) ── noise ── noise ── CULPRIT ── noise ── HEAD
# The culprit excludes cancelled orders from the basket average — correct
# behavior. It makes the list empty on days where every order was cancelled,
# and average() never handled an empty list. Reverting it is the wrong fix:
# cancelled orders would count again.
set -eu

git init -q .
git config user.email eval@local
git config user.name eval

cat > stats.py <<'PY'
def average(values):
    return sum(values) / len(values)
PY
cat > orders.py <<'PY'
from stats import average


def average_basket(orders):
    return average([o["total"] for o in orders])
PY
git add -A
git commit -qm "orders: basket average"
git tag v1.0

for note in "document average" "tidy imports"; do
  printf '# %s\n' "$note" >> orders.py
  git commit -qam "chore: $note"
done

cat > orders.py <<'PY'
from stats import average


def average_basket(orders):
    return average([o["total"] for o in orders if o["status"] != "cancelled"])
# document average
# tidy imports
PY
git commit -qam "orders: cancelled orders must not count in the basket average"

printf '# bump copyright\n' >> stats.py
git commit -qam "chore: bump copyright"
