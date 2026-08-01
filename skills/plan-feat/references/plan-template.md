# Module plan template & directive language

## Template — `NN-<module>.md`

```markdown
# <module>

## Vigilance points          <!-- FIRST: read before everything else -->
2-3 concrete risks (data, concurrency, security, UX, migration).
Each assessed: severity, and how THIS plan minimizes it.

## Anticipations
2-3 consequences of this module's existence on the rest of the system
(load, coupling, future migrations, induced behaviors). Each assessed
and minimized in the steps below.

## Need
Why this module exists, for whom, justification (carried over from Phase 2).

## Relations
| Module | Direction | Status | Nature of link |
|:--|:--|:--|:--|
| <other> | depends on / provides to | existing · partial · todo | data/call |

Status vocabulary (used everywhere: relations, phases, trackers):
`existing` = fully in code · `partial` = partially in code ·
`todo` = planned in this set, not in code.

## Invariants (mathematical notation, each glossed)
Properties that must hold at all times. Read
[math-notation.md](math-notation.md) before writing this section —
allowed symbols, the mandatory glossing rule, the full pattern
catalogue (state sets, transitions, cardinality, temporal), and the
formula → test mapping all live there:
  Σ s.amount = sale.total_amount
    (the split amounts add up exactly to the sale total)
  pre(pay): status = pending
    (pay is only allowed on a pending sale)

## Behavior (Gherkin)
Acceptance scenarios, one block per observable behavior:
  Given <precise initial state>
  When <single action>
  Then <observable result> And <invariant preserved>
Cover: nominal case, every vigilance point, every state transition.

## Implementation order
Numbered steps, each small and verifiable, in DIRECTIVE language
(rules in §Directive language below). Each step spells out the tool
calls the implementer MUST execute:
  1. INVOKE Skill `naming-convention` → validate `payment_split` (table), `PaymentSplit` (model).
  2. RUN `search_graph(name_pattern="PaymentSplit")` → MUST return empty, otherwise STOP and report.
  3. CREATE migration `create_payment_splits` (columns listed, exact types, NOT NULL/FK constraints).
  4. VERIFY: `bin/rails test test/models/payment_split_test.rb` green.
Every step touching a vigilance risk cites it.

## Verification checks
How to prove it is done: tests to write (one per invariant and per
Gherkin scenario), commands (`bin/rails test`, `bin/rubocop`), graph
checks (`trace_path`, `detect_changes`), observable acceptance criteria.
```

Vigilance points and anticipations are not decorative: write them
**first**, assess them, then write the plan steps so they reduce those
risks as they go — a step that worsens a vigilance point without
addressing it is a badly written step.

## Directive language — zero ambiguity

The plan is an execution order for an AI, not an essay:

- **Imperative everywhere**: CREATE, INVOKE, RUN, VERIFY, STOP.
  Forbidden: "we could", "ideally", "if possible", "consider".
- **Behaviors → Gherkin** (Given / When / Then), one scenario per
  observable behavior.
- **Constraints and states → mathematical notation**: a quantifiable
  business rule is written as a formula, not prose. Allowed symbols,
  patterns, and the mandatory glossing rule:
  [math-notation.md](math-notation.md).
- **Tools forced into the steps**: every naming cites
  `naming-convention`; every assumption about existing code cites the
  exact `codebase-memory-mcp` call (`search_graph(...)`,
  `trace_path(...)`) with the expected result and the conduct if the
  result differs (STOP + report).
- **Re-read test**: if a step admits two interpretations, rewrite it
  before moving to the next one.
