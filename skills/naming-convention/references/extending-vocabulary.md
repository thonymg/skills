# Extending the Vocabulary via CLI

Load this file only when the user asks to add, remove, or review custom vocabulary words.

---

## Add a word

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

## Add multiple words at once

```bash
claude "Add these entity suffixes to vocabulary/custom.md:
- Appointment: a scheduled meeting between a user and a provider
- Prescription: a medical order issued by a doctor
- Patient: a registered healthcare user"
```

## Review, remove, audit

```bash
# Show all custom words
claude "Show me everything in vocabulary/custom.md"

# Remove a word
claude "Remove the entity suffix 'Appointment' from vocabulary/custom.md"

# Audit a file against the vocabulary
claude "Audit src/services/userService.ts against the naming convention vocabulary"
```

## When to add vs. reuse

| Situation | Decision |
|:----------|:---------|
| Concept has no equivalent in core vocabulary | Add to `custom.md` |
| Project uses a specific arch pattern (`UseCase`, `Saga`, `Command`) | Add to `custom.md` |
| UI component specific to your design system (`Chip`, `Snackbar`, `FAB`) | Add to `custom.md` |
| A core word already covers the concept (`Setting` ≈ `Preference`) | Use the core word |
| The word is a synonym of an existing entry | Use the canonical core word |
