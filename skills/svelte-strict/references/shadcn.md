# shadcn-svelte

Rules here are active only when the project has a `components.json`. They are
the official shadcn-svelte skill's rules turned into `svelte-strict/shadcn-*`
detectors (full list in `references/rules.md`). The vendored ui folder
(`aliases.ui`) is exempt from usage rules: it is shadcn's own source.

## Workflow

1. Read the context from `.svelte-strict/env.json` → `shadcn` (`uiAlias`, `iconLibrary`, `style`, `installed`). Never assume `@lucide/svelte` or `$lib/components/ui`.
2. Before importing a component, check it is in `installed`. Missing → `svs shadcn add <name>`, never hand-written. (An import of a missing component also fails `svelte-check`.)
3. `svs shadcn <command>` runs the pinned CLI only (`svs shadcn --help`-checked commands), passes `--cwd`, and records every file it writes. Those files are allowed by `svs finish` as long as they stay as written.
4. Editing a component under the ui folder is a customization: allowed, but it needs a `ui-customization` waiver validated by the user (`svs waive ui-customization <file> <reason>`).
5. `--overwrite` and items from a registry URL need a validated waiver (`shadcn-overwrite`, `shadcn-registry-url`).
6. Component docs: `https://shadcn-svelte.com/docs/components/<name>.md` — read it before using a component you have not used in this project.

## Imports

- Multi-part components: `import * as Dialog from '<uiAlias>/dialog'` → `Dialog.Root`, `Dialog.Content`…
- Single-component folders: `import { Button } from '<uiAlias>/button'`.
- The shape is read from the folder's `index.ts` on disk (`shadcn-imports`).

## Choosing a component

| Need | Use |
|---|---|
| Action | `Button` (variants before custom classes) |
| Form layout | `Field.FieldGroup` + `Field.Field`; `Field.FieldSet` + `Field.FieldLegend` for groups |
| Input with button/icon | `InputGroup.Root` + `InputGroup.Input` + `InputGroup.Addon` |
| 2–7 exclusive options | `ToggleGroup` |
| Modal / side panel / bottom sheet / confirmation | `Dialog` / `Sheet` / `Drawer` / `AlertDialog` (always a `Title`) |
| Feedback | `toast()` from `svelte-sonner`, `Alert`, `Progress`, `Skeleton`, `Spinner` |
| Empty state | `Empty` |
| Command palette | `Command` inside `Dialog` |
| Menus | `DropdownMenu`, `ContextMenu`, `Menubar` (items inside a `Group`) |

## Styling (gated)

- Semantic tokens only (`bg-primary`, `text-muted-foreground`); no palette colors, no `dark:` color overrides.
- `flex` + `gap-*`, never `space-x/y-*`; `size-*` for equal sides; `truncate`.
- Conditional classes through `cn()` or a class array, not string interpolation.
- No `z-*` on overlay components.
- Icons in a labelled `Button`: `data-icon="inline-start|inline-end"`, no sizing class.
- `class` on shadcn components is for layout only (review).
