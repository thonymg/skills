# Python — fix-root profile

| Need | Command |
|:-----|:--------|
| One test, no cache | `python3 -B -m pytest -p no:cacheprovider 'path::test' -q` · `python3 -B -m unittest mod.Class.test` |
| Order-dependent flake | `pytest -p no:randomly` vs `pytest --randomly-seed=<n>` (pytest-randomly) |
| Provoke a thread race | `sys.setswitchinterval(1e-6)` in the repro — far more interleavings per run |
| Full trace | `PYTHONFAULTHANDLER=1` (segfault), `python3 -X dev` (warnings, asyncio debug) |
| Static evidence | `mypy <file>` / `pyright <file>` when configured, `ruff check <file>` |
| Suite gate | pytest and unittest output are parsed natively |

`--expect-red`: `'AssertionError|assert '` — or the exact exception the bug raises

**Cache traps:** `__pycache__` → `-B`; `.pytest_cache` reorders tests →
`-p no:cacheprovider`. An installed copy shadowing the source:
`python3 -c 'import m; print(m.__file__)'` must point into the repo.

**Classic roots** (the crash shows elsewhere): a mutable default argument
shared across calls; a late-binding closure in a loop; `if x:` where `0` or
`""` is a valid value; naive vs aware `datetime`; an `except` that re-raises
without `from`, so the trace starts at the wrong place.
