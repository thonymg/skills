---
name: naming-convention
description: Structured naming convention system for code identifiers.
  Use when naming or renaming variables, functions, methods, classes, files,
  DB tables/columns, routes, or CSS classes; when validating identifiers against
  a convention; or when the user mentions naming, camelCase, snake_case,
  kebab-case, prefixes, or suffixes. Enforces a closed vocabulary
  (prefix + entity + suffix) with per-language casing rules.
---

# Naming Convention

## QUICK REFERENCE — approved vocabulary (flat list)

For simple naming, use this table directly. Load the `vocabulary/` files only in
the cases listed under « When to load the vocabulary files » below.

| Category | Approved words |
|:---------|:---------------|
| **Prefixes (read)** | get, fetch, find, list |
| **Prefixes (write)** | create, update, delete, add, remove, set, send, upload |
| **Prefixes (verify)** | is, has, can, validate |
| **Prefixes (compute/transform)** | calculate, count, format, convert, parse, map, filter, serialize |
| **Prefixes (orchestrate/init)** | handle, process, execute, sync, init, build, generate, reset |
| **Prefixes (lifecycle)** | run, start, stop, open, close, load, save, apply, refresh, retry |
| **Prefixes (events/hooks)** | register, subscribe, unsubscribe, emit, connect, disconnect, toggle, notify, render, use, on |
| **Entities** | User, Session, Token, Role, Permission, Order, Cart, Item, Product, Payment, Invoice, Subscription, Message, Notification, Document, Report, Team, Project, Task, Event, Config, Log, Job, Request, Response, Error, Cache, Query |
| **Collections** | List, Page, Batch, Results |
| **Attributes** | Id, Code, Key, Hash, Password, Token, Name, Title, Description, Summary, Content, Status, Type, Priority, Count, Amount, Total, Price, Quantity, Limit, Offset, Date, Timestamp, Duration, Url, Path, Payload, Metadata, Version |
| **Infra suffixes** | Service, Repository, Controller, Middleware, Router, Gateway, Client, Adapter, Queue, Worker, Factory, Builder, Mapper, Validator, Processor, Handler, Provider, Store, Reducer, Model, DTO, Schema, Enum, Util, Config, Logger, Constant, Mock, Stub, Fixture, Mailer, Migration, Policy, Serializer, Job |
| **UI suffixes** | Page, Screen, Layout, Header, Footer, Sidebar, Card, List, Item, Table, Badge, Avatar, Chart, Nav, Menu, Tabs, Breadcrumb, Pagination, Modal, Drawer, Toast, Tooltip, Spinner, Skeleton, Form, Input, Select, Button, Toggle, Checkbox, Icon |
| **Connectors** | To, From, In, By, Per, Of (patterns 5 and 8 only) |

Exemptions (never flag): language/framework lifecycle (`constructor`, `render`,
`ngOnInit`, …), entry points (`main`), test conventions (`test_*`, `describe`, `it`),
Rails REST actions (`index`, `show`, `new`, `edit`, `create`, `update`, `destroy`),
Ruby predicates — a trailing `?` replaces the verify prefix (`active?`, not `is_active`).

## When to load the vocabulary files

| Situation | Files to read |
|:----------|:--------------|
| Formal validation of identifiers requested | The files matching the element type (below) |
| A candidate token is NOT in the quick reference | The matching category file + `vocabulary/custom.md` |
| The project may define extra words | `vocabulary/custom.md` |
| Method / function (deep check) | `vocabulary/prefixes.md` + relevant entity file |
| Variable / property (deep check) | `vocabulary/suffixes-attributes.md` + `vocabulary/suffixes-entities.md` |
| Class / module (deep check) | `vocabulary/suffixes-infrastructure.md` + `vocabulary/suffixes-entities.md` |
| UI component (deep check) | `vocabulary/suffixes-ui.md` + `vocabulary/suffixes-entities.md` |
| DB table / column (deep check) | `vocabulary/suffixes-entities.md` + `vocabulary/suffixes-attributes.md` |

Never invent a word: if a token is in neither the quick reference nor the loaded
files nor `custom.md`, the name is invalid — propose adding the word to `custom.md`.

---

## CASING — one rule per element type

| Element | Rule | Example |
|:--------|:-----|:--------|
| Variable / function — JS, TS, Java, C#, Dart | `camelCase` | `orderStatus`, `fetchUser()` |
| Variable / function — Python, Ruby | `snake_case` | `order_status`, `fetch_user()` |
| Class / type / component — all languages | `PascalCase` | `UserService`, `OrderCard` |
| File — JS/TS modules, CSS, routes | `kebab-case` | `user-service.ts`, `order-card.css` |
| File — React/Vue/Flutter-web component | `PascalCase` | `UserCard.tsx` |
| File — Python, Ruby, Dart | `snake_case` | `order_repository.py`, `user_service.dart` |
| File — Rails migration | timestamp + `snake_case` | `20240101120000_create_orders.rb` |
| File — Java, Kotlin, C# | `PascalCase` (= class name) | `UserService.java` |
| DB column / table | `snake_case` | `order_status`, `created_at` |
| Global immutable constant | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| URL / CSS class / route | `kebab-case` | `/api/user-list`, `.order-card` |

⚠ Never apply kebab-case to Python/Dart/Ruby files: `order-repository.py` is not
importable. The casing follows the language, the vocabulary stays identical.

---

## NAME PATTERNS — pick the first that fits

| # | Pattern | Example |
|:--|:--------|:--------|
| 1 | `[Prefix] + [Entity]` | `fetchUser()`, `deleteOrder()` |
| 2 | `[Prefix] + [Entity] + [Attribute]` | `getOrderStatus()`, `updateUserEmail()` |
| 3 | `[is/has/can/validate] + [Entity] + [Attribute?]` | `isUserActive()`, `hasPermission()` |
| 4 | `[Prefix] + [Entity] + [Collection]` | `fetchUserList()`, `listOrderPage()` |
| 5 | `[Prefix] + [EntityA] + To/From + [EntityB]` | `assignUserToOrder()` |
| 6 | `[Entity] + [Infra suffix]` | `UserService`, `OrderRepository` |
| 7 | `[Entity] + [UI suffix]` | `UserCard`, `PaymentForm` |
| 8 | `[Action] + [Entity] + DTO` | `CreateOrderDTO`, `UpdateUserEmailDTO` |

---

## VALIDATION PROTOCOL — run on every name before delivering it

Decompose the identifier into tokens. Verify each token against the vocabulary.

```
fetchUserOrderList  →  fetch | User | Order | List
                          ↓       ↓       ↓      ↓
                       prefix  entity  entity  collection
                         ✅      ✅      ✅      ✅
```

**For each token ask:**
1. Is it a **prefix**? → present in the prefix list. One max, always first.
2. Is it an **entity**? → present in the entity list or `custom.md`.
3. Is it an **attribute / infra / UI / collection word**? → present in the matching category.
4. Is it a **connector** (`To`, `From`, `In`, `By`, `Per`, `Of`)? → allowed only in patterns 5 and 8.
5. **Token not found anywhere → name is INVALID. Do not deliver it.**

---

## AMBIGUOUS TOKENS — one canonical category each

These words appear in several categories. Resolve them with this table:

| Token | Canonical category | The other reading is allowed only when |
|:------|:-------------------|:---------------------------------------|
| `Item` | Entity (line item in a cart/order) | UI: last token of a list-row component (`UserListItem`) |
| `List` | Collection (end of a data name: `fetchUserList`) | UI: the whole PascalCase component is the list (`UserList`) |
| `Page` | UI (routed PascalCase component) | Collection: paginated data subset (`fetchOrderPage`) |
| `Config` | Infra suffix (`AppConfig` class/module) | Entity: a persisted configuration record |
| `Token` | Attribute (`sessionToken` field) | Entity: the auth domain itself (`TokenService`) |
| `Error` | Entity — any class ending in `Error` is valid | — |
| `Job` | Entity (a background process record) | Infra suffix: ActiveJob class (`ProcessPaymentJob`) |

---

## HARD RULES

- **One prefix per method.** `processAndSave()` ❌ — split into two methods.
- **No word outside the vocabulary.** Add it to `custom.md` first, then use it.
- **No contextual redundancy.** `user.getUserName()` ❌ → `user.getName()` ✅
- **No vague words.** `data`, `info`, `temp`, `flag`, `misc`, `stuff`, `thing` are forbidden everywhere.
- **No numbered identifiers.** `status2`, `error3` ❌ — name the actual concept.
- **No standalone infra suffix.** `Manager` ❌ → `OrderManager` ✅
- **SCREAMING_SNAKE_CASE** only for true immutable constants. Never on `var` / `let`.
- **Units when ambiguous.** `duration` ❌ → `durationInSeconds` ✅
- **Classes are substantive nouns only.** `Ordering` ❌, `ManageUser` ❌

---

## RENAMING AN EXISTING IDENTIFIER — use the codebase graph

Grep misses re-exports, aliases, and cross-service callers. If
`codebase-memory-mcp` is available:

0. `index_status` (or `list_projects`) — confirm the repo is indexed. Not
   indexed yet → run `index_repository` first; a stale index (files changed
   since last index) gives wrong "zero remaining hits" results in step 3, so
   re-index rather than trust it blindly.
1. `search_graph(name_pattern=".*oldName.*")` — every declaration/occurrence
   of the current name, repo-wide (not just the current file).
2. `trace_path(function_name="oldName", direction="both", depth=3)` — every
   caller and callee, including cross-service edges a text search won't see.
3. Rename the declaration and every site the graph returned, then re-run
   `search_graph` for the old name — zero remaining hits confirms a clean
   rename.

No MCP available, or indexing isn't worth it for a one-off rename → fall
back to Grep across the repo, and check the language's re-export /
barrel-file conventions by hand.

## EXTENDING THE VOCABULARY

If a word is missing from the vocabulary, do not invent it.
Propose adding it to `vocabulary/custom.md` with its category and definition.
Wait for confirmation before using it in any name.

---

## REFERENCE FILES — load only on demand

| File | Load when |
|:-----|:----------|
| `references/examples-by-domain.md` | User asks for examples |
| `references/language-specific-rules.md` | User asks about a specific language |
| `references/bootstrap-from-types.md` | User provides existing code to derive convention from |
| `references/extending-vocabulary.md` | User wants to add words via CLI |
