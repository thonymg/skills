# Examples by Domain

All examples demonstrate patterns using the approved vocabulary.
Syntax (camelCase vs snake_case) adapts to the language — the patterns are universal.

---

## Classes & Architectural Roles

Pattern: `[Entity] + [Infra Suffix]`

```
// ✅
UserService
OrderRepository
PaymentGateway
InvoiceProcessor
EmailClient
AuthMiddleware
UserMapper
OrderValidator

// ❌ Forbidden
DataManager       // "Manager" standalone — not in vocabulary
UserHelper        // "Helper" standalone — must be paired: AuthHelper
OrderHandler      // "Handler" standalone — must be paired: ErrorHandler
```

---

## Methods & Functions

### Action on Entity — `[Prefix] + [Entity]`
```
// ✅
fetchUser(id)
createOrder(data)
deleteSession(sessionId)
processPayment(orderId)
generateToken(userId)
validateEmail(email)

// ❌ Forbidden
getUser_data()      // "data" not in vocabulary
doProcess()         // "do" not a prefix
manageOrder()       // "manage" not a prefix
```

### Action on Attribute — `[Prefix] + [Entity] + [Attribute]`
```
// ✅
getUserId(user)
getOrderStatus(orderId)
updateUserEmail(userId, email)
setSessionToken(sessionId, token)
calculateOrderTotal(orderId)
countOrderItems(orderId)

// ❌ Forbidden
order.getOrderStatus()    // contextual redundancy — use order.getStatus()
getUserInfo()             // "info" not in vocabulary — use getUserProfile()
```

### Boolean Check — `[Verify Prefix] + [Entity] + [optional Attribute]`
```
// ✅
isUserActive(userId)
hasPermission(userId, permission)
canDeleteOrder(userId, orderId)
validatePayload(payload)
isSessionExpired(session)
hasOrderItems(orderId)

// ❌ Forbidden
checkIfUserIsActive()    // "checkIf" — use is/has/can directly
userActive()             // no prefix
```

### Collection Action — `[Prefix] + [Entity] + [Collection Suffix]`
```
// ✅
fetchUserList()
listOrdersByStatus(status)
getOrderItems(orderId)
fetchSearchResults(query)
listTaskPage(page, limit)

// ❌ Forbidden
getUsers()         // ambiguous — prefer fetchUserList() or listUsers()
getAllData()        // "data" not in vocabulary
```

### Entity Relation — `[Prefix] + [Entity A] + To/From + [Entity B]`
```
// ✅
assignUserToOrder(userId, orderId)
addItemToCart(itemId, cartId)
removeItemFromCart(itemId, cartId)
```

---

## Variables & Properties

Pattern: `[optional Verify Prefix] + [Entity or Attribute Suffix]`

```
// ✅ — plain values
totalAmount
orderStatus
sessionToken
userCount
taskPriority
requestPayload

// ✅ — booleans (must use verify prefix)
isActive
hasPermission
canEdit
isSessionExpired

// ✅ — constants (SCREAMING_SNAKE_CASE)
MAX_RETRY_COUNT
DEFAULT_SESSION_DURATION
API_BASE_URL

// ❌ Forbidden
x, d, tmp, info     // no suffix
data                // "data" not in vocabulary
flag                // raw word — use isActive, hasPermission
status2             // no numbering
USER_DATA           // SCREAMING_SNAKE_CASE for constants only
```

---

## Data Contracts

Pattern: `[Action or Entity] + [Entity] + [DTO / Schema / Enum]`

```
// ✅
CreateOrderDTO
UpdateUserEmailDTO
UserSchema
OrderStatusEnum
PaymentTypeEnum

// ❌ Forbidden
OrderData           // "data" not in vocabulary — use OrderDTO
NewUser             // adjective as prefix — use CreateUserDTO
```

---

## Files & Modules

Pattern: one file = one entity + one infra suffix (snake_case for Python/files, PascalCase for Java/C#)

```
// ✅ — snake_case (Python, Dart, DB migrations)
user_service.py
order_repository.py
payment_gateway.py
auth_middleware.py
create_order_dto.py

// ✅ — PascalCase (Java, C#, Kotlin)
UserService.java
OrderRepository.cs
PaymentGateway.kt

// ✅ — kebab-case (CSS, routes, HTML)
user-profile.css
order-list.html
/api/user-orders

// ❌ Forbidden
userHelper.py           // camelCase for files
DataManager.java        // "Manager" standalone
order_handler_stuff.py  // "stuff" not in vocabulary
```

---

## Database Tables & Columns

```sql
-- ✅ Tables: snake_case, plural entity suffix
users
orders
order_items
user_sessions
payment_logs
task_batches

-- ✅ Columns: snake_case, approved attribute suffix
user_id
order_status
total_amount
created_timestamp
updated_timestamp
is_active          -- boolean: is_ prefix
has_paid           -- boolean: has_ prefix
session_token
request_payload

-- ✅ Index & constraint naming: [type]_[table]_[column]
idx_users_email
fk_orders_user_id
uq_users_email

-- ❌ Forbidden
User               -- PascalCase invalid in SQL
orderData          -- "data" not in vocabulary
tbl_users          -- "tbl_" not in prefix list
flag               -- not in vocabulary
dt                 -- abbreviation
```

---

## Anti-Pattern Quick Reference

| ❌ Bad | ✅ Good | Rule violated |
|:------|:-------|:-------------|
| `user.getUserName()` | `user.getName()` | Contextual redundancy |
| `getData()` | `fetchUserList()` | "data" not in vocabulary |
| `doProcess()` | `processOrder()` | "do" not a prefix |
| `Manager`, `Handler` alone | `OrderProcessor`, `ErrorHandler` | Infra suffix needs entity |
| `status2`, `newValue` | `orderStatus`, `updatedTimestamp` | No numbering or raw adjectives |
| `getAndSaveUser()` | `getUser()` + `saveUser()` | One prefix per method |
| `USER_DATA` (variable) | `userData` | SCREAMING_SNAKE_CASE for constants only |
