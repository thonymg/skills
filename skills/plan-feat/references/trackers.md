# Output structure & progress trackers

## Folder layout

```
plans/
  _progress.yml       # global tracker (whole application only): stages → features → statuses
  <feature_slug>/
    _progress.yml     # feature tracker
    00-overview.md    # brief, features, modules, relation map, justifications (+ impact table in plan-update)
    01-<module>.md    # one plan per module, numbered in implementation order
    02-<module>.md
```

Small scope (Phase 0): a single `plans/<feature_slug>/plan.md` — no
overview, no numbered files, no tracker.

## Feature tracker — `plans/<feature_slug>/_progress.yml`

```yaml
feature: <slug>
stage: preflight | brief | recon | impact | features | modules | relations | plans | critique | done
       # recon, impact: plan-update only · features: plan-feat only
modules:
  - name: <module>
    file: 01-<module>.md
    status: todo | in_progress | written | critiqued
    depends_on: [<module>, ...]
critique_rounds: 0
coherence_checks:        # mandatory in plan-update (strict mode), optional in plan-feat
  - after: 02-<module>.md
    result: pass | fail_fixed
    evidence: [<exact graph call + result, or quoted passage>, ...]
notes: <decisions made, open questions, coherence reports and arbitrations>
```

Update after **every** plan written, every critique round, and every
coherence decision. The tracker is what allows resuming exactly where
analysis and writing stopped — long context or interruption loses nothing.

## Global tracker — `plans/_progress.yml` (whole application only)

Sits above the per-feature trackers when the work is split into stages
(stage definition: plan-feat SKILL.md, Phase 0):

```yaml
stages:
  - name: <stage>
    status: todo | in_progress | done
    features:
      - slug: <feature_slug>
        status: todo | in_progress | done
notes: <stage-level decisions>
```

One stage at a time, over as many sessions as needed. On resume: read the
global tracker first, then the current feature's tracker, then continue
from the first non-`done` item.
