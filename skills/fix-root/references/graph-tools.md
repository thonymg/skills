# Codebase graph (MCP) — calls per phase

Read this only when `codebase-memory-mcp` is available and you are about
to call it. Without the graph, the workflow still holds: read the files
and grep instead, and say that is what you did.

## Before the first call

Prefix and pi lazy-activation rules: SKILL.md. They apply to every call
below.

**Index freshness.** Check `index_status` first — under pi, which has no
`index_status` equivalent, use `list_projects` + `check_index_coverage`.
Not indexed or stale → `index_repository` before anything else: a stale
index gives wrong "this is the only caller" answers in both the step 6
baseline and the step 9 verification, and both of those are exhaustive
claims.

**Perimeter.** A project indexed on a *subfolder* of the repo answers
`total: 0` for everything above it, and blames your query rather than its
own scope. Query the project whose root covers the whole system the
failing call crosses.

**Depth.** `depth=2` is the default. Payload grows fast with depth; raise
it only when a chain genuinely runs deeper.

## Calls per phase

Steps 3, 6, 9 and 11 are full-track only — on the short track, skip those
rows entirely.

| Step | Need | Call |
|:-----|:-----|:-----|
| 0 | Repo indexed and current | `index_status` (pi: `list_projects` + `check_index_coverage`), then `index_repository` if stale |
| 2 | Locate symbols named in the error/stack trace | `search_graph(name_pattern="...")`, `search_code(pattern)` for the literal error string or log line |
| 2 | Unfamiliar subsystem | `get_architecture(aspects)` |
| 4 | Where a suspect function's data comes from, or who calls it | `trace_path(function_name, mode="data_flow"\|"calls", depth=2)` |
| 4 | Exact source of a symbol, without re-reading the whole file | `get_code_snippet(qualified_name)` |
| 4 | A pattern too specific for the built-in queries | `get_graph_schema()` then `query_graph(cypher)` |
| 4 | Bug might cross service boundaries | `trace_path(function_name, mode="cross_service")` |
| 4 | Rule out "this is intentional" — *only if the faulty code looks deliberate* (a guard, a special case, a comment defending it) | `manage_adr` |
| 6 | Every caller/consumer of the code the fix would touch (baseline) | `trace_path(function_name, direction="both", depth=2)`, then `check_index_coverage` on the files it touched |
| 6 | Same bug pattern duplicated elsewhere | `search_graph(name_pattern="...")` on the faulty pattern |
| 9 | Actual blast radius of the diff just made | `detect_changes()` |
| 9 | Post-fix callers vs the step 6 baseline | `trace_path(function_name, direction="both", depth=2)` again — anything new is scope creep |
| 9 | No sibling occurrence left behind | `search_graph` / `search_code` re-run on the faulty pattern |
| 9 | Signature changed → every call site still compatible | `query_graph(cypher)` over callers' argument shapes |
| 11 | Record the finding — *only if it contradicts a documented decision, or the bug already came back once* | `manage_adr` |

Steps 6 and 9 both call `trace_path` on purpose: the second call is what
catches scope creep the first one could not have predicted. Two calls, not
three — a separate re-check just before editing only repeats the baseline.

Full tool list and gotchas: the `codebase-memory` skill.
