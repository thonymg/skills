## Architecture note (archi-*.md)

### Filename

- `archi-<feature>.md`
- Reuse the exact same `<feature>` identifier everywhere (folders, types, ports, use-cases).

### Required content (top-down)

- Purpose
- Scope
- Non-goals
- Boundaries and dependency direction
- Implementation plan (ordered steps)
- Why (constraints, trade-offs, patterns chosen)
- External impacts (APIs, DB, configs, other repos/services if mentioned)
- Expected results (capabilities + guarantees enforced by types)

### Style

- Global → details.
- No long prose; prefer short bullets.
- No implementation details beyond what helps plan/coordination.

