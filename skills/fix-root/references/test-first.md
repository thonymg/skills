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

It replays both states with `git stash`: `<test-cmd>` with the fix removed
must fail, with the fix restored must pass. Exit 0 only on a confirmed
red→green. Zero dependencies beyond bash and git.

It proves the test is not **vacuous** — that it would have caught this
bug. It cannot check that the test covers the right edge cases; that is
still yours, and comes from the step 6 edge-case list.

## Failure modes worth recognising

**"no pending changes in `<file>`"** (exit 2) — the fix must be
uncommitted when you run this. If the fix adds a brand-new file, git has
nothing to stash for it: `git add -N <file>` first so it is tracked, or
verify that file by hand.

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
