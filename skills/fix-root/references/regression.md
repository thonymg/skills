# Regression track — the history is the evidence

Read this only when the behavior demonstrably worked at some point. It
replaces steps 2-3 of the workflow and nothing else: the culprit commit
still has to survive step 4's evidence rule, and the fix still goes
through steps 7-12.

**Entry condition: a named good ref.** A tag, a release SHA, last
known-green CI. "It used to work" without a ref is not a starting point —
ask for one, or find one (`git tag --sort=-creatordate | head`, the last
green pipeline, the deploy log). Bisecting from an arbitrary old commit
wastes builds and can land outside the range that contains the change.

## Cheaper than bisect — try these first

Bisect costs one build+test per step (~log₂n runs). When the suspect line
is already known, history answers directly and instantly:

| Need | Call |
|:-----|:-----|
| Who last touched the faulty line, in which commit | `git blame -L <start>,<end> -- <file>` |
| When a string or symbol entered or left the code | `git log -S'<string>' --oneline -- <path>` (`-G` for a regex) |
| What changed in one file between good and bad | `git log -p <good>..<bad> -- <file>` |
| Which commits in the range touch the subsystem at all | `git log --oneline <good>..<bad> -- <dir>` |
| Whether the range is even worth bisecting | `git rev-list --count <good>..<bad>` |

If the range is small enough to read, read it. Bisect is for when it
isn't.

## Bisect, when the range is wide

The predicate is not a new artifact: it is the failing test from step 7,
exiting 0 when the behavior is **correct** and non-zero when the bug is
present. Write that test first, then:

```bash
<skill-dir>/scripts/bisect-run.sh --good <ref> [--bad <ref>] \
  [--keep <test-file>]... [--repeat N] -- <repro-cmd>
```

It wraps `git bisect run` with the guards that decide whether you get a
culprit or a confident wrong answer:

- **Dirty tree refused.** Bisect checks out other commits; uncommitted work
  is either carried across them — silently changing what you measure — or
  lost. Commit or stash first; the script will not do it for you.
- **`--keep <path>` for a tracked repro file.** A test committed *after*
  the regression does not exist at older commits: the command errors, git
  reads the non-zero exit as "bug present", and bisect converges on a
  commit far older than the real one. Raw `git bisect run` reports that
  wrong commit with exactly the confidence of a correct one; here the
  monotonicity re-check below turns it into a refusal to conclude instead.
  A refusal is still a wasted bisect — pass `--keep`, or avoid the
  situation entirely with a repro that lives outside the tree
  (`python3 -c '...'`, a script in `/tmp`), which needs no `--keep` at all.
- **`--repeat N`** runs the predicate N times per commit and calls the
  commit good only if all N pass.
- **`git bisect reset` always**, including on interrupt, so the repo is
  never left on a detached HEAD.
- **Monotonicity re-check.** After converging, the script re-runs the
  predicate on the culprit and on its parent. If the parent isn't good or
  the culprit isn't bad, the history is not monotonic and the result is
  announced as unreliable rather than as an answer.

**Exit 125 means "cannot test this commit"** (broken build, missing
dependency) and git skips it instead of blaming it. Make the repro return
125 in that case — otherwise a build failure reads as the bug and bisect
blames the commit that broke the build, not the one that broke behavior.

## What bisect cannot do

Each of these produces confident nonsense, not an error:

- **A flaky predicate.** If the bug reproduces 1 run in 20, every "good"
  verdict is unreliable and bisect converges on noise. Measured on a
  predicate that reports a false "good" half the time: at `--repeat 1` it
  returned a wrong commit or refused to conclude; at `--repeat 10` it found
  the right one. Raise `--repeat` until a good verdict means something —
  roughly, until `(1 - reproduction rate) ^ N` is negligible — or treat the
  bug as full-track instead of bisecting it.
- **Stale build artifacts.** Compiled output, `node_modules`,
  `__pycache__`, a warm cache surviving the checkout — you then test the
  previous commit's build. Rebuild inside the predicate or disable the
  cache; same trap as the one on `verify-test-first.sh`.
- **A non-monotonic history.** Bisect assumes one transition from good to
  bad. A bug introduced, partially fixed, then reintroduced — or one that
  needs two commits together — breaks that assumption, and git still
  returns a single commit. The script's monotonicity re-check catches the
  common shape of this; when it fires, fall back to reading
  `git log -p <good>..<bad>` over the failing subsystem.
- **A squashed or merged culprit.** Dozens of unrelated changes in one
  commit is not a diagnosis. Bisect inside it if the branch history
  survived; otherwise read its diff narrowed to the failing subsystem.

## The culprit commit is not the root cause

It is where the behavior **changed**. It may have introduced the bug, or
merely exposed one that was already latent — a caller that started passing
an empty list, a timeout that got shorter, a dependency that began
returning `null`. Feed its diff into step 4 as *evidence*, not as a
verdict, and fix the underlying defect. Reverting on reflex restores the
old behavior while leaving the latent defect in place, and the next caller
to hit it files the same bug again.
