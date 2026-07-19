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

## LIFECYCLE
| Prefix | Use when |
|:-------|:---------|
| `run` | Launch a script, migration, or long-lived process |
| `start` | Begin a process or timer that will be stopped later |
| `stop` | Halt a running process or timer |
| `open` | Acquire a resource (connection, file, modal) |
| `close` | Release a resource previously opened |
| `load` | Bring data or a resource into memory |
| `save` | Persist current state to storage |
| `apply` | Put a change or configuration into effect |
| `refresh` | Re-fetch or re-render existing data |
| `retry` | Re-attempt a previously failed operation |

## EVENTS & HOOKS
| Prefix | Use when |
|:-------|:---------|
| `register` | Add a callback, plugin, or component to a registry |
| `subscribe` | Start listening to a stream or topic |
| `unsubscribe` | Stop listening to a stream or topic |
| `emit` | Publish an event to listeners |
| `connect` | Establish a live link (socket, store, device) |
| `disconnect` | Tear down a live link |
| `toggle` | Flip a boolean state |
| `notify` | Push an alert to a user or system |
| `render` | Produce UI output from state |
| `use` | React/Vue composable hook (`useCart`, `useOrderList`) |
| `on` | Event handler wired to an event name (`onClick`, `onOrderPaid`) |

---

## Exemptions — never flagged

Language and framework lifecycle methods (`constructor`, `toString`, `render`,
`ngOnInit`, `componentDidMount`, …), entry points (`main`), and test conventions
(`test_*`, `describe`, `it`, `beforeEach`, …) are exempt from the prefix rule.
