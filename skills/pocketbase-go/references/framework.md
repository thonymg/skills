# PocketBase as a Go framework — code, hooks, routes, tests

## PocketBase as a Go framework

Checked against the PocketBase v0.42.3 source and docs. Analyzer names refer
to `rules.md`.

### Module and toolchain

| Version | Module path | Go |
|---|---|---|
| ≤ v0.40.6 | `github.com/pocketbase/pocketbase` (frozen, last GitHub release) | — |
| ≥ v0.41.0 | `ganigeorgiev.com/pocketbase/pocketbase` | v0.42 requires Go 1.27 |

Migrating an existing project (CHANGELOG v0.41.0): replace the import path in
every `.go` file, replace the `require` line, `go mod tidy`. `pbg env` adds a
note while the project is on the frozen path.

### App lifecycle

```go
app := pocketbase.New()
migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: osutils.IsProbablyGoRun()}) // automigrate
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.GET("/api/myapp/hello", handler).Bind(apis.RequireAuth())
    return se.Next() // hooknext
})
if err := app.Start(); err != nil { log.Fatal(err) } // errignored
```

- `Automigrate` only under `go run`: `osutils.IsProbablyGoRun()` checks both `os.TempDir()` and `GOCACHE`. A hand-rolled `strings.HasPrefix(os.Args[0], os.TempDir())` has been wrong since Go 1.24 (binaries live in GOCACHE) (`automigrate`).
- Default SQLite driver is pure Go (no CGO); `Config.DBConnect` only for FTS5/ICU, called twice (`data.db` and `auxiliary.db`).

### Which app to use (`appscope`)

- In a hook or route handler: **`e.App`**, never an `app` captured from `main`. The handler may run inside a transaction; the outer app would wait for the write lock it holds (deadlock).
- In `app.RunInTransaction(func(txApp core.App) error {…})`: **`txApp`** only. The transaction commits only if the function returns `nil`. Nested transactions are safe through `txApp`.
- No email, HTTP call or slow I/O inside a transaction (one writer at a time) — checklist.
- Raw queries through `txApp.DB()` do not fire hooks.

### Errors (`errignored`)

Every error returned by a PocketBase API is handled: `app.Save`, `app.Delete`,
`e.JSON`, `app.Start`, `FindRecord*`… In routes, return the typed helpers:
`e.BadRequestError`, `e.UnauthorizedError`, `e.ForbiddenError`,
`e.NotFoundError`, `e.InternalServerError`. Raw error messages are only shown
in the dashboard logs / `--dev`.

Lookups: a single fetch on a miss returns `nil` + `sql.ErrNoRows`; a multi
fetch returns an empty slice and `nil`.

### Queries (`filterbind`)

Filters and raw SQL are **constants** with `{:name}` placeholders, values in `dbx.Params`:

```go
app.FindFirstRecordByFilter("articles", "status = 'public' && category = {:category}", dbx.Params{"category": c})
app.DB().NewQuery("SELECT id FROM posts WHERE owner = {:owner}").Bind(dbx.Params{"owner": id}).All(&rows)
```

String concatenation or `fmt.Sprintf` in a filter is a gate (injection).

### Settings, mail, files, cron

- `app.Settings()` is read when needed, never cached in a package variable (`settingscache`): settings change at runtime.
- Mail sender: `app.Settings().Meta.SenderAddress` at send time, never a literal address (`mailersender`).
- `app.NewFilesystem()` / `NewBackupsFilesystem()` / `GetReader()`: `defer x.Close()` on each (`fsclose`).
- `app.Cron().MustAdd(id, expr, fn)`: stable constant id, never the reserved `__pb` prefix (`cronid`). `MustAdd` panics on an invalid expression; `Add` returns an error. Each job runs in its own goroutine.

### Records

Typed getters (`GetString`, `GetInt`, `GetInt64` for values beyond 2^53, `GetDateTime`…), modifiers (`"tags+"`, `"files-"`), `record.Hide("field")` in `OnRecordEnrich`. `SaveNoValidate` skips validation — needs a reason in review.

## Hooks and routing

### The hook chain (`hooknext`)

A handler bound with `BindFunc` (or `Bind(&hook.Handler{Func: …})`) receives
the event and **must call `e.Next()`** to continue the chain and reach the
default action. Its error is returned or checked, never discarded:

```go
app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
    // before validation and before the INSERT
    if err := e.Next(); err != nil {
        return err
    }
    // after the INSERT — but not necessarily persisted (transaction)
    return nil
})
```

Router middlewares (`se.Router.BindFunc`, `group.BindFunc`) follow the same
rule. Route actions (`se.Router.GET(path, fn)`) do not call `Next`.

`Bind` with an `Id` allows a later `Unbind(id)`; `UnbindAll()` also removes
system handlers — avoid it.

### Record hooks: order and guarantees

- Create/Update: `OnRecordCreate` (or `Update`) → `OnRecordValidate` → `OnRecordCreateExecute`. Delete: `OnRecordDelete` → internal checks → `OnRecordDeleteExecute`.
- A successful `*Execute` hook does **not** guarantee persistence. Side effects that need the record saved (email, webhook) go in `OnRecordAfterCreateSuccess` (or `Update`/`Delete`), which inside a transaction is delayed until commit and **not** triggered on rollback (checklist `after-success`).
- `OnRecordEnrich` shapes every response, realtime included (`e.Record.Hide("role")`, `WithCustomData(true)`). Prefer it to list/view request hooks (checklist).
- Request hooks (`OnRecordCreateRequest`…) are HTTP-only; return `e.BadRequestError(…)` to block.
- Hooks can recurse (cascade delete): no global mutex (checklist).
- Events carry an `Extra` map (v0.41+) to share data between non-record handlers.

### Routes

```go
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    g := se.Router.Group("/api/myapp")
    g.Bind(apis.RequireAuth())
    g.GET("/posts/{id}", func(e *core.RequestEvent) error {
        id := e.Request.PathValue("id")
        rec, err := e.App.FindRecordById("posts", id)
        if err != nil {
            return e.NotFoundError("", err)
        }
        return e.JSON(http.StatusOK, rec)
    })
    return se.Next()
})
```

- Path parameters are `{name}`, `{name...}`, `{$}` — never `:name` (`routepath`).
- Namespace under `/api/<yourapp>/`; never under a system path (`/api/collections`, `/api/files`, `/api/realtime`, `/api/settings`, `/api/backups`, `/api/logs`, `/api/crons`, `/api/health`, `/api/batch`, `/api/oauth2-redirect`) (`routepath`).
- Auth is explicit: `apis.RequireAuth(collections…)`, `RequireSuperuserAuth()`, `RequireSuperuserOrOwnerAuth(param)`, `RequireGuestOnly()` on the route or its group. A route without any is reported for review (`routeauth`).
- `e.BindBody(&s)`: the struct must not expose fields the client may not set (checklist).
- Default global middlewares: ~32 MB body limit, CORS, rate limiter, auth token loader; since v0.42 an unknown or expired `Authorization` token is rejected with 401.

## Testing a PocketBase Go app

Two layers, both deterministic:

1. **Access matrix** (`pb-access.json`, run by `pbg access` / `pbg finish`) — API rules, end to end, against an ephemeral instance built from the project. An access bug starts as a failing row.
2. **Go tests** (`go test ./...`, recorded by `pbg step suite`) for custom routes, hooks and business logic:

```go
const testDataDir = "./test_pb_data" // committed; created with: ./app serve --dir=./test_pb_data --automigrate=0

func TestHelloRequiresAuth(t *testing.T) {
    scenarios := []tests.ApiScenario{
        {
            Name:           "guest",
            Method:         http.MethodGet,
            URL:            "/api/myapp/hello",
            ExpectedStatus: 401,
            ExpectedContent: []string{`"data":{}`},
            TestAppFactory: setupTestApp,
        },
    }
    for _, s := range scenarios {
        s.Test(t)
    }
}

func setupTestApp(t testing.TB) *tests.TestApp {
    app, err := tests.NewTestApp(testDataDir)
    if err != nil {
        t.Fatal(err)
    }
    bindAppHooks(app) // the same function main() uses — never a copy
    return app
}
```

- `scenario.Test(t)` cleans the app up; a manual `tests.NewTestApp` needs `defer app.Cleanup()`.
- Assert `ExpectedEvents` for hooks that must (or must not) fire.
- Auth tokens in tests: `record.NewAuthToken()`.
- Register hooks/routes through one function shared by `main` and tests, so the tests exercise the real wiring.
