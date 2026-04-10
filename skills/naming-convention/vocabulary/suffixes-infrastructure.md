# Approved Infrastructure Suffixes

Define the architectural role of a class.
Always paired with an entity: `[Entity] + [Infra Suffix]`.
Add project-specific patterns in `vocabulary/custom.md`.

---

## Application Layers
| Suffix | Role |
|:-------|:-----|
| `Service` | Business logic for a domain entity |
| `Repository` | DB read/write access for one entity |
| `Controller` | Handles inbound HTTP requests |
| `Middleware` | Intercepts requests or responses |
| `Router` | Declares and registers routes |

## Integration
| Suffix | Role |
|:-------|:-----|
| `Gateway` | Domain-facing interface to an external service |
| `Client` | Raw HTTP client for an external API |
| `Adapter` | Translates between two incompatible interfaces |
| `Queue` | Message or job queue interface |
| `Worker` | Processes jobs from a queue |

## Construction & Transformation
| Suffix | Role |
|:-------|:-----|
| `Factory` | Creates a configured entity in one call |
| `Builder` | Constructs an object through chained steps |
| `Mapper` | Transforms entity ↔ DTO |
| `Validator` | Encapsulates validation rules |
| `Processor` | Executes one focused business workflow |

## State & Events
| Suffix | Role |
|:-------|:-----|
| `Handler` | Reacts to a specific event or message |
| `Provider` | Supplies a dependency or context value |
| `Store` | Holds reactive application state |
| `Reducer` | Pure function that produces new state |

## Data Contracts
| Suffix | Role |
|:-------|:-----|
| `Model` | ORM entity or database model |
| `DTO` | Data Transfer Object |
| `Schema` | Runtime validation schema |
| `Enum` | Fixed set of named values |

## Utilities
| Suffix | Role |
|:-------|:-----|
| `Util` | Stateless generic utility functions |
| `Config` | Configuration class or file |
| `Logger` | Logging utility |
| `Constant` | Immutable scalar values namespace |

## Testing
| Suffix | Role |
|:-------|:-----|
| `Mock` | Test double that verifies behaviour |
| `Stub` | Test double that returns fixed values |
| `Fixture` | Predefined data for test state setup |
