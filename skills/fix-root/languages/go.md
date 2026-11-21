# Go — fix-root profile

| Need | Command |
|:-----|:--------|
| One test, no cache | `go test -count=1 -run '^TestName$' ./pkg/` — `-count=1` bypasses the test cache |
| Repeat in-process | `go test -count=<N> -failfast -run '^TestName$' ./pkg/` |
| Order-dependent flake | `go test -shuffle=on` prints the seed; replay with `-shuffle=<seed>` |
| Race detector | `go test -race -count=1 ./...` — a reported race is evidence with `file:line`, cite it |
| Full trace | `GOTRACEBACK=all` (every goroutine on panic), `go test -v` |
| Static evidence | `go vet ./...`, `staticcheck ./...` when installed |
| Suite gate | `go test` output is parsed natively, durations normalised |

`--expect-red`: `'--- FAIL|got .* want'` — `[build failed]` is a compile error, not the bug

**Cache traps:** the test cache → `-count=1` or `go clean -testcache`. A
`replace` directive or `vendor/` serving a stale copy: `go list -m all`,
`go env GOFLAGS`.

**Classic roots:** a nil pointer stored in an interface, so `err != nil` is
true; an `err` shadowed by `:=` in an inner scope; a loop variable captured
by a goroutine (before Go 1.22); concurrent map writes; `time.Time` compared
with `==` instead of `Equal`; an unbuffered channel nobody reads.
