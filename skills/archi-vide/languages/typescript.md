## TypeScript profile

### Types

- Prefer `type` + composition; use `interface` for ports.
- Prefer discriminated unions for errors and results.
- Use generics for recurring shapes: `Result<T, E>`, `Page<T>`, `Repository<TId, TEntity>`.
- Use branded ids for identity: `type UserId = string & { readonly __brand: 'UserId' }`.
- Prefer `readonly` properties.

### Weak types policy

- `any` is forbidden.
- `unknown` is allowed only inside adapters and must be narrowed before leaving the adapter.

### Stubs

- Prefer returning empty values that satisfy the type.
- For non-null objects, return a stub factory (`createXStub()`).

