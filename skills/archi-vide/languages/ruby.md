## Ruby profile

### Types

- Generate RBS (`sig/`) alongside Ruby code (`lib/`) by default.
- Prefer composition with small modules for roles (ports/adapters) instead of inheritance.
- Public APIs must have RBS signatures for:
  - method params and returns
  - hashes/arrays element types

### Stubs

- Keep Ruby bodies empty/minimal and let RBS carry the contract.
- Keep translation concerns inside adapters.

