## Application service (use-case coordinator)

### Use when

- A single use-case coordinates multiple ports (repo + clock + logger + external API).
- The behavior is still empty, but wiring must be explicit.

### Rules

- One use-case = one responsibility.
- Inputs/outputs are explicit types (`*DTO` in, `Result<*, *>` out).
- No IO directly; delegate to ports.

### Reference skeleton (TypeScript)

```typescript
// application/process-order-payment-service.ts
import type { Order, OrderId } from '../domain/order'
import type { Payment, PaymentError } from '../domain/payment'
import type { OrderRepository } from '../ports/order-repository'
import type { PaymentGateway } from '../ports/payment-gateway'
import type { Result } from '../domain/result'

/** Input DTO — boundary shape, no domain invariants. */
export interface ProcessOrderPaymentDTO {
  readonly orderId: OrderId
  readonly amountInCents: number
}

/**
 * Use-case: charge an order.
 * Reads the order, delegates the charge to the gateway, persists the outcome.
 * Depends on ports only — no IO here.
 */
export class ProcessOrderPaymentService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  async processOrderPayment(
    dto: ProcessOrderPaymentDTO,
  ): Promise<Result<Payment, PaymentError>> {
    throw new Error('not implemented')
  }
}
```

