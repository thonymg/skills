## Repository

### Use when

- The use-case needs to store/retrieve aggregates/entities.

### Port shape (generic)

- Prefer a generic repository port when it matches:
  - `Repository<TId, TEntity>`
- Specialize only when needed (avoid multiplying ports):
  - `OrderRepository` only if `Repository<TId, TEntity>` cannot express required queries.

### Separation

- Domain types are returned/accepted by the port.
- Persistence records (tables/documents) live in `infra/` and are translated by an adapter.

