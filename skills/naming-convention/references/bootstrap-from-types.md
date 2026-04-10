# Bootstrapping the Convention from an Existing Type System

Use this procedure when the user provides existing code and wants the naming convention
derived from it rather than imposed from scratch.

Accepted inputs: TypeScript/Java/Python/Dart/C# type files, DB schema (SQL or ORM),
OpenAPI/GraphQL spec, a folder of source files, or any file containing names.

---

## Extraction procedure

### Step 1 — Collect all names from the input

Scan every name in the provided code. Categorise each one by element type:

| Category | What to collect |
|:---------|:----------------|
| **Entity candidates** | Class names, interface names, type aliases, enum names, DB table names |
| **Prefix candidates** | The opening verb of every function/method name |
| **Attribute candidates** | Property names, column names, parameter names |
| **Infra candidates** | Class name suffixes (the part after the entity: `UserService` → `Service`) |
| **UI candidates** | Component names, widget class names |

### Step 2 — Identify the patterns already in use

For each category, extract the recurring fragments:

**Entities** — strip known suffixes and collect the root nouns.
`UserService`, `UserRepository`, `UserMapper` → entity: `User`

**Prefixes** — list every distinct opening verb across all methods.
`getUser()`, `fetchOrders()`, `isActive()`, `calculateTotal()` → prefixes: `get`, `fetch`, `is`, `calculate`

**Attributes** — list every distinct property/column name fragment.
`createdAt`, `orderId`, `totalAmount`, `isActive` → attributes: `At`→`Timestamp`, `Id`, `Amount`, `is`→verify prefix

**Infra suffixes** — list every suffix appended to entity names in class names.
`UserService`, `OrderController`, `PaymentGateway` → infra: `Service`, `Controller`, `Gateway`

**Casing** — observe the dominant casing per element type.
`getUserById` → camelCase for methods. `UserService` → PascalCase for classes. `user_id` → snake_case for columns.

### Step 3 — Reconcile with the core vocabulary

For each extracted word:

- **If it exists in a core vocabulary file** → keep the core word as canonical, note the mapping.
- **If it is a synonym of a core word** → flag it and propose the canonical alternative.
  `retrieve` found in codebase → core word is `fetch` → recommend migrating to `fetch`.
- **If it has no equivalent in core** → it is a custom word, add it to `vocabulary/custom.md`.
- **If it is a violation** (e.g. `getData`, `Manager` alone) → flag it in the audit report.

### Step 4 — Write to `vocabulary/custom.md`

For every new word validated in Step 3, append it to the correct section of `vocabulary/custom.md`.
Use the same table format as the core files.

### Step 5 — Produce an extraction report

Deliver a structured report with four sections:

```
## Extraction Report

### Detected casing convention
[One line per element type: "Methods → camelCase", "Classes → PascalCase", etc.]

### Words added to custom vocabulary
[Table: word | type | source name it was extracted from]

### Synonyms found — recommended migrations
[Table: found word | canonical core word | example before → after]

### Violations found in existing code
[Table: name | violation type | suggested correction]
```

### Step 6 — Confirm before writing

Show the report to the user. Ask for confirmation before writing to `vocabulary/custom.md`.
If the user rejects a word, drop it. If the user corrects a mapping, apply the correction.

---

## Example

Given this TypeScript input:

```typescript
class PatientRepository { }
class AppointmentService { }
class PrescriptionMapper { }

interface Patient {
  patientId: string
  fullName: string
  dateOfBirth: string
  isActive: boolean
}

function retrievePatient(id: string): Patient { }
function scheduleAppointment(patientId: string): Appointment { }
function cancelAppointment(id: string): void { }
function isPrescriptionExpired(p: Prescription): boolean { }
```

**Step 1 output:**
- Entities: `Patient`, `Appointment`, `Prescription`
- Prefixes found: `retrieve`, `schedule`, `cancel`, `is`
- Attributes found: `Id`, `Name`, `DateOfBirth` → `Date`, `isActive`
- Infra suffixes found: `Repository`, `Service`, `Mapper`

**Step 2 output:**
- Casing: PascalCase for classes, camelCase for methods, camelCase for properties

**Step 3 output:**
- `retrieve` → synonym of core `fetch` → flag for migration
- `schedule` → no equivalent in core → add to custom prefixes
- `cancel` → exists in core vocabulary → keep as canonical
- `Patient`, `Appointment`, `Prescription` → no equivalent in core → add to custom entities
- `DateOfBirth` → maps to core attribute `Date` with qualifier → add `BirthDate` to custom attributes
- `Repository`, `Service`, `Mapper` → exist in core infra → no action needed

**Step 4 — custom.md additions:**
```markdown
## Custom Prefixes
| schedule | WRITE | Assign a time slot for a future appointment |

## Custom Entity Suffixes
| Patient | A registered healthcare user |
| Appointment | A scheduled meeting between a patient and a provider |
| Prescription | A medical order issued by a doctor |

## Custom Attribute Suffixes
| BirthDate | The date of birth of a person |
```

**Step 5 — Extraction Report:**
```
### Detected casing convention
Methods      → camelCase
Classes      → PascalCase
Properties   → camelCase
Files        → (not observed in input)

### Words added to custom vocabulary
schedule     | prefix  | scheduleAppointment()
Patient      | entity  | PatientRepository
Appointment  | entity  | AppointmentService
Prescription | entity  | PrescriptionMapper
BirthDate    | attribute | dateOfBirth

### Synonyms found — recommended migrations
retrieve  →  fetch  |  retrievePatient() → fetchPatient()

### Violations found
(none)
```
