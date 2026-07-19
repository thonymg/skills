## Go profile

### Types

- Ports = small interfaces, declared on the consumer side (`type OrderRepository interface { … }`).
- Domain types = structs with typed ids: `type OrderId string`.
- Use generics for recurring shapes: `Repository[TId, TEntity]`, `Page[T]`.
- Errors: return `(T, error)`; declare sentinel errors as package-level `ErrOrderNotFound`.
- Casing exception: Go initialisms keep Go style (`ID`, `URL`, `HTTP`) — the vocabulary
  words stay the same, only the rendering changes (`OrderID`, not `OrderId`).

### Weak types policy

- `any` / `interface{}` forbidden outside adapters; narrow at the boundary before returning.

### Stubs

- Empty bodies return zero values (`return Order{}, nil` is forbidden if it fakes success —
  prefer `return Order{}, ErrNotImplemented`).
- Non-null placeholders come from a stub factory: `createOrderStub()`.

### Files & packages

- Files: snake_case (`order_repository.go`), test files `*_test.go`.
- Packages: single lowercase word, no underscores (`order`, `payment`).
