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

### Reference skeleton (TypeScript)

```typescript
// ports/repository.ts
/** Generic persistence port. Domain types in, domain types out. */
export interface Repository<TId, TEntity> {
  /** Returns null when no entity matches the id. */
  findById(id: TId): Promise<TEntity | null>
  /** Creates or replaces the entity. */
  save(entity: TEntity): Promise<void>
  /** Removes the entity. No-op if absent. */
  deleteById(id: TId): Promise<void>
}

// ports/order-repository.ts
import type { Order, OrderId, OrderStatus } from '../domain/order'
import type { Repository } from './repository'

/** Specialized only because status queries cannot be expressed generically. */
export interface OrderRepository extends Repository<OrderId, Order> {
  listOrderByStatus(status: OrderStatus): Promise<Order[]>
}

// infra/order-repository-stub.ts
import type { Order, OrderId, OrderStatus } from '../domain/order'
import type { OrderRepository } from '../ports/order-repository'

/** Empty adapter. Real adapters add their tech word via vocabulary/custom.md. */
export class OrderRepositoryStub implements OrderRepository {
  async findById(_id: OrderId): Promise<Order | null> { return null }
  async save(_entity: Order): Promise<void> {}
  async deleteById(_id: OrderId): Promise<void> {}
  async listOrderByStatus(_status: OrderStatus): Promise<Order[]> { return [] }
}
```

