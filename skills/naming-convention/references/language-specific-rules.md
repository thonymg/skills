# Language-Specific Rules

All rules use ONLY approved prefixes and suffixes from the master vocabulary in SKILL.md.

---

## JavaScript / TypeScript

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Variables | camelCase | `[Entity/Attribute Suffix]` | `userName`, `orderStatus`, `totalAmount` |
| Booleans | camelCase | `[Verify Prefix] + [Entity/Attribute]` | `isActive`, `hasPermission`, `canEdit` |
| Functions | camelCase | `[Action Prefix] + [Entity Suffix]` | `getUserById()`, `calculateTotal()` |
| Classes | PascalCase | `[Entity] + [Infra Suffix]` | `UserService`, `OrderRepository` |
| Interfaces (TS) | PascalCase | `[Entity] + [Infra Suffix]` | `UserRepository`, `PaymentGateway` |
| Types (TS) | PascalCase | `[Entity] + [Attribute Suffix]` | `OrderStatus`, `UserRole` |
| Enums (TS) | PascalCase + SCREAMING values | `[Entity] + Enum` | `enum OrderStatusEnum { PENDING, ACTIVE }` |
| Constants | SCREAMING_SNAKE_CASE | `[ENTITY]_[ATTRIBUTE]` | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| React components | PascalCase | `[Entity] + [UI Suffix]` | `UserCard`, `OrderListPage` |
| React hooks | camelCase | `use + [Entity Suffix]` | `useAuth`, `useCart`, `useOrderList` |
| Event handlers | camelCase | `handle + [Entity] + [UI/Attribute]` | `handleSubmitButton`, `handleEmailChange` |
| Files (utils/services) | camelCase | `[entity][InfraSuffix].ts` | `userService.ts`, `orderMapper.ts` |
| Files (components) | PascalCase | `[Entity][UISuffix].tsx` | `UserCard.tsx`, `OrderListPage.tsx` |

### TypeScript Specifics
```typescript
// Types — approved suffix pair
type UserId = string                        // Entity + Id
type OrderStatus = 'pending' | 'active'    // Entity + Status

// Interfaces — Entity + Infra Suffix
interface UserRepository { }
interface PaymentGateway { }

// Generics — single uppercase or descriptive approved suffix
function getById<TEntity>(id: string): TEntity
function mapList<TInput, TOutput>(list: TInput[]): TOutput[]

// DTO pattern
interface CreateOrderDTO {
  userId: string
  items: Item[]
  totalAmount: number
}

interface UpdateUserEmailDTO {
  userId: string
  email: string
}
```

---

## Python

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Variables | snake_case | `[entity/attribute_suffix]` | `user_name`, `order_status`, `total_amount` |
| Booleans | snake_case | `[verify_prefix]_[entity/attribute]` | `is_active`, `has_permission`, `can_edit` |
| Functions | snake_case | `[action_prefix]_[entity_suffix]` | `get_user_by_id()`, `calculate_total()` |
| Classes | PascalCase | `[Entity] + [InfraSuffix]` | `UserService`, `OrderRepository` |
| Private methods | _snake_case | `_[action_prefix]_[entity]` | `_validate_input()`, `_fetch_user()` |
| Very private | __snake_case | `__[action_prefix]_[entity]` | `__hash_password()` |
| Constants | SCREAMING_SNAKE_CASE | `[ENTITY]_[ATTRIBUTE]` | `MAX_RETRY_COUNT = 3` |
| Modules/files | snake_case | `[entity]_[infra_suffix].py` | `user_service.py`, `order_repository.py` |
| Packages | snake_case | `[entity]_[domain]/` | `user_management/`, `order_processing/` |

### Python Specifics
```python
from typing import Optional, List
from dataclasses import dataclass

# Type hints use approved entity suffixes
def get_user(user_id: str) -> Optional[User]: ...
def fetch_order_list() -> List[Order]: ...
def is_email_valid(email: str) -> bool: ...

# Dataclass — PascalCase, fields use approved suffixes
@dataclass
class UserProfile:
    user_id: str
    user_name: str
    is_active: bool = True
    total_order_count: int = 0

# Enum — PascalCase + approved Entity + Enum suffix
from enum import Enum
class OrderStatusEnum(Enum):
    PENDING = "pending"
    ACTIVE = "active"
    CANCELLED = "cancelled"
```

---

## Java / Kotlin

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Variables | camelCase | `[Entity/Attribute Suffix]` | `userName`, `orderStatus` |
| Booleans | camelCase | `[Verify Prefix] + [Entity/Attribute]` | `isActive`, `hasPermission` |
| Methods | camelCase | `[Action Prefix] + [Entity Suffix]` | `getUserById()`, `processPayment()` |
| Classes | PascalCase | `[Entity] + [Infra Suffix]` | `UserService`, `OrderRepository` |
| Interfaces | PascalCase | `[Entity] + [Infra Suffix]` | `UserRepository`, `PaymentGateway` |
| Enums | PascalCase + SCREAMING values | `[Entity] + [Enum]` | `enum OrderStatusEnum { PENDING, ACTIVE }` |
| Constants | SCREAMING_SNAKE_CASE | `[ENTITY]_[ATTRIBUTE]` | `MAX_RETRY_COUNT = 3` |
| Packages | all lowercase | domain hierarchy | `com.myapp.user.service` |
| Files | = class name | `[Entity][InfraSuffix].java` | `UserService.java`, `OrderRepository.java` |

### Kotlin Specifics
```kotlin
// Data classes — PascalCase with approved attribute suffixes
data class UserProfile(
    val userId: String,
    val userName: String,
    val isActive: Boolean = true,
    val totalOrderCount: Int = 0
)

// Sealed classes for states — Entity + State/Result suffix
sealed class OrderResult {
    data class Success(val order: Order) : OrderResult()
    data class Error(val errorMessage: String) : OrderResult()
    object Loading : OrderResult()
}

// Extension functions — approved prefix + entity suffix
fun String.toSlug(): String = this.lowercase().replace(" ", "-")
fun User.isAdminUser(): Boolean = this.role == UserRoleEnum.ADMIN
fun Order.calculateTotal(): Double = items.sumOf { it.totalAmount }
```

---

## Dart / Flutter

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Variables | camelCase | `[Entity/Attribute Suffix]` | `userName`, `orderStatus` |
| Booleans | camelCase | `[Verify Prefix] + [Entity/Attribute]` | `isActive`, `hasPermission` |
| Methods | camelCase | `[Action Prefix] + [Entity Suffix]` | `getUserById()`, `processPayment()` |
| Classes/Widgets | PascalCase | `[Entity] + [UI or Infra Suffix]` | `UserCard`, `OrderRepository` |
| Constants | camelCase (Dart convention) | `[entity][AttributeSuffix]` | `maxRetryCount`, `apiBaseUrl` |
| Files | snake_case | `[entity]_[suffix].dart` | `user_service.dart`, `order_card.dart` |
| Private variables | _ prefix + camelCase | `_[Entity/Attribute]` | `_isLoading`, `_sessionToken` |

### Flutter State Management
```dart
// BLoC — Event + Event suffix, State + State suffix
abstract class OrderEvent {}
class FetchOrderListEvent extends OrderEvent { }
class UpdateOrderStatusEvent extends OrderEvent {
  final String orderId;
  final OrderStatus orderStatus;
}

abstract class OrderState {}
class OrderLoadingState extends OrderState { }
class OrderLoadedState extends OrderState {
  final List<Order> orderList;
}
class OrderErrorState extends OrderState {
  final String errorMessage;
}

// Cubit — Entity + Cubit suffix
class UserCubit extends Cubit<UserState> { }
class CartCubit extends Cubit<CartState> { }

// Provider — Entity + Notifier suffix
class CartNotifier extends ChangeNotifier { }
class UserNotifier extends ChangeNotifier { }
```

---

## SQL

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Tables | snake_case, plural | `[entity_suffix]s` | `users`, `orders`, `order_items` |
| Primary keys | `id` or `[entity]_id` | `id`, `user_id`, `order_id` | — |
| Foreign keys | `[referenced_entity]_id` | `user_id`, `order_id` | — |
| Boolean columns | `[verify_prefix]_[attribute]` | `is_active`, `has_paid` | — |
| Timestamps | standard suffixes | `created_timestamp`, `updated_timestamp`, `deleted_timestamp` | — |
| Indexes | `idx_[table]_[columns]` | `idx_users_email` | — |
| FK constraints | `fk_[table]_[column]` | `fk_orders_user_id` | — |
| Unique constraints | `uq_[table]_[column]` | `uq_users_email` | — |
| Primary keys | `pk_[table]_[column]` | `pk_users_id` | — |
| Views | `vw_[entity]_[attribute]` | `vw_active_users`, `vw_order_summary` | — |
| Stored procedures | `sp_[action_prefix]_[entity]` | `sp_get_user_orders`, `sp_calculate_total` | — |

---

## CSS / SCSS

| Element | Convention | Approved Pattern | Example |
|:--------|:-----------|:-----------------|:--------|
| Classes | kebab-case | `[entity]-[ui-suffix]` | `.user-card`, `.order-list` |
| BEM Block | kebab-case | `[entity]-[ui-suffix]` | `.user-card` |
| BEM Element | `__` separator | `.[block]__[attribute]` | `.user-card__avatar` |
| BEM Modifier | `--` separator | `.[block]--[status]` | `.user-card--active` |
| CSS Variables | `--kebab-case` | `--[attribute]-[type]` | `--primary-color`, `--font-size-lg` |
| SCSS Variables | `$kebab-case` | `$[attribute]-[type]` | `$primary-color`, `$border-radius-md` |
| SCSS Mixins | kebab-case | `[action]-[entity/attribute]` | `@mixin flex-center`, `@mixin truncate-text` |

```scss
// ✅ Full example using approved vocabulary
$primary-color: #3B82F6;
$border-radius-md: 8px;

.user-card {
  border-radius: $border-radius-md;

  &__avatar {          // Attribute Suffix: avatar
    width: 48px;
  }

  &__user-name {       // Attribute Suffix: user-name
    color: $primary-color;
  }

  &__order-count {     // Attribute Suffix: order-count
    font-weight: bold;
  }

  &--active {          // Status Modifier: active
    border: 2px solid $primary-color;
  }

  &--loading {         // State Modifier: loading
    opacity: 0.5;
  }
}
```
