# Conformance — convention drift & architectural discordance

Read this when the target file might be *correct but out of step*: it works,
it is readable, and it still does things differently from the rest of the
codebase. This axis finds what the catalog cannot, because nothing in the
file itself looks wrong.

## Two sources of truth

**Declared** — rules the project wrote down:

- the nearest `AGENTS.md` / `CLAUDE.md` above the file (nearest wins, rules
  are additive down the tree)
- lint, format and type config actually wired into CI (`.editorconfig`,
  eslint, ruff, rubocop, `tsconfig`, `analysis_options.yaml`)
- the `naming-convention` skill's vocabulary, when that skill is present

**De facto** — what 2-3 sibling modules at the same layer actually do.

A discordance is a divergence from one of these. Nothing else counts: a
divergence from your taste is not a discordance.

## The asymmetry rule — read before fixing anything

| What you see | What it means | What to do |
|:--|:--|:--|
| One file differs from its siblings | The file is discordant | Align the file, if it fits a round |
| Many files differ from a declared rule | The **rule** is stale, or was never adopted | Report it; never mass-rewrite. A round that touches twenty files is not a round |
| No dominant pattern, nothing declared | There is no convention to conform to | Observation only |

**micro-optimiz aligns code to an architecture that already exists. It never
chooses one.** Picking the convention is `plan-update`'s job, or a human's.
Inventing one here means every future round has to relitigate it.

## Cheap reconnaissance — about three files

1. The nearest `AGENTS.md` above the target (walk up, stop at the first).
2. Two or three siblings at the same layer — the other handlers, the other
   repositories, the other use cases. Not the whole repo.

If the graph is available, siblings are `search_graph(name_pattern=...)` on
the layer's naming pattern; otherwise list the sibling directory. Stop
there. Establishing "the convention" by reading forty files costs more than
the round is worth.

## Discordance catalog

**D1. Layer violation.** The file imports across a boundary its siblings
respect — a controller reaching into the ORM, a domain module importing the
HTTP client. *Fix if:* the correct seam already exists and the call can be
routed through it within the budget. *Report if:* the seam has to be
created.

**D2. Divergent error contract.** This module returns `null`/`false` on
failure while its siblings raise, or vice versa. Callers then need
per-module knowledge. *Fix if:* the file plus its direct callers fit the
budget. *Report if:* the contract is public.

**D3. Divergent async shape.** Sync where siblings are async, callbacks
where siblings return promises/futures, a hand-rolled retry where siblings
use the shared one. *Fix if:* local. *Report if:* it changes the signature
of something external.

**D4. Divergent dependency acquisition.** This module constructs its own
client, reads env directly, or reaches for a global, while its siblings
receive dependencies injected. This is the one that quietly makes a module
untestable. *Fix if:* the constructor/parameter change stays within the file
and its direct callers.

**D5. Missing or extra layer.** This feature has no service layer while
every other feature has one, or has an extra indirection none of them have.
*Almost always report* — adding or removing a layer is not a round.

**D6. Divergent file/module structure.** Tests beside the source where the
convention is a `tests/` tree, one giant file where siblings split by role,
a barrel export nobody else has. *Fix if:* it is a move of one file with no
import rewrite beyond the budget.

**D7. Vocabulary drift.** The same concept under a different name — `user`
here, `account` next door, `customer` in the third. Also prefix/suffix
drift (`getX` vs `fetchX` vs `loadX` for the same operation). *Fix if:* the
rename stays inside the file and its direct callers. Which name wins is not
your call: use the `naming-convention` skill's vocabulary and casing rules
when it is available, otherwise the name the siblings already use. A name
that merely offends taste is not a finding.

**D8. Divergent boundary validation.** Siblings validate at the edge; this
one trusts its input, or re-validates deep inside where the others do not.
*Fix if:* moving the check is local.

**D9. Divergent configuration placement.** Constants inline where siblings
centralise them, or an entry in the central config that only this module
reads. *Usually fits* — it is a move plus one import.

**D10. Divergent test shape.** No tests where every sibling has them, or a
different framework/fixture style. *Report* — writing the missing tests is
its own work, not a refactoring round.

## What fits a round

Fits: aligning one file's error contract, routing a call through an existing
seam, moving constants to the conventional place, injecting a dependency the
siblings already inject, a rename confined to the file and its direct
callers.

Does not fit, ever: moving a module, introducing or removing a layer,
changing a public API with external callers, a repo-wide rename. These are
observations handed to `plan-update`, not sliced into the ledger — the
ledger is for work micro-optimiz will finish itself.

## Reporting a discordance you did not fix

A report that cannot be acted on is noise. Required shape:

- **Where** — `file:line`.
- **What rule** — quoted, with its source: the `AGENTS.md` path, or the
  siblings you compared against ("`orders/`, `invoices/` and `refunds/` all
  inject the client; `payments/` constructs it").
- **Why it was not done** — which limit it exceeds, concretely.
- **Who takes it** — `plan-update` for a real change, or a human decision if
  the convention itself is in question.

Never report a discordance without naming the comparison you made. "Feels
inconsistent" is the failure mode this whole reference exists to prevent.
