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

### Rails mapping

When the target is a Ruby on Rails app, map the default layout onto Rails conventions:

| Layer | Rails location | Notes |
|:------|:---------------|:------|
| `domain/` | `app/models/` | ActiveRecord models + POROs; invariants documented, bodies empty |
| `application/` | `app/services/` | One use-case per class (`ProcessOrderPaymentService#call`), no IO |
| `ports/` | `lib/ports/` | Plain modules / duck types with RBS signatures |
| `infra/` | `app/adapters/` | ActiveRecord itself is the persistence adapter; external APIs get a `Gateway` |
| `api/` | `app/controllers/` | Thin: parse params → call service → render |

- Migrations carry the schema only — no data manipulation in a scaffold.
- Jobs (`app/jobs/`) and mailers (`app/mailers/`) are stubs delegating to services.
- Predicates end in `?` (see naming-convention Ruby rules); REST controller actions
  keep their fixed Rails names.

