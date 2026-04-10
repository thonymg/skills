# Approved Action Prefixes

One prefix per method. No word outside this list (and `vocabulary/custom.md`) may open a name.

---

## READ
| Prefix | Use when |
|:-------|:---------|
| `get` | Synchronous access to a local or in-memory value |
| `fetch` | Async retrieval from a DB or API |
| `find` | Search by criteria — result may be null |
| `list` | Retrieve a collection (filtered, paginated) |

## WRITE
| Prefix | Use when |
|:-------|:---------|
| `create` | Entity does not exist yet |
| `update` | Entity already exists, modify fields |
| `delete` | Permanently remove a record |
| `add` | Append to a collection or relationship |
| `remove` | Detach from a collection or relationship |
| `set` | Assign a single property value |
| `send` | Dispatch to an external recipient |
| `upload` | Transfer a binary or file to storage |

## VERIFY
| Prefix | Use when |
|:-------|:---------|
| `is` | Check a state, type, or boolean property |
| `has` | Check existence of a relation or attribute |
| `can` | Check authorization or capability |
| `validate` | Assert data integrity — may throw |

## COMPUTE
| Prefix | Use when |
|:-------|:---------|
| `calculate` | Apply business rules to produce a value |
| `count` | Count elements in a collection |
| `format` | Produce a display string from a typed value |

## TRANSFORM
| Prefix | Use when |
|:-------|:---------|
| `convert` | Change the type or unit of a value |
| `parse` | Decode a raw string into a typed structure |
| `map` | Transform each item of a collection 1:1 |
| `filter` | Reduce a collection by predicate |
| `serialize` | Convert a typed object to string or bytes |

## ORCHESTRATE
| Prefix | Use when |
|:-------|:---------|
| `handle` | React to a UI event or user action |
| `process` | Execute a multi-step business workflow |
| `execute` | Run a command, query, or job |
| `sync` | Reconcile state between two systems |

## INITIALIZE
| Prefix | Use when |
|:-------|:---------|
| `init` | Set up an object or state for first use |
| `build` | Construct a complex object step by step |
| `generate` | Produce a new value algorithmically |
| `reset` | Restore to initial or default state |
