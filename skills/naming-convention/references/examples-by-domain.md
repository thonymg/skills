# Examples by Domain

All examples use ONLY approved prefixes and suffixes from Layer 3.

---

## Backend (Node.js / TypeScript)

### Classes
```typescript
// ✅ [Entity Suffix] + [Infra Suffix]
class UserService { }
class OrderRepository { }
class PaymentGateway { }
class InvoiceProcessor { }
class EmailClient { }
class AuthMiddleware { }
class UserMapper { }
class OrderValidator { }

// ❌ Forbidden — words outside approved vocabulary
class DataManager { }      // "Manager" not in infra suffixes as standalone
class UserHelper { }       // only valid paired: AuthHelper, FormatHelper
class OrderHandler { }     // "Handler" needs entity: ErrorHandler, EventHandler
```

### Methods
```typescript
// ✅ [Action Prefix] + [Entity Suffix]
getUserById(id: string): User
fetchOrdersByStatus(status: OrderStatus): Order[]
calculateOrderTotal(orderId: string): number
updateUserEmail(userId: string, email: string): void
deleteExpiredSessions(): void
isUserAdmin(userId: string): boolean
hasPermission(userId: string, permission: string): boolean
validateEmail(email: string): boolean
generateToken(userId: string): string
processRefund(orderId: string): Refund

// ✅ [Action Prefix] + [Entity A] + To + [Entity B]
assignUserToOrder(userId: string, orderId: string): void
addItemToCart(itemId: string, cartId: string): void
removeItemFromCart(itemId: string, cartId: string): void

// ❌ Forbidden
user.getUserName()     → user.getName()        // contextual redundancy
doProcess()            → processOrder()        // verb without approved suffix
handleData()           → parseUserProfile()    // handle = events/UI actions only
getData()              → fetchUser()           // "data" not in suffix list
```

### Variables
```typescript
// ✅ [optional boolean prefix] + [Entity or Attribute Suffix]
const totalAmount: number = 0
const orderStatus: OrderStatus = OrderStatus.PENDING
const isEmailVerified: boolean = false
const userCount: number = 0
const sessionToken: string = ''

// Constants (SCREAMING_SNAKE_CASE)
const MAX_RETRY_COUNT = 3
const API_BASE_URL = 'https://api.example.com'
const DEFAULT_SESSION_DURATION = 3600

// ❌ Forbidden
const x = 0             // no suffix
const data = {}         // "data" not in suffix list
const flag = false      // raw adjective — use isActive, hasPermission
const temp = getUser()  // "temp" not in suffix list
```

---

## Frontend (React / TypeScript)

### Components
```tsx
// ✅ [Entity Suffix] + [UI Suffix]
<UserCard />
<OrderListPage />
<ProductCarousel />
<CheckoutStepper />
<PaymentForm />
<DeleteOrderModal />
<StatusBadge />
<UserAvatar />
<OrderTimeline />
<NotificationToast />

// ❌ Forbidden
<userCard />          // must be PascalCase
<ShowUserInfo />      // verb as component name
<CardComponent />     // "Component" not in UI suffix list
```

### Event Handlers
```tsx
// ✅ handle + [Entity Suffix] + [optional UI Suffix or Attribute]
const handleSubmitButton = () => { }
const handleEmailInputChange = (e) => { }
const handleDeleteOrderModal = () => { }
const handleCartItemRemove = (id: string) => { }

// Shorter form when entity is clear from context:
const handleSubmit = () => { }
const handleEmailChange = (e) => { }

// ❌ Forbidden
const click = () => { }        // no prefix
const doAction = () => { }     // "do" not in prefix list
const buttonHandler = () => { } // reversed — suffix comes after prefix
```

### State & Props
```tsx
// ✅
const [isModalOpen, setIsModalOpen] = useState(false)
const [userList, setUserList] = useState<User[]>([])
const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
const [orderStatus, setOrderStatus] = useState<OrderStatus>(OrderStatus.PENDING)

interface UserCardProps {
  userId: string
  userName: string
  isActive: boolean
  onDeleteUser: (id: string) => void   // event prop: on + [Action Prefix] + [Entity]
}

// ❌ Forbidden
const [open, setOpen] = useState(false)       // "open" not in suffix list → use isModalOpen
const [data, setData] = useState([])          // "data" not in suffix list
const [id, setId] = useState(null)            // too vague → use selectedOrderId
```

### React Hooks
```tsx
// ✅ use + [Entity Suffix] — special React pattern
const useAuth = () => { }
const useCart = () => { }
const useOrderList = () => { }
const useUserProfile = () => { }
const useNotification = () => { }
const useSessionToken = () => { }

// ❌ Forbidden
const useData = () => { }     // "data" not in suffix list
const useGet = () => { }      // prefix alone is not a suffix
```

---

## Database (SQL)

### Tables
```sql
-- ✅ snake_case, plural of approved Entity Suffix
users
orders
order_items
products
product_categories
payment_transactions
invoices
subscriptions
notifications
audit_logs
user_sessions
user_roles
permissions

-- ❌ Forbidden
User              -- PascalCase not valid in SQL
orderData         -- "data" not in suffix list
tbl_users         -- "tbl_" not in approved prefix list
```

### Columns
```sql
-- ✅ snake_case, approved Attribute Suffix
user_id           -- Id suffix
user_name         -- Name suffix
order_status      -- Status suffix
total_amount      -- Amount suffix
item_count        -- Count suffix
created_timestamp -- Timestamp suffix
updated_timestamp -- Timestamp suffix
deleted_timestamp -- Timestamp suffix (soft delete)
is_active         -- boolean: is_ + Attribute
has_paid          -- boolean: has_ + Attribute
token_value       -- Token + Value
payload_hash      -- Payload + Hash

-- ❌ Forbidden
status            -- ambiguous without entity context in joins
flag              -- not in attribute suffix list
dt                -- abbreviation, not in any list
data              -- not in attribute suffix list
```

### Index & Constraint Naming
```sql
-- ✅ [type]_[table]_[columns]
idx_users_email
idx_orders_created_timestamp
fk_orders_user_id
uq_users_email
pk_users_id

-- ❌ Forbidden
index1
my_index
users_idx
```

---

## Mobile (Flutter / Dart)

### Widgets
```dart
// ✅ PascalCase: [Entity Suffix] + [UI Suffix]
class UserCard extends StatelessWidget { }
class OrderListItem extends StatelessWidget { }
class PaymentForm extends StatefulWidget { }
class CheckoutStepper extends StatefulWidget { }
class NotificationBadge extends StatelessWidget { }
class ProfileAvatar extends StatelessWidget { }

// ❌ Forbidden
class userCard extends StatelessWidget { }      // must be PascalCase
class order_card extends StatelessWidget { }    // snake_case forbidden for classes
```

### State Methods
```dart
// ✅
void handleConfirmOrder() { }
Future<void> fetchUserOrders() async { }
bool isOrderExpired(Order order) { }
void updateCartItemQuantity(String itemId, int quantity) { }
Future<void> processPayment(String orderId) async { }
void resetForm() { }

// ❌ Forbidden
void click() { }              // no prefix
Future<void> getData() async { } // "data" not in suffix list
void do_() { }                // "do" not in prefix list
```

### Files
```dart
// ✅ snake_case: [entity_suffix]_[infra_suffix].dart
user_service.dart
order_repository.dart
payment_gateway.dart
auth_middleware.dart
user_card.dart
order_list_page.dart
checkout_screen.dart

// ❌ Forbidden
UserService.dart         // PascalCase not valid for Dart files
orderService.dart        // camelCase not valid for Dart files
```

---

## Python

### Modules & Files
```python
# ✅ snake_case: entity_infra.py
user_service.py
order_repository.py
payment_processor.py
email_client.py
auth_validator.py
date_util.py

# ❌ Forbidden
UserService.py         # PascalCase for files
orderService.py        # camelCase for files
data_manager.py        # "manager" not in infra suffix list as standalone
```

### Classes
```python
# ✅ PascalCase: Entity + Infra Suffix
class UserService: pass
class OrderRepository: pass
class PaymentProcessor: pass
class InvoiceValidator: pass

# Constants: SCREAMING_SNAKE_CASE
MAX_CONNECTION_POOL = 10
DEFAULT_SESSION_DURATION = 3600
API_BASE_URL = "https://api.example.com"
```

### Functions & Variables
```python
# ✅ snake_case: prefix + entity/attribute suffix
def get_user_by_id(user_id: str) -> User: ...
def calculate_order_total(order_id: str) -> float: ...
def is_email_valid(email: str) -> bool: ...
def fetch_user_list() -> list[User]: ...
def process_payment(order_id: str) -> Payment: ...

user_count = 0
order_status = "pending"
is_authenticated = False
session_token = ""

# ❌ Forbidden
def getUser(userId): ...        # camelCase in Python
def doProcess(): ...            # "do" not in prefix list
x = 0                           # no suffix
d = {}                          # no suffix
```
