---
name: archi-vide
description: Generate an empty, strongly-typed code architecture (no implementation), with minimal comments that document behavior and relationships between modules.
---

# Empty Architecture (Archi Vide)

Generate code scaffolding that is:
- **Empty**: no business logic, no side effects.
- **Predictable**: explicit dependencies and module boundaries.
- **Readable**: relationships are clear from type signatures + minimal doc comments.
- **Strictly typed**: type composition + generics by default.

Trigger this skill whenever the user asks for:
- A project/module skeleton, scaffolding, or “architecture”
- Stubbed code, interfaces, ports/adapters, clean architecture, DDD boundaries
- “Empty implementation” files to be filled later

## Output contract

Always deliver:
1. **File tree** (final structure).
2. **Code** for each file (or only the files the user requests).
3. **One short rationale** explaining boundaries + dependency direction.
4. **An architecture note**: an `archi-*.md` document (global → details) including: why, external impacts, expected results.

## Non-goals

- No real behavior, no algorithm, no persistence, no network calls.
- No heavy abstraction, no frameworks unless the user explicitly asks for one.
- No speculative features.

## Required loading (selective)

Always apply:
- Naming (mandatory): Use Skill `naming-convention` for every single identifier (files, folders, modules, namespaces, classes, types, interfaces, functions, methods, parameters, return types, variables, properties, DB tables/columns, routes).
  - Fallback if `naming-convention` is unavailable: camelCase functions/variables, PascalCase types/classes/components, kebab-case JS/TS/CSS files, snake_case Python/Ruby/Dart/Go files, SCREAMING_SNAKE_CASE constants — and keep names `prefix + entity (+ suffix)` shaped.
- Types: load [references/type-rules.md](references/type-rules.md).
- Stubs: load [references/stubs.md](references/stubs.md).
- Architecture note: load [references/architecture-doc.md](references/architecture-doc.md).

Default folder layout (omit folders you don’t need):
- `domain/`, `application/`, `ports/`, `infra/`, `api/`

Load exactly one language profile:
- TypeScript: [languages/typescript.md](languages/typescript.md)
- Python: [languages/python.md](languages/python.md)
- Ruby: [languages/ruby.md](languages/ruby.md)
- Dart/Flutter: [languages/dart-flutter.md](languages/dart-flutter.md)
- Go: [languages/go.md](languages/go.md)

Load patterns only when needed:
- IO boundaries: [patterns/ports-and-adapters.md](patterns/ports-and-adapters.md)
- Persistence: [patterns/repository.md](patterns/repository.md)
- Use-case coordination: [patterns/service.md](patterns/service.md)
- DTO translation: [patterns/adapter.md](patterns/adapter.md)
- Complex construction: [patterns/factory.md](patterns/factory.md)

## Generation procedure

1. Ask for the target language/runtime if unknown (TypeScript/Node, Python, Go, etc.).
2. Ask for the primary module boundary (feature name) and the IO needs (DB? HTTP? queue?).
2b. If `codebase-memory-mcp` is available and this scaffold lands inside an
   existing repo, check `index_status` first — index it (`index_repository`)
   if it isn't yet, then call `get_architecture(aspects)`. The new module's
   folder layout and dependency direction must match the codebase's actual
   boundaries, not just the default layout below. No MCP, greenfield repo,
   or not worth indexing for a single scaffold → use the default layout
   as-is.
3. Load only the files required by the context (language + patterns).
4. Produce a file tree including `archi-<feature>.md`.
5. Generate strictly-typed stubs that compile and remain obviously empty.
