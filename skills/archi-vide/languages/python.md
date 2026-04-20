## Python profile

### Types

- Use `typing` everywhere: `TypeVar`, `Generic`, `Protocol`, `TypedDict`, `Literal`, `Final`.
- Prefer `Protocol` for ports (structural typing).
- Prefer immutable domain shapes (`dataclass(frozen=True, slots=True)`).
- Prefer generics for recurring shapes:
  - `Result[T, E]`, `Page[T]`, `Repository[TId, TEntity]`

### Weak types policy

- Public APIs must not use untyped `dict`/`list`.
- If parsing external payloads is required, contain weak shapes inside adapters and convert to typed DTOs/domain types.

