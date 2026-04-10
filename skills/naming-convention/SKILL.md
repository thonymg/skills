---
name: naming-convention
description: Applies and enforces a complete, structured naming convention system built on three layers: Syntax, Semantics, and Structured Grammar. Use when naming variables, functions, classes, files, or database columns; reviewing code for readability or consistency; choosing between camelCase, snake_case, PascalCase, or kebab-case; or when the user mentions naming, convention, rename, prefix, or suffix.
metadata:
  author: Anthony Michel
  version: "2026.04.10"
---

# Skill: Naming Convention

## Vocabulary Files

Always load the relevant vocabulary file(s) before naming or validating anything.

| File | Contains |
|:-----|:---------|
| `vocabulary/prefixes.md` | Core approved action prefixes (verbs) |
| `vocabulary/suffixes-entities.md` | Core business entity suffixes + collection suffixes |
| `vocabulary/suffixes-attributes.md` | Core attribute suffixes (Id, Status, Amount, Date, etc.) |
| `vocabulary/suffixes-infrastructure.md` | Core infrastructure suffixes (Service, Repository, etc.) |
| `vocabulary/suffixes-ui.md` | Core UI component suffixes (Card, Modal, Form, Page, etc.) |
| `vocabulary/custom.md` | **Project-specific words** — fill this with your own domain vocabulary |

> Load only the files relevant to the element being named. Always also check `vocabulary/custom.md` — it extends every core file. Custom entries carry the same authority as core entries.

---

## Layer 1 — Syntax Rules

One convention per element type, per language. Never mix within the same context.

| Convention | Format | Mandatory For |
|:-----------|:-------|:--------------|
| **camelCase** | `firstWord` | Variables, functions, methods — JS/TS/Java/C#/Dart |
| **PascalCase** | `FirstWord` | Classes, interfaces, components, types, enums — all languages |
| **snake_case** | `first_word` | Variables & functions — Python; files & DB columns — all languages |
| **SCREAMING_SNAKE_CASE** | `FIRST_WORD` | Global constants only — never ordinary variables |
| **kebab-case** | `first-word` | URLs, CSS/HTML filenames, routes |

**Rules:**
1. A project uses exactly **one** syntax convention per element type.
2. Mixing camelCase and snake_case for the same element type is a violation.
3. SCREAMING_SNAKE_CASE is exclusively reserved for immutable global constants.

---

## Layer 2 — Semantic Rules

### Entities (Classes & Types)
- Must be **substantive nouns** — they represent real-world concepts.
- Never use verbs, gerunds, or adjectives as the primary class name.
- `Order`, `Customer`, `Invoice` ✅ — `Ordering`, `ManageCustomer`, `UserActive` ❌

### Actions (Methods & Functions)
- Must **start with exactly one approved action prefix** (see `vocabulary/prefixes.md`).
- The prefix must match the actual intent: `get` for reading, `create` for instantiation, `is`/`has` for booleans, etc.
- Never use two actions in one name: `getAndSave` ❌ — split into two methods.

### States (Variables & Properties)
- Must use **at least one approved suffix** that describes the data.
- Booleans must use an approved **verify prefix** (`is`, `has`, `can`, `should`…).
- Including the unit in the name is mandatory when ambiguity is possible: `durationInSeconds`, `priceInEuros`.

---

## Layer 3 — Structural Grammar Rules

### Rule 1 — Closed Vocabulary
Every word in a name must come from the approved vocabulary files.
Using any word not listed is a **convention violation**.

### Rule 2 — No Contextual Redundancy
When a method belongs to an object, the object name must not be repeated in the method name.
- `user.getName()` ✅ — `user.getUserName()` ❌
- `order.getStatus()` ✅ — `order.getOrderStatus()` ❌

### Rule 3 — One Prefix, One Responsibility
A method name contains exactly one action prefix. One prefix = one responsibility.
- `processRefund()` ✅ — `processAndSaveRefund()` ❌

### Rule 4 — Construction Patterns
Every name must follow exactly one of these patterns:

| Pattern | Formula | Example |
|:--------|:--------|:--------|
| **Action on Entity** | `[Prefix] + [Entity]` | `fetchUser()`, `deleteOrder()` |
| **Action on Attribute** | `[Prefix] + [Entity] + [Attribute]` | `getOrderStatus()`, `updateUserEmail()` |
| **Boolean Check** | `[Verify Prefix] + [Entity] + [optional Attribute]` | `isUserActive()`, `hasPermission()` |
| **Collection Action** | `[Prefix] + [Entity] + [Collection Suffix]` | `fetchProductList()`, `getOrderItems()` |
| **Entity Relation** | `[Prefix] + [Entity A] + To/From + [Entity B]` | `assignUserToOrder()`, `removeItemFromCart()` |
| **Architectural Class** | `[Entity] + [Infra Suffix]` | `UserService`, `OrderRepository` |
| **UI Component** | `[Entity] + [UI Suffix]` | `UserCard`, `OrderListPage` |
| **Transfer Object** | `[Action/Entity] + [Entity] + DTO/Schema` | `CreateOrderDTO`, `UserSchema` |

### Rule 5 — Anti-Patterns (always forbidden)

| ❌ Violation | ✅ Correction | Rule |
|:------------|:------------|:-----|
| `user.getUserName()` | `user.getName()` | No contextual redundancy |
| `data`, `info`, `temp`, `x` | `orderStatus`, `userCount` | Every name needs an approved suffix |
| `doSomething()`, `process()` | `processOrder()`, `executeRefund()` | No verb without an approved suffix |
| `Manager`, `Handler` standalone | `OrderProcessor`, `PaymentGateway` | Infra suffix must pair with an entity |
| `flag`, `status2`, `newValue` | `isEmailVerified`, `updatedStatus` | No numbering, no raw adjectives |
| `getAndSaveUser()` | `getUser()` + `saveUser()` | One prefix = one responsibility |
| `USER_DATA` as a variable | `userData` | SCREAMING_SNAKE_CASE for constants only |
| Any word not in vocabulary files | Rebuild from approved vocabulary | Closed vocabulary rule |

---

## Application Procedure

1. **Identify context** — language + element type (variable, method, class, file, DB column)
2. **Load vocabulary** — open the relevant vocabulary file(s)
3. **Apply syntax** — pick the correct case convention from Layer 1
4. **Verify semantics** — class = noun, method = verb prefix, variable = noun suffix
5. **Build the name** — select one prefix + one or more suffixes + apply a pattern from Rule 4
6. **Check anti-patterns** — run through Rule 5
7. **Explain** — always cite the specific rule that validates or invalidates the name

---

## Reference Files

- `vocabulary/prefixes.md` — core approved prefixes
- `vocabulary/suffixes-entities.md` — core entity + collection suffixes
- `vocabulary/suffixes-attributes.md` — core attribute suffixes
- `vocabulary/suffixes-infrastructure.md` — core infrastructure suffixes
- `vocabulary/suffixes-ui.md` — core UI component suffixes
- `vocabulary/custom.md` — **your project vocabulary** (edit this file to extend the convention)
- `references/examples-by-domain.md` — full code examples per domain
- `references/language-specific-rules.md` — per-language rules table

---

## Extending the Vocabulary (CLI)

When the user asks to add words, or uses a word not in the core vocabulary, help them register it in `vocabulary/custom.md` using Claude CLI.

### Add a single word
```bash
# Add a prefix
claude "Add the prefix 'publish' (WRITE category) to vocabulary/custom.md: make a draft entity publicly visible"

# Add an entity suffix
claude "Add the entity suffix 'Appointment' to vocabulary/custom.md: a scheduled meeting between a user and a provider"

# Add an attribute suffix
claude "Add the attribute suffix 'Dosage' to vocabulary/custom.md: the prescribed amount of a medication"

# Add an infrastructure suffix
claude "Add the infrastructure suffix 'UseCase' to vocabulary/custom.md: a single application use case (Clean Architecture)"

# Add a UI suffix
claude "Add the UI suffix 'Chip' to vocabulary/custom.md: a compact interactive tag or filter element"
```

### Add multiple words at once
```bash
claude "Add these entity suffixes to vocabulary/custom.md:
- Appointment: a scheduled meeting between a user and a provider
- Prescription: a medical order issued by a doctor
- Patient: a registered healthcare user"
```

### Review, remove, or audit
```bash
# Show all custom words
claude "Show me everything in vocabulary/custom.md"

# Remove a word
claude "Remove the entity suffix 'Appointment' from vocabulary/custom.md"

# Audit — check if any name in a file uses words not in the vocabulary
claude "Audit naming-convention vocabulary against my codebase file src/services/userService.ts"
```

### When to add vs. reuse a core word

| Situation | Action |
|:----------|:-------|
| Concept has no equivalent in core vocabulary | Add to `custom.md` |
| Project uses a specific arch pattern (`UseCase`, `Saga`, `Command`) | Add to `custom.md` |
| UI component specific to the design system (`Chip`, `Snackbar`, `FAB`) | Add to `custom.md` |
| A core word already covers the concept (`Setting` ≈ `Preference`) | Use the core word |
| The word is a synonym of an existing entry | Use the canonical word |
