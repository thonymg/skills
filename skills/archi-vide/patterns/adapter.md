## Adapter (translation layer)

### Use when

- You translate between boundary DTOs and domain types.
- You isolate weak/external types (`unknown`, `dynamic`, untyped hashes) into a single module.

### Rules

- Keep parsing/validation at the boundary (still empty; document constraints).
- Adapters are the only place allowed to use “weak” types locally.
- Prefer a generic mapper when it fits:
  - `Mapper<TIn, TOut>` / `Serializer<TIn, TOut>`

