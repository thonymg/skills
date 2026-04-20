## Type rules (strict)

### Goals

- Make relationships obvious via types (inputs/outputs express boundaries).
- Prefer composition + generics over repetition.
- Keep domain types stable; isolate boundary types (API/DB/infra DTOs).
- Use Skill `naming-convention` for every identifier mentioned or generated in the scaffold.

### Composition first

- Build types from smaller types; avoid “mega shapes”.
- Prefer capability composition (small interfaces/protocols/traits) over inheritance.
- Keep domain entities/value-objects separate from:
  - API DTOs
  - persistence records
  - external SDK types

### Generics required

Use generics for recurring shapes instead of duplicating variants:
- `Result<T, E>` for expected failure
- `Page<T>` / `CursorPage<T>` for lists
- `Repository<TId, TEntity>` for persistence ports
- `Serializer<TIn, TOut>` / `Mapper<TIn, TOut>` for translations

### Result style over exceptions (by default)

- Across boundaries (ports, use-cases), prefer returning `Result<T, E>`.
- Do not throw across boundaries unless explicitly requested by the user.

### Optionality must be explicit

- Use optional/nullable only when the type says so (`T | null`, `Optional[T]`, `T?`).
- Avoid “maybe fields” in domain types unless required by the domain.

### Forbidden weak types

- TypeScript: no `any`; keep `unknown` inside adapters only.
- Python: no untyped `dict`/`list` in public APIs; use `TypedDict`/`Mapping`/`Sequence`.
- Ruby: no untyped `Hash`/`Array` in public APIs when RBS exists.
- Dart: no `dynamic` in public APIs; contain it inside adapters only.

### Identity and primitives

Prefer explicit primitives for cross-boundary semantics:
- `Id` as an opaque/nominal type (branded/wrapper).
- serialized timestamps as `IsoDateTime` (string) across boundaries.
