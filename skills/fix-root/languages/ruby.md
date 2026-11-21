# Ruby / Rails — fix-root profile

| Need | Command |
|:-----|:--------|
| One test | `bundle exec rspec <path>:<line>` · `bin/rails test <path>:<line>` · `ruby -Itest <file> -n <test_name>` |
| Order-dependent flake | `rspec --seed <n> --bisect` — finds the minimal set of tests that leak state |
| Full trace | `rspec --backtrace`, `BACKTRACE=1 bin/rails test` |
| Static evidence | `bundle exec rubocop <file>`; sorbet/steep when configured |
| Suite gate | rspec and minitest output are parsed natively |

`--expect-red`: `'expected .* got|Failure/Error'` — `NoMethodError ... nil` is often the bug itself

**Cache traps:** Spring serves old code → `DISABLE_SPRING=1` or
`bin/spring stop`; Bootsnap → `DISABLE_BOOTSNAP=1`.

**Classic roots:** a `nil` from `find_by` or a hash miss raising far
downstream — walk it back to where it was produced; `@x ||=` memoizing
`nil`/`false`; `Time.now` vs `Time.zone.now`; a default scope or callback
hiding rows; class-level state shared across requests or threads.
