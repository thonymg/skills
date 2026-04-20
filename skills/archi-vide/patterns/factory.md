## Factory (construction)

### Use when

- Constructing a domain type requires multiple inputs or invariants.
- You want a single place to document invariants (without implementing them yet).

### Rules

- Factory returns a fully-formed domain type or a `Result<T, E>`.
- Use factories also for stub objects when a type must be non-null:
  - `createXStub()` for placeholders
  - `createX()` / `buildX()` for “real” construction (still empty)

