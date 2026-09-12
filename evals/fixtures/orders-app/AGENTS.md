# orders-app

Python service, one package per business domain under `src/`.

## Conventions

- A service class receives its HTTP client through its constructor. It never
  builds one and never reads configuration directly — the composition root
  wires it. This is what keeps services testable without patching.
- A service raises on failure. It never returns `None` to signal an error.
- Timeouts belong to the injected client, not to individual call sites.
