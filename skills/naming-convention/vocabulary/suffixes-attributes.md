# Approved Attribute Suffixes

Used after an entity: `getOrderStatus()`, `updateUserEmail()`.
Used alone as variable names: `orderStatus`, `totalAmount`.
Add project-specific attributes in `vocabulary/custom.md`.

---

## Identity
| Suffix | Represents |
|:-------|:-----------|
| `Id` | Unique identifier |
| `Code` | Short human-readable identifier |
| `Key` | Encryption or API key |
| `Hash` | Cryptographic hash |
| `Password` | User password |
| `Token` | Token value used as a field |

## Description
| Suffix | Represents |
|:-------|:-----------|
| `Name` | Human-readable label |
| `Title` | Display heading |
| `Description` | Long-form text |
| `Summary` | Condensed overview |
| `Content` | Body of a message or post |

## Status & Classification
| Suffix | Represents |
|:-------|:-----------|
| `Status` | Current lifecycle state (enum) |
| `Type` | Immutable category or kind |
| `Priority` | Urgency level |

## Numbers & Finance
| Suffix | Represents |
|:-------|:-----------|
| `Count` | Number of items |
| `Amount` | Monetary or numeric value |
| `Total` | Sum of multiple values |
| `Price` | Unit price |
| `Quantity` | Physical stock quantity |
| `Limit` | Maximum allowed value |
| `Offset` | Pagination start position |

## Time
| Suffix | Represents |
|:-------|:-----------|
| `Date` | A calendar date |
| `Timestamp` | Full datetime value |
| `Duration` | Time interval |

## Technical
| Suffix | Represents |
|:-------|:-----------|
| `Url` | A URL string |
| `Path` | A filesystem or route path |
| `Payload` | Raw request or response body |
| `Metadata` | Auxiliary structured data |
| `Version` | Version identifier |
