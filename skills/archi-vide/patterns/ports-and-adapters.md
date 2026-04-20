## Ports & Adapters

### Use when

- There is IO (DB, HTTP, filesystem, queue, cache).
- You want strict dependency direction and testable use-cases.

### Structure

- `ports/`: interfaces the application depends on.
- `infra/`: adapters implementing ports (empty stubs).
- `application/`: use-cases depend on `ports/` + `domain/`.
- `domain/`: types only.

Dependency direction:
`infra → ports ← application → domain`

### Type rules

- Ports must be generic when reusable:
  - `Repository<TId, TEntity>`, `Clock`, `Logger`, `IdGenerator<TId>`
- Keep DTOs at the boundary. Domain types must not depend on infra.

