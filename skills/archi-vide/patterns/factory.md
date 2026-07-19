## Factory (construction)

### Use when

- Constructing a domain type requires multiple inputs or invariants.
- You want a single place to document invariants (without implementing them yet).

### Rules

- Factory returns a fully-formed domain type or a `Result<T, E>`.
- Use factories also for stub objects when a type must be non-null:
  - `createXStub()` for placeholders
  - `createX()` / `buildX()` for “real” construction (still empty)

### Reference skeleton (TypeScript)

```typescript
// domain/order-factory.ts
import type { Order, OrderError } from './order'
import type { Result } from './result'

/** Boundary shape used to request construction. */
export interface CreateOrderDTO {
  readonly userId: string
  readonly itemList: ReadonlyArray<{ productId: string; quantity: number }>
}

/**
 * Invariants documented here, enforced later:
 * - itemList must not be empty
 * - quantity must be >= 1
 */
export function createOrder(dto: CreateOrderDTO): Result<Order, OrderError> {
  throw new Error('not implemented')
}

/** Structurally-valid placeholder for tests and empty wiring. */
export function createOrderStub(): Order {
  throw new Error('not implemented')
}
```

