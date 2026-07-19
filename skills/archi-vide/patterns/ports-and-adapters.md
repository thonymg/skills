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

### Reference skeleton (TypeScript)

```typescript
// domain/order.ts — types only, zero imports from other layers
export type OrderId = string & { readonly __brand: 'OrderId' }
export type OrderStatus = 'pending' | 'paid' | 'cancelled'
export interface Order {
  readonly orderId: OrderId
  readonly orderStatus: OrderStatus
  readonly totalAmount: number
}

// ports/clock.ts — application-facing interface
export interface Clock {
  /** Current instant; injected so use-cases stay deterministic in tests. */
  getTimestamp(): Date
}

// application/cancel-order-service.ts — depends on ports/ + domain/ only
import type { Order, OrderId } from '../domain/order'
import type { OrderRepository } from '../ports/order-repository'
import type { Clock } from '../ports/clock'

export class CancelOrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly clock: Clock,
  ) {}

  async processOrderCancellation(orderId: OrderId): Promise<Order> {
    throw new Error('not implemented')
  }
}

// infra/clock-stub.ts — implements the port, obviously empty
import type { Clock } from '../ports/clock'

export class ClockStub implements Clock {
  getTimestamp(): Date { return new Date(0) }
}
```

Dependency check: `domain/` imports nothing; `ports/` imports `domain/`;
`application/` imports `ports/` + `domain/`; `infra/` imports `ports/` + `domain/`.
Nothing imports `infra/` except the composition root.

