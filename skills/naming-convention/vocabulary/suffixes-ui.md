# Approved UI Component Suffixes

Always paired with an entity: `[Entity] + [UI Suffix]` → `UserCard`, `OrderListPage`.
PascalCase for component names. kebab-case for CSS class names.
Add project-specific components in `vocabulary/custom.md`.

---

## Pages & Structure
| Suffix | Represents |
|:-------|:-----------|
| `Page` | Full-page routed component (web) |
| `Screen` | Full-screen view (mobile) |
| `Layout` | Structural wrapper with slots |
| `Header` | Page or section header |
| `Footer` | Page or section footer |
| `Sidebar` | Persistent side navigation panel |

## Content Display
| Suffix | Represents |
|:-------|:-----------|
| `Card` | Standalone card-style display unit |
| `List` | A rendered list of entities |
| `Item` | A single entry inside a list |
| `Table` | Structured data with columns and rows |
| `Badge` | Small inline status or count indicator |
| `Avatar` | Profile picture or initials placeholder |
| `Chart` | Data visualisation |

## Navigation
| Suffix | Represents |
|:-------|:-----------|
| `Nav` | Navigation bar |
| `Menu` | Dropdown or context menu |
| `Tabs` | In-place tab switcher |
| `Breadcrumb` | Location hierarchy trail |
| `Pagination` | Control for list page navigation |

## Overlays & Feedback
| Suffix | Represents |
|:-------|:-----------|
| `Modal` | Blocking overlay requiring user action |
| `Drawer` | Panel sliding in from screen edge |
| `Toast` | Brief auto-dismissing notification |
| `Tooltip` | Hint shown on hover or focus |
| `Spinner` | Indeterminate loading indicator |
| `Skeleton` | Layout placeholder while loading |

## Forms & Inputs
| Suffix | Represents |
|:-------|:-----------|
| `Form` | Form container grouping related inputs |
| `Input` | Single-line text field |
| `Select` | Dropdown or multi-select control |
| `Button` | Action-triggering button |
| `Toggle` | Boolean on/off switch |
| `Checkbox` | Binary true/false form field |
| `Icon` | Decorative or semantic icon |
