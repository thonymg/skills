# Schema — migrations, API rules, the access matrix

## Migrations (Go)

```go
// migrations/1700000000_create_posts.go
package migrations

func init() {
    m.Register(func(app core.App) error {
        // up — runs in a transaction
        return nil
    }, func(app core.App) error {
        // down — the exact inverse of up (`migratedown`)
        return nil
    })
}
```

- Imported for side effects in `main`: `_ "yourmodule/migrations"`. Forgetting it silently skips every migration.
- One `m.Register` per file; files named `<unix timestamp>_<snake_name>.go` (naming-convention exempts the timestamp).
- New migrations run automatically on `serve`. CLI (needs `migratecmd.MustRegister`): `migrate up`, `migrate down [n]` (asks for confirmation), `migrate create "name"`, `migrate collections` (snapshot of the current collections), `migrate history-sync`.
- `Automigrate: osutils.IsProbablyGoRun()`: in dev, dashboard edits generate migration files — commit them. Never `true` in production (`automigrate`).
- Schema changes come from automigrate / `migrate collections`; hand-written migrations are for data, seeds and raw SQL (checklist).
- Data migrations are idempotent and batched for large tables (checklist).
- Rules in Go migrations are pointers: `types.Pointer("owner = @request.auth.id")`; `nil` = superusers only, `""` = public.

### Reversibility gate (`pbg migrate-check`, part of `finish`)

On a fresh data dir with the binary built from the project: `migrate up` →
schema S1 → `migrate down N` (N = migration files in the migrations dir) →
`migrate up` → schema S2. **S1 must equal S2.** A missing or partial `down`
makes the second `up` fail or the schema differ. PocketBase validates every
API rule while saving collections, so an invalid rule fails `up` itself.

## API rules and the access matrix

### Rules

- `nil` (Go) / `null` (JSON): superusers only — start here, open selectively.
- `""`: **public**, unauthenticated included. On create/update/delete it is a gate (`rules-public-write`); on list/view it is reported for review.
- `@collection.x.y` can match several rows: compare with the any-of operators `?=`, `?!=`, `?~`, `?>`… (`rules-collection-any`).
- Owned records: the update rule must stop ownership changes, e.g. `owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`; the create rule binds the owner: `owner = @request.auth.id`.
- Date macros that exist (v0.42 source): `@now @second @minute @hour @weekday @day @month @year @yesterday @tomorrow @todayStart @todayEnd @monthStart @monthEnd @yearStart @yearEnd` — there is no `@today`.
- Superusers bypass every rule: never test access with a superuser token.

### Statuses when a rule denies (measured on v0.42.3)

| Action | Allowed | Denied |
|---|---|---|
| list | 200, record present | 200, record absent (`"empty"`) |
| view | 200 | 404 |
| create | 200 | 400 |
| update | 200 | 404 |
| delete | 204 | 404 |
| any, rule `null` | — | 403 |

An unknown or expired token is rejected with 401 (v0.42+).

### `pb-access.json` — the specification (D4: blocking)

Every collection whose rules are not all `null` must have an entry; every
action × actor must have an expectation (view collections: list and view only).
A collection with a relation to an auth collection must also carry the
`spoofCreate` and `ownerChange` probes. Missing entries, `"?"` placeholders or
a mismatch fail `pbg access` and `pbg finish`.

```json
{
  "auth": "users",
  "actorData": {},
  "collections": {
    "posts": {
      "seed":   { "title": "t", "owner": "@owner" },
      "create": { "title": "n", "owner": "@actor" },
      "update": { "title": "u" },
      "probes": {
        "spoofCreate": { "as": "other", "action": "create", "data": { "title": "s", "owner": "@owner" }, "expect": 400 },
        "ownerChange": { "as": "owner", "action": "update", "data": { "owner": "@other" }, "expect": 404 }
      },
      "expect": {
        "list":   { "anon": "empty", "owner": "has",  "other": "empty" },
        "view":   { "anon": 404,     "owner": 200,    "other": 404 },
        "create": { "anon": 400,     "owner": 200,    "other": 200 },
        "update": { "anon": 404,     "owner": 200,    "other": 404 },
        "delete": { "anon": 404,     "owner": 204,    "other": 404 }
      }
    },
    "users": {
      "self": true,
      "create": { "email": "@unique" },
      "update": { "name": "renamed" },
      "expect": { "list": { "anon": "empty", "owner": "has", "other": "empty" }, "…": "…" }
    }
  }
}
```

- Actors: `anon` (no token), `owner` and `other` (fresh users of the `auth` collection; `actorData` adds required fields).
- Placeholders: `@owner`, `@other`, `@actor` (the acting user's id), `@unique` (a unique email). Auth records get a password automatically on creation.
- `seed` is created by a superuser before each case (fresh record per case); `self: true` (auth collections) makes the target record the acting owner itself.
- list expectations: `"has"` (200 and the seeded record is returned), `"empty"` (200 without it), or a status.
- The matrix is written from the **intended** behavior. `pbg access --init` only writes `"?"` placeholders: a matrix generated from current behavior would test nothing. Changing an existing expectation later needs an `access-spec` waiver from the user.
