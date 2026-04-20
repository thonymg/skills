## Empty implementations (stubs)

### Rules

- Must compile.
- Must be obviously empty (no “fake logic”).
- Must not perform IO or side effects unless explicitly requested.

### Preferred stub strategy

- `void` / `Promise<void>` / `Future<void>`: no-op.
- list/array: return empty list.
- map/dict/record: return empty map/record (typed).
- optional: return `null`/`None` only if explicitly allowed by the type.
- non-null object: return a structurally-valid placeholder from a dedicated stub factory:
  - `createXStub()` / `buildXStub()` / `makeXStub()`

### Avoid

- returning partial objects unless the return type is explicitly partial
- populating fields with made-up values to look “real”

