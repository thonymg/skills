# Codebase graph (MCP) — calls per hunt step

Read this only when `codebase-memory-mcp` is available and you are about to
call it. Without the graph the workflow is unchanged — grep and `git log`
instead, and say that is what you did.

## Before the first call

Prefix and pi lazy-activation rules: SKILL.md. They apply to every call
below.

**Index freshness.** Check `index_status` once per session — under pi, which
has no `index_status` equivalent, use `list_projects` +
`check_index_coverage`. Not indexed → `index_repository` first. A stale
index turns "this is the only caller" into a wrong answer, and that claim is
what makes a delete safe.

**Depth.** `depth=2` by default; payload grows fast with depth.

## Calls per step

| Need | Step | Call |
|:-----|:-----|:-----|
| Worst dead-code candidates repo-wide | 4a | `search_graph(max_degree=0, exclude_entry_points=true)` |
| Worst fan-out candidate repo-wide | 2, 4e | `search_graph(min_degree=10, direction="outbound")` |
| Every caller of a function before touching it | 3 | `trace_path(function_name, direction="both", depth=2)` |
| Sibling modules at the same layer, for the de facto convention | 3, 4f | `search_graph(name_pattern="<layer pattern>")` |
| Repo-wide near-duplicates before merging into one helper | 4d | `search_graph(name_pattern=".*similarName.*")` |
| Precise source range for one symbol, without re-reading a huge file | 3 | `get_code_snippet(qualified_name)` |
| What the diff actually affects | 2, 6 | `detect_changes()` |

A delete justified by `max_degree=0` is only as safe as the index behind
it: confirm coverage of the file before removing anything on that evidence
alone. Dynamic dispatch, reflection and string-keyed registries are
invisible to the graph.

Full tool list and gotchas: the `codebase-memory` skill.
