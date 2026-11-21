# Red→green check — resolution, failure modes, recovery

Read this only when `verify-test-first.sh` is missing, refuses to run, or
reports something that looks wrong.

## Where the script is

`<skill-dir>/scripts/verify-test-first.sh`, where `<skill-dir>` is
wherever this skill is installed — `.claude/skills/fix-root/` as a project
skill, `~/.agents/skills/fix-root/` when shared across harnesses, or the
repo path when working on the skill itself. Resolve it from this file's
own path; never assume a repo layout.

**Missing entirely?** Do the same replay by hand — stash the fix, run the
test and expect red; restore, run again and expect green — and say in the
report that you verified it manually. The rule is the replay, not the
script.

## What it actually proves

It replays both states with `git stash`: every `<test-cmd>` with the fix
removed must fail, with the fix restored must pass. Exit 0 only on a
confirmed red→green for all of them. Zero dependencies beyond bash and git.

It proves the test is not **vacuous** — that it would have caught this
bug. With one command per caller of the defect, it also proves the fix sits
where all of them route through: a symptom fix leaves one red. It cannot
check edge-case coverage; that comes from the step 7 list.

`--repeat N` (N from `measure-repro.sh`): red needs one failure in N runs,
green needs N passes out of N — a lucky green on an intermittent bug fails.

## Red for the wrong reason

A red run only counts if the test reached the buggy code. A test that
imports a function the fix adds fails without the fix on an
`ImportError` — red, yet it never exercised the bug. The script prints the
last lines of the red output and, by default, rejects a red run that shows
the test could not even reach the code (import error, unresolved symbol at
compile time).

Stronger: name what the red must say.

```bash
<skill-dir>/scripts/verify-test-first.sh --expect-red 'TypeError.*NoneType' "<test-cmd>" -- <fix-file>
```

`--expect-red <regex>` replaces the heuristic — use it too when the import
error genuinely *is* the bug.

## Failure modes worth recognising

**"no pending changes in `<file>`"** (exit 2) — the fix must be
uncommitted when you run this. If the fix adds a brand-new file, git has
nothing to stash for it: stage it with `git add <file>` first (`git add -N`
does not work — `git stash` refuses intent-to-add entries). A fix that
deletes a file works as an unstaged deletion; a staged one (`git rm`) is
refused with the `git restore --staged` command to run.

**"test command succeeded even without the fix" when the test lives in the
fix file** (Rust `#[cfg(test)]`, doctests, a script asserting on itself) —
stashing the fix also stashes the test, so the red run ran the old tests.
The script cannot split one file; verify by hand: revert only the fix
hunk, run, expect red; restore, run, expect green — and say so in the
report.

**"test command succeeded even without the fix"** (exit 1) — the honest
answer is that the test does not reproduce the bug. Either it asserts
something that was already true, or a build cache served the fixed
artifact to the red run. Re-run with the cache disabled (`python3 -B`,
`jest --no-cache`, a clean build) before rewriting the test.

**"could not restore the fix — it is STILL IN THE STASH"** (exit 2) — the
test command rewrote one of the fix files mid-replay (a formatter, codegen,
`jest -u`, `pytest --snapshot-update`), so the stash pop conflicted. The
fix is not lost; it is in the stash. Recover exactly as the message says:

```bash
git checkout -- <fix-file>... && git stash pop
```

Then re-run with a test command that does not write to the files under
test.

**A stale build cache in general.** A bytecode or build cache that git
does not track (`__pycache__`, `.tsbuildinfo`, `target/`,
`node_modules/.cache`) survives the stash swap and can make the red run
silently reuse the fixed build — producing a false pass or a false fail.
Pass a test command that disables its cache.

## Suite gate — `verify-suite.sh`

Step 11's gate. Same stash replay as above, applied to the whole suite:
run without the fix, run with it, compare the failing tests by id.

- **Exit 3 is a pass with a duty.** Every listed failure also fails
  without the fix: the fix did not cause it. Report each one as a separate
  bug in the step 13 report — don't revert, don't fix it in this diff.
- **"UNVERIFIED"** (exit 1) — the suite fails both ways and no failing
  test id could be read from its output, so "pre-existing" can't be
  proven. Name them with a pattern matching a whole output line, first
  group = test id:

  ```bash
  verify-suite.sh --fail-pattern '^not ok [0-9]+ - (.*)$' "<suite-cmd>" -- <fix-file>
  ```

  Built in: pytest, unittest, go test, cargo test, jest/vitest, rspec,
  mocha, phpunit, minitest. Durations and colours are stripped before
  comparing, so the same test matches across runs.
- **A failure that appears only with the fix but looks flaky** — the gate
  still calls it NEW. Re-run the gate; if it flips, that's a flaky test to
  report, and the evidence is the two gate outputs, not an impression.
- Build caches and files rewritten by the suite: same traps and recovery
  as the red→green check above.
