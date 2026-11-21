# Rule catalog (generated — `pbg gen-references`, do not edit)

Gate findings block `pbg verify`/`pbg finish` when NEW against the git baseline. Review findings and the checklist are reported, never blocking.

## pbcheck analyzers (Go, `tooling/pbcheck/checks`)

| analyzer | class | rule |
|---|---|---|
| `hooknext` | gate | hook and middleware handlers must call e.Next() and propagate its error |
| `appscope` | gate | inside RunInTransaction use txApp; inside hook/route handlers use e.App, never a captured app |
| `filterbind` | gate | filters and raw SQL are constants with {:placeholders} bound through dbx.Params |
| `routepath` | gate | route paths use {param} (not :param) and never shadow system /api/ routes |
| `fsclose` | gate | filesystems and readers from NewFilesystem/NewBackupsFilesystem/GetReader are closed |
| `migratedown` | gate | every migration registers a down function (reversibility is verified by pbg migrate-check) |
| `automigrate` | gate | Automigrate is enabled only under `go run` (osutils.IsProbablyGoRun), never hard-coded |
| `cronid` | gate | cron jobs have a stable constant id that does not use the reserved __pb prefix |
| `errignored` | gate | errors returned by PocketBase APIs are never discarded |
| `mailersender` | gate | mail senders come from app.Settings().Meta at send time, never a literal |
| `settingscache` | gate | app.Settings() is read at call time, never cached in a package variable |
| `routeauth` | review | custom routes declare their auth (apis.RequireAuth/RequireSuperuserAuth/…); review finding |

## Other code gates

- `staticcheck` (pinned in `tooling/pbcheck/go.mod`, default checks) — every finding is a gate.
- `gofmt -l` on changed files.
- The project must build (`compile`).

## Schema and runtime gates (ephemeral PocketBase)

| check | class | rule |
|---|---|---|
| `rules-public-write` | gate | create/update/delete rule `""` (anyone, even unauthenticated) |
| `rules-collection-any` | gate | `@collection.*` compared with a single-value operator instead of `?=`, `?~`… |
| `rules-public-read` | review | list/view rule `""` |
| `rules-owner-change` | review | update rule does not constrain the relation to the auth collection |
| `access` | gate | every case of `pb-access.json` matches; every collection with non-null rules is specified (anon/owner/other × actions, `spoofCreate`/`ownerChange` probes for owned collections) |
| `access-spec` | gate | an existing expectation changed without a validated waiver |
| `migrations` | gate | `migrate up` → `down N` → `up` gives an identical schema |

Measured on PocketBase v0.42.3: denied list → 200 with the record absent, denied view/update/delete → 404, denied create → 400, `null` rule → 403, successful delete → 204, unknown token → 401.

## Review checklist

| id | applies to | check |
|---|---|---|
| enrich-not-list-hooks | hooks | Response shaping (hiding fields, computed values) is done in OnRecordEnrich, not in list/view request hooks (realtime goes through Enrich too). |
| after-success | hooks | Side effects that require the record to be persisted (emails, webhooks) run in OnRecordAfter*Success, never in *Execute or before e.Next(). |
| no-external-in-tx | go | No email, HTTP call or other slow external I/O inside RunInTransaction. |
| no-global-mutex | hooks | Hooks take no global mutex (hooks can recurse, e.g. cascade delete). |
| bindbody-fields | hooks | Structs passed to e.BindBody have no exported field the client must not set. |
| route-namespace | hooks | Custom routes live under /api/<yourapp>/ and use apis.Require* explicitly when not public. |
| migration-snapshot | migrations | Schema changes come from `migrate collections` / automigrate in dev and are committed; hand-written migrations only for data/seed. |
| data-migration-idempotent | migrations | Data migrations are idempotent and batched for large tables. |
| index-rule-fields | access | Fields used in list/view rules and frequent filters/sorts are indexed. |
| apiscenario | test | Custom routes and hooks are covered by tests.ApiScenario with ExpectedEvents, using a committed test_pb_data. |
