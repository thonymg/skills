## Dart / Flutter profile

### Types

- Prefer immutable data types and `required` named parameters.
- Use generics for recurring shapes: `Result<T, E>`, `Page<T>`, typed collections.
- Prefer `sealed`/`base` types for tagged unions (Dart 3). If unavailable, emulate with class hierarchy + factory constructors.

### Weak types policy

- `dynamic` is forbidden in public APIs.
- If interacting with weak JSON/maps, contain `dynamic` inside adapters only and translate into typed DTOs/domain types.

