# Multi-round slicing

How a change too big for one round gets done anyway — as a sequence of small,
independently safe rounds. The round budget (≤ ~50 changed lines, ≤ 2 files,
one reshape) is never exceeded; the *plan* absorbs the size, not the diff.

## The rule

Every step must leave the codebase **working, tested, and shippable**. If a
step can't be interrupted after it — it's two steps. If the whole sequence
must land together to compile — the slicing is wrong, re-slice.

## Slicing techniques

### Parallel change (expand–contract) — Fowler
For changing a signature, a data shape, or an interface with several callers:

1. **Expand** (round 1): add the new form *alongside* the old — new function,
   new parameter with a default, new field. Old callers untouched. Delegate
   old → new so logic exists once ("new interface, old implementation" —
   Kent Beck).
2. **Migrate** (rounds 2..n): move callers to the new form, a few per round.
3. **Contract** (final round): delete the old form.

Every intermediate state compiles and passes tests.

### Mikado-lite
For a reshape whose prerequisites keep surfacing ("to purify this function I
must first extract that IO, but first split this class…"):

1. Try the goal change directly. If it breaks something, **revert** — don't
   patch forward.
2. Write down what blocked it as prerequisite steps.
3. Do the *leaf* prerequisite (the one with no prerequisites of its own) as
   this round's change. It must be safe and valuable on its own.
4. Repeat next round; the goal change becomes possible when the list is empty.

The revert is the method: exploration is free, only leaf steps are kept.

### Strangler slicing (within-file)
For replacing a big tangled function: build the clean replacement helper by
helper (each round extracts + tests one pure piece), switch the original to
call the pieces, then delete what remains. The original keeps working during
the whole sequence.

## The ledger — `.micro-optimiz.md`

Plans must survive between rounds (cron/daily runs have no memory). Persist
them in a single file at the repo root:

```markdown
# micro-optimiz ledger

## Purify `computeInvoice` (src/billing/invoice.ts)
Goal: separate tax calculation from DB access; make core pure.
- [x] R1: extract `taxRate(region)` pure helper + test
- [ ] R2: extract `lineTotals(items)` pure helper + test
- [ ] R3: `computeInvoice` becomes orchestrator: fetch → pure core → save
- [ ] R4: delete dead branches left behind
```

Rules:

- One `##` section per in-progress change; goal + checkbox steps.
- Each step = one round, within budget, shippable on its own.
- A run that finds a ledger does the **next unchecked step first** — finish
  what's started before opening new work.
- Check off the step in the same round it's applied. All boxes checked →
  delete the section; file empty → delete the file.
- Re-slicing is allowed: if a step turns out too big, split it in place.
- The ledger is a working file, not documentation — keep it terse, and add
  it to `.gitignore` if the user doesn't want it committed.

## When NOT to slice

- The full change touches other modules, public APIs with external callers,
  or architecture → out of scope entirely. Observation, not ledger.
- The sliced sequence would take more rounds than the value justifies
  (a 6-round plan to save 4 lines) → drop it.
- A step can't be made independently safe → the change isn't sliceable at
  this scale; observation.
