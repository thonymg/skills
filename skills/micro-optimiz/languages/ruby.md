# Ruby profile

Language-specific detections to add to the catalog scan.

## Latent bugs
- `rescue` without a class (catches StandardError implicitly is fine; `rescue Exception` is not) → narrow, add context, or re-raise.
- Chained method calls on possibly-nil → safe navigation `&.` (but repeated `&.&.&.` is a Demeter smell — extract).
- Mutable constants → `.freeze`; add `# frozen_string_literal: true` if the project uses it.
- `update`/`save` return values ignored where failure matters → `!` bang variants or explicit check.
- Comparing with `==` where `eql?`/`equal?` semantics were intended (rare — verify before flagging).

## Readability & idioms
- Trailing-`if`/`unless` for one-line guards: `return if user.nil?`.
- `unless … else` → invert to `if/else`; `unless` with `&&`/`||` → `if`.
- `for` loops → `each`; index loops → `each_with_index` / `each_with_object`.
- Accumulator loops → `map`, `select`, `reject`, `sum`, `count` when clearer.
- `if x == true` → `if x`; explicit `!= nil` → truthiness or `.nil?` per intent.
- Multi-branch `if/elsif` on one value → `case/when`.
- String keys duplicated as hash accessors → symbols per local style.
- Predicate methods end with `?`; dangerous variants with `!`.

## Structure
- Long method chains mixing query and mutation → split; CQS applies doubly in Ruby's fluent style.
- Repeated hash-digging `h[:a][:b]` → `dig(:a, :b)` or a local.

## Verification
`ruby -c` for syntax; run RSpec/Minitest if present; RuboCop if configured
(respect the project's `.rubocop.yml`, do not impose defaults).
