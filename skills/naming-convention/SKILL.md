---
name: naming-convention
description: The types, schema, or code files to derive the naming convention from (optional)
  Applies and enforces a structured naming convention built on three layers:
  Syntax (casing), Semantics (noun/verb roles), and Grammar (closed prefix+suffix vocabulary).

  Trigger this skill whenever the user:
  - Asks to name, rename, or validate a variable, function, class, method, file, or DB column
  - Reviews code for readability or consistency
  - Asks if a name is "correct", "good", or follows conventions
  - Generates or refactors names in any language
  - Uses words like: naming, convention, prefix, suffix, camelCase, snake_case, identifier
---

# Naming Convention

## How to apply this skill

**Step 1 — Identify what needs naming**
Determine: language + element type (variable / method / class / file / DB column).

**Step 2 — Load the right vocabulary**
Load only the file(s) for the element type. Always also read `vocabulary/custom.md`.

| Element type | Load |
|:-------------|:-----|
| Method or function | `vocabulary/prefixes.md` + entity file |
| Variable or property | `vocabulary/suffixes-attributes.md` + `vocabulary/suffixes-entities.md` |
| Class or module | `vocabulary/suffixes-infrastructure.md` + `vocabulary/suffixes-entities.md` |
| UI component | `vocabulary/suffixes-ui.md` + `vocabulary/suffixes-entities.md` |
| DB table or column | `vocabulary/suffixes-entities.md` + `vocabulary/suffixes-attributes.md` |

If the user asks for examples or language-specific rules, load `references/examples-by-domain.md`.
If the user asks how to add custom words via CLI, load `references/extending-vocabulary.md`.

**Step 3 — Pick the casing**

| Element | camelCase | PascalCase | snake_case | SCREAMING | kebab |
|:--------|:---------:|:----------:|:----------:|:---------:|:-----:|
| Variable / function (JS, Java, C#, Dart) | ✅ | | | | |
| Class / type / component (all languages) | | ✅ | | | |
| Variable / function (Python) | | | ✅ | | |
| File / DB column (all languages) | | | ✅ | | |
| Global constant | | | | ✅ | |
| URL / CSS / route | | | | | ✅ |

**Step 4 — Build the name using a pattern**

Pick the first pattern that fits:

1. **Method acting on an entity** → `[Prefix] + [Entity]` — `fetchUser()`, `deleteOrder()`
2. **Method acting on a property** → `[Prefix] + [Entity] + [Attribute]` — `getOrderStatus()`, `updateUserEmail()`
3. **Boolean check** → `[is/has/can/validate] + [Entity] + [Attribute?]` — `isUserActive()`, `hasPermission()`
4. **Collection retrieval** → `[Prefix] + [Entity] + [List/Page/Results/Batch]` — `fetchUserList()`, `listOrderPage()`
5. **Cross-entity relation** → `[Prefix] + [Entity A] + To/From + [Entity B]` — `assignUserToOrder()`
6. **Architectural class** → `[Entity] + [Infra Suffix]` — `UserService`, `OrderRepository`
7. **UI component** → `[Entity] + [UI Suffix]` — `UserCard`, `PaymentForm`
8. **Transfer object** → `[Action] + [Entity] + DTO` — `CreateOrderDTO`, `UpdateUserEmailDTO`

**Step 5 — Check for violations**
Run through the Gotchas below before delivering the name.

---

## Semantic rules

- **Classes and types** must be substantive nouns. Never verbs, gerunds, or adjectives.
  `Order` ✅ — `Ordering` ❌ — `ManageUser` ❌
- **Methods and functions** must start with exactly one approved prefix.
  One prefix = one responsibility. `processRefund()` ✅ — `processAndSaveRefund()` ❌
- **Variables and properties** must end with an approved suffix.
  Booleans must open with a verify prefix: `isActive`, `hasPermission`, `canEdit`.
  Include the unit when ambiguity is possible: `durationInSeconds`, not `duration`.

---

## Gotchas

These are the mistakes that occur most often. Check each one before delivering a name.

- **Contextual redundancy** — when a method belongs to an object, never repeat the object name inside the method. `user.getUserName()` → `user.getName()`. The object already provides the context.
- **"data", "info", "temp", "x"** — these words are not in the vocabulary and are always forbidden. `getData()` → `fetchUserList()`. `info` → `userSummary`. Every name must contain an approved suffix.
- **Standalone infra suffix** — `Manager`, `Handler`, `Helper` alone are violations. They must be paired with an entity: `ErrorHandler`, `AuthHelper`, `OrderProcessor`.
- **Numbering and raw adjectives** — `status2`, `newValue`, `flag` are forbidden. Use the actual concept: `updatedOrderStatus`, `isEmailVerified`.
- **SCREAMING_SNAKE_CASE on a variable** — `USER_DATA` is a violation if it is not a true immutable constant. Use `userData`.
- **Word outside the vocabulary** — if a word does not appear in a vocabulary file or in `custom.md`, it cannot be used. Add it to `custom.md` first, then use it.

---

## Reference files

Load these only when needed — do not load them for every request.

- `vocabulary/custom.md` — project-specific words (always check this)
- `references/examples-by-domain.md` — load when the user asks for examples
- `references/extending-vocabulary.md` — load when the user wants to add words via CLI
- `references/language-specific-rules.md` — load when the user asks about a specific language

---

## Bootstrapping from an existing type system

When the user provides existing code (types, interfaces, classes, enums, DB schema, OpenAPI spec, or any file with names), extract the convention from it instead of starting from the core vocabulary.

Load `references/bootstrap-from-types.md` for the full extraction procedure.

Trigger phrases: "I already have types", "based on my existing code", "extract from my schema", "derive the convention from", "use my codebase as the base", "here are my existing files".

---

## Bootstrapping from an existing type system

When the user provides existing code (types, interfaces, classes, enums, DB schema, OpenAPI spec, or any file with names), extract the convention from it instead of starting from the core vocabulary.

Load `references/bootstrap-from-types.md` for the full extraction procedure.

Trigger phrases: "I already have types", "based on my existing code", "extract from my schema", "derive the convention from", "use my codebase as the base", "here are my existing files".
