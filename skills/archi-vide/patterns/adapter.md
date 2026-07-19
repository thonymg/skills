## Adapter (translation layer)

### Use when

- You translate between boundary DTOs and domain types.
- You isolate weak/external types (`unknown`, `dynamic`, untyped hashes) into a single module.

### Rules

- Keep parsing/validation at the boundary (still empty; document constraints).
- Adapters are the only place allowed to use “weak” types locally.
- Prefer a generic mapper when it fits:
  - `Mapper<TIn, TOut>` / `Serializer<TIn, TOut>`

### Reference skeleton (TypeScript)

```typescript
// infra/order-model.ts
/** Persistence record — mirrors the table, never leaves infra/. */
export interface OrderModel {
  readonly id: string
  readonly status: string
  readonly total_amount: number
  readonly created_timestamp: string
}

// infra/order-mapper.ts
import type { Order } from '../domain/order'
import type { OrderModel } from './order-model'

/** Translation layer: the only module allowed to see both shapes. */
export interface OrderMapper {
  /** Narrows the raw record into a domain type. May reject invalid rows. */
  convertOrderModelToOrder(model: OrderModel): Order
  /** Flattens the domain type back into a persistence record. */
  convertOrderToOrderModel(order: Order): OrderModel
}

// infra/http/parse-order-payload.ts
/** Boundary parsing: `unknown` is allowed here and nowhere else. */
export function parseOrderPayload(payload: unknown): OrderModel {
  throw new Error('not implemented')
}
```

