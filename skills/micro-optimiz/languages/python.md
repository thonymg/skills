# Python profile

Language-specific detections to add to the catalog scan.

## Latent bugs
- Mutable default arguments (`def f(items=[])`) → `None` sentinel + init inside.
- Bare `except:` or `except Exception` that swallows → narrow the exception, re-raise with `raise … from e`, or let it propagate.
- `is` vs `==` misuse (`x is "done"`); `== None` → `is None`.
- Naive `datetime.now()` where timezone matters → `datetime.now(timezone.utc)`.
- Manual file/lock/connection handling → `with` context manager.
- Dict access `d["k"]` where absence is expected → `.get()` with explicit default (and the reverse: `.get()` hiding a required key).
- Shadowing builtins (`list`, `id`, `type`, `dict` as variable names).
- String path concatenation → `pathlib.Path`.

## Readability & idioms
- `range(len(xs))` indexing → direct iteration, `enumerate`, `zip`.
- Accumulator loops building a list → comprehension **when it stays one readable line**; nested/conditional-heavy comprehensions → back to a loop.
- `%` / `.format()` → f-strings per local style.
- `if x == True:` → `if x:`; `if len(xs) > 0:` → `if xs:` (only when emptiness is the real question).
- Missing type hints on public functions of the touched file → add them (params + return).
- Tuple-unpacking swap, `dict`/`set` literals over constructors.
- Repeated `d["a"]["b"]` chains → local variable.
- Grouped data travelling as tuples → `dataclass`/`NamedTuple` (single-file scope).

## Structure
- LBYL/EAFP: follow the file's dominant style; don't flip idioms gratuitously.
- Module-level mutable state → observation unless trivially encapsulated.

## Verification
Run `pytest` if tests exist; `python -m py_compile` / `mypy` if configured.
