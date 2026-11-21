# Dart / Flutter — fix-root profile

| Need | Command |
|:-----|:--------|
| One test | `flutter test <path> --plain-name '<name>'` · `dart test <path> -N '<name>'` |
| Order-dependent flake | `dart test --test-randomize-ordering-seed=<n>` (same flag for `flutter test`) |
| Asserts on | `dart run --enable-asserts` — off by default outside tests, so a guard may never run |
| Static evidence | `dart analyze <file>` / `flutter analyze` (`unawaited_futures`, `use_build_context_synchronously`) |
| Suite gate | not parsed natively: run with `--reporter expanded` and pass `--fail-pattern '^[0-9:]+ [+~0-9 ]*-[0-9]+: (.+) \[E\]$'` |

`--expect-red`: `'Expected:|TestFailure'`

**Cache traps:** `flutter clean`; stale generated `*.g.dart` →
`dart run build_runner build --delete-conflicting-outputs`.

**Classic roots:** a `!` on a value that is null on one path; a `late` field
read before init; an unawaited future; `setState` or a `BuildContext` used
after an async gap; missing keys in a list, so state sticks to the wrong
item; local vs UTC `DateTime`.
