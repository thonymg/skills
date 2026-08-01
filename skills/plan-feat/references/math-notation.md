# Mathematical notation — always with a plain-language gloss

Plans use formal notation because it is unambiguous. But a plan is read
by implementers of any size — small LLMs and humans included — so the
notation must never be a barrier:

> **Rule: every formula is immediately followed by its meaning in
> parentheses, in plain language.** A formula without its gloss is a
> plan to rewrite.

## Readability rules

- One formula per line, its gloss on the same line (or indented just
  below) in parentheses.
- At most one nested quantifier — `∀ … ∀ …` → split into two lines.
- Name a set before using it: `Splits = sale.splits`, then quantify
  over `Splits`.
- Only symbols from the table below. No invented or "clever" notation.

## Allowed symbols

Only these — no invented notation:

```
∀ ∃ ∃! ∈ ∉ Σ ⇒ ⇔ ∧ ∨ ¬ ≠ ≤ ≥ |X| ⊆ → pre(op)/post(op)
```

The less obvious forms, with gloss:

| Symbol | Reads as | Example with gloss |
|:--|:--|:--|
| ∃! | there exists exactly one | `∃! s ∈ Splits : s.is_downpayment` (exactly one split is the down payment) |
| \|X\| | number of elements in X | `1 ≤ \|Splits\| ≤ 4` (a sale has between one and four splits) |
| ⊆ | is a subset of | `RefundedSales ⊆ PaidSales` (only paid sales can be refunded) |
| → | transitions to | `pending → paid` (a pending sale may become paid) |
| pre(op) / post(op) | condition before / after operation op | `pre(pay): status = pending` (pay is only allowed on a pending sale) |

## Patterns

### Invariant (must hold at all times)

```
Splits = sale.splits                      (the splits of one sale)
∀ s ∈ Splits : s.amount > 0               (every split amount is strictly positive)
Σ s ∈ Splits : s.amount = sale.total_amount
                                          (the split amounts add up exactly to the sale total)
```

### State set + transitions

```
status ∈ {draft, pending, paid, cancelled}
        (the only statuses that can ever exist are these four)
transitions: draft → pending → paid ; pending → cancelled
        (a draft can only become pending, a pending sale can become
         paid or cancelled; any other jump is forbidden)
¬(paid → cancelled)                       (a paid sale can never be cancelled)
```

### Pre/post condition per operation

```
pre(pay):  status = pending               (pay is only allowed on a pending sale)
post(pay): status = paid ∧ paid_at ≠ nil  (after pay, the sale is paid and its
                                           payment date is set)
```

### Uniqueness / cardinality

```
∃! s ∈ Splits : s.is_downpayment          (exactly one split is the down payment)
1 ≤ |Splits| ≤ 4                          (a sale has between one and four splits)
```

### Ordering / temporal

```
∀ s ∈ Splits : s.due_at ≥ sale.created_at (no split is due before the sale exists)
```

## From formula to test

Each formula becomes exactly one test; **the gloss becomes the test
name**. Example: `Σ s.amount = sale.total_amount` (the split amounts add
up exactly to the sale total) → test
`split_amounts_add_up_to_sale_total`. Formula, gloss, and test stay in
sync — change one, change the three.
