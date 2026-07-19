# Dart / Flutter profile

Language-specific detections to add to the catalog scan.

## Latent bugs
- `!` null assertions on values that can actually be null → proper promotion, `??` default, or early return.
- `late` fields that may be read before init → constructor init or nullable.
- Unawaited futures in `async` code → `await` or explicit `unawaited(…)` with rationale.
- `dynamic` sneaking into signatures → precise type or generic.
- Non-exhaustive `switch` on enums/sealed classes → cover all cases; Dart 3 exhaustiveness makes the compiler your ally.
- `setState` after `await` without `mounted` check (Flutter).

## Readability & idioms
- `var` on never-reassigned locals → `final`; compile-time constants → `const` (also `const` constructors/widgets where applicable — real win in Flutter rebuilds).
- Cascade `..` for consecutive calls on the same receiver.
- Collection-`if` and collection-`for` instead of imperative list building — the biggest readability idiom in widget lists.
- String interpolation over concatenation.
- Positional booleans in constructors → named parameters.
- `??`, `??=`, `?.` over manual null checks.
- Records/pattern matching (Dart 3) for multi-value returns instead of ad-hoc classes — single-file scope only.

## Flutter-specific
- Deeply nested widget trees in one `build` → extract widget-returning methods or small private widgets **within the same file** (prefer widgets over methods when the subtree is static — enables const).
- Magic EdgeInsets/durations repeated → local constants.
- Business logic inside `build` → extract pure function.

## Verification
`dart analyze`; run tests if present. Respect `analysis_options.yaml`.
