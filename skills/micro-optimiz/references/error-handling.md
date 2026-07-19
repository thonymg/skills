# Error-handling moves

Errors are control flow too — the same rules apply: fewer paths, explicit
over implicit, resolved early. Every move here is behavior-preserving unless
marked `BUGFIX` (a swallowed error that should crash *is* a behavior change —
propose it separately).

## 1. Swallowed error → propagate or handle for real `BUGFIX`

**Detect:** empty `catch`/`except`/`rescue`; catch that logs and continues
while the caller assumes success.
**Fix:** rethrow with context, or return an explicit failure value the
caller must look at. If genuinely ignorable, say why in one comment.
**Principle:** fail fast — a hidden failure costs 100× more when it resurfaces.

## 2. Broad catch → narrow catch

**Detect:** `except Exception`, `catch (e)` wrapping a whole function body.
**Fix:** catch only the type the code can actually recover from, around
only the statement that can throw. Everything else propagates — a crash
with a stack trace beats a corrupted state.
**Principle:** catch what you can recover from; propagate the rest.

## 3. Try/catch as control flow → check first

**Detect:** exceptions used for expected cases (`try { parseInt } catch`,
key-miss handled by exception when a lookup-with-default exists).
**Fix:** the non-throwing API: `dict.get`, `Map.has`, `Number.isNaN`,
`firstWhere(orElse:)`.
**Principle:** exceptions are for the exceptional, not the expected.

## 4. Scattered try/catch → one boundary

**Detect:** the same catch-log-rethrow repeated in every function of a
module; error wrapping at every level of a call chain.
**Fix:** handle once at the boundary (request handler, job entry point,
CLI main); let the core propagate naturally. Interior code shrinks; the
policy (log, map to response, retry) lives in one place.
**Principle:** one policy, one place — error handling is a boundary concern.

## 5. Error-prone construct → construct that cannot fail

**Detect:** manual close/release (leak on the error path), index arithmetic
(off-by-one), manual null checks after every call.
**Fix:** `with`/`using`/`try-with-resources`/`ensure`, iteration
primitives, resolve-null-once at the top (composition-fp.md §10).
**Principle:** design errors out of existence — the best handler is no error.

## 6. Failure hidden in a return → failure visible in the signature

**Detect:** function returning `null`/`-1`/empty on failure with the meaning
documented nowhere; callers half of which forget the check.
**Fix:** make failure explicit and unmissable: throw, or return an
optional/nullable *typed* as such so the checker forces handling. Use a
Result type only if the codebase already has one — don't introduce the
pattern in one file.
**Principle:** the signature is the contract — failure belongs in it.

## 7. Silent fallback → loud fallback

**Detect:** `value = maybe ?? DEFAULT` on config/input where a typo then
runs forever with the default; retries without a cap.
**Fix:** keep the fallback but make it observable (one log line at the
boundary), or fail fast when the value is required. Bound every retry.
**Principle:** degradation is fine; *silent* degradation is a time bomb.

## 8. Error message without context → message that names the case

**Detect:** `throw new Error("invalid")`, `raise ValueError(str(e))`.
**Fix:** include what was expected, what was received, and the identifier
needed to reproduce (`"order 4231: quantity -2, expected > 0"`). One line.
**Principle:** an error message is read at 3am — write it for that reader.

## Scan order

1. §1–2 first: swallowed and over-broad catches are latent bugs (catalog A1).
2. §4–5: usually *delete* code — try/catch blocks vanish, LOC drops.
3. §6–8: clarity of the failure path — cheap wins, do them alongside.

## Guardrails

- Never widen what a function can throw without checking every caller in
  the targeted files.
- Removing a catch is safe only if the new propagation path is handled —
  trace it to its boundary before applying.
- Adding error handling where there was none = behavior change → `BUGFIX`,
  proposed separately, never mixed into the refactoring diff.
