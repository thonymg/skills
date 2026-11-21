// shadcn-svelte rules, transcribed from the official skill's rules/*.md into
// detectors. Active only when the project has a components.json; never on the
// vendored ui folder itself.
import {
  uiImports, canonical, classTokens, splitVariants, attribute, inUiDir, strict, iconLocals,
  ICON_PACKAGES, isIconSource, barrelKind, elementName,
} from './util.js';

const rule = (docs, messages, create) => ({
  meta: { type: 'problem', docs: { class: 'gate', area: 'shadcn', needs: 'shadcn', ...docs }, messages, schema: [] },
  create: (context) => (inUiDir(context) || !strict(context).shadcn ? {} : create(context)),
});

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white|mauve|olive|mist|taupe';
const COLOR_UTIL = 'bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow';
const RAW_COLOR = new RegExp(`^(?:${COLOR_UTIL})-(?:(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?|\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|color\\())`);
const COLOR_PREFIX = new RegExp(`^(?:${COLOR_UTIL})-`);
const OVERLAYS = new Set(['dialog', 'sheet', 'popover', 'drawer', 'tooltip', 'dropdown-menu', 'alert-dialog', 'hover-card', 'context-menu', 'select']);
const TOASTS = ['svelte-french-toast', '@zerodevx/svelte-toast', 'svelte-toasts', 'svelte-toast', '@svelte-put/toast'];

/** Visitor over every element's class attribute: cb(el, attr, tokens). */
const onClass = (cb) => ({
  SvelteElement(el) {
    const attr = attribute(el, 'class');
    if (attr) cb(el, attr, classTokens(attr));
  },
});

const withImports = (context) => uiImports(context.sourceCode, strict(context).shadcn.uiAlias);
const ancestors = function* (el) { for (let p = el.parent; p; p = p.parent) if (p.type === 'SvelteElement') yield p; };
function descendants(el, pred) {
  const stack = [...el.children];
  while (stack.length) {
    const n = stack.pop();
    if (pred(n)) return n;
    if (n.children) stack.push(...n.children);
    for (const k of ['else', 'pending', 'then', 'catch']) {
      const c = n[k];
      if (c && typeof c === 'object') (Array.isArray(c) ? c : [c]).forEach((x) => x && stack.push(x));
    }
  }
  return null;
}
const hasAttr = (el, name) => el.startTag.attributes.some((a) => (a.type === 'SvelteAttribute' || a.type === 'SvelteShorthandAttribute') && a.key.name === name);

export const rules = {
  'shadcn-no-space-utils': rule(
    { description: 'No `space-x-*`/`space-y-*`: use `flex` + `gap-*`', fix: '`flex flex-col gap-4` instead of `space-y-4`.' },
    { space: '`{{token}}`: use `flex` (or `flex flex-col`) with `gap-*`.' },
    (context) => onClass((el, attr, tokens) => {
      for (const t of tokens) if (/^-?space-[xy]-/.test(splitVariants(t).util)) context.report({ node: attr, messageId: 'space', data: { token: t } });
    }),
  ),

  'shadcn-size-truncate': rule(
    { description: 'Shorthands: `size-*` for equal width/height, `truncate` for the ellipsis triplet', fix: '`size-10` / `truncate`.' },
    { size: '`{{w}} {{h}}`: use `size-{{n}}`.', truncate: 'Use `truncate` instead of overflow-hidden + text-ellipsis + whitespace-nowrap.' },
    (context) => onClass((el, attr, tokens) => {
      const byVariant = new Map();
      for (const t of tokens) {
        const { variants, util } = splitVariants(t);
        const m = /^([wh])-(.+)$/.exec(util);
        if (!m) continue;
        const key = `${variants.join(':')}|${m[2]}`;
        byVariant.set(key, { ...(byVariant.get(key) ?? {}), [m[1]]: t, n: m[2] });
      }
      for (const v of byVariant.values()) if (v.w && v.h) context.report({ node: attr, messageId: 'size', data: v });
      const utils = new Set(tokens.map((t) => splitVariants(t).util));
      if (['overflow-hidden', 'text-ellipsis', 'whitespace-nowrap'].every((u) => utils.has(u))) context.report({ node: attr, messageId: 'truncate' });
    }),
  ),

  'shadcn-semantic-colors': rule(
    { description: 'Semantic color tokens only: no palette colors, no `dark:` color overrides', fix: '`bg-primary`, `text-muted-foreground`, `border-destructive`… (theme in the CSS variables).' },
    { raw: '`{{token}}` is a raw color: use a semantic token (bg-primary, text-muted-foreground…).', dark: '`{{token}}`: no manual `dark:` color override, semantic tokens already switch.' },
    (context) => onClass((el, attr, tokens) => {
      for (const t of tokens) {
        const { variants, util } = splitVariants(t);
        if (variants.includes('dark') && COLOR_PREFIX.test(util)) context.report({ node: attr, messageId: 'dark', data: { token: t } });
        else if (RAW_COLOR.test(util)) context.report({ node: attr, messageId: 'raw', data: { token: t } });
      }
    }),
  ),

  'shadcn-no-overlay-z': rule(
    { description: 'Overlay components manage their own stacking', fix: 'Remove the `z-*` class.' },
    { z: '`{{token}}` on `{{name}}`: overlays handle their own z-index.' },
    (context) => {
      const imports = withImports(context);
      return onClass((el, attr, tokens) => {
        const c = canonical(el, imports);
        if (!c || !OVERLAYS.has(c.split('.')[0])) return;
        for (const t of tokens) if (/^-?z-/.test(splitVariants(t).util)) context.report({ node: attr, messageId: 'z', data: { token: t, name: elementName(el) } });
      });
    },
  ),

  'shadcn-class-cn': rule(
    { description: 'Conditional classes go through `cn()` (or a clsx array), not string interpolation', fix: "`class={cn('base', cond && 'extra')}`." },
    { cn: 'Conditional class built by string interpolation: use `cn()` or a class array.' },
    (context) => ({
      SvelteElement(el) {
        const attr = attribute(el, 'class');
        if (!attr) return;
        const cond = (e) => e && ['ConditionalExpression', 'LogicalExpression'].includes(e.type);
        const mixed = attr.value.length > 1 && attr.value.some((v) => v.type === 'SvelteMustacheTag' && cond(v.expression));
        const template = attr.value.some((v) => v.type === 'SvelteMustacheTag' && v.expression.type === 'TemplateLiteral' && v.expression.expressions.some(cond));
        if (mixed || template) context.report({ node: attr, messageId: 'cn' });
      },
    }),
  ),

  'shadcn-item-in-group': rule(
    { description: '`Item` always sits inside its `Group` (Select, DropdownMenu, Command, ContextMenu)', fix: 'Wrap items in `X.Group`.' },
    { group: '`{{name}}` must be inside `{{group}}`.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          const c = canonical(el, imports);
          const m = c && /^(select|dropdown-menu|command|context-menu)\.Item$/.exec(c);
          if (!m) return;
          const inGroup = [...ancestors(el)].some((a) => canonical(a, imports) === `${m[1]}.Group`);
          if (!inGroup) context.report({ node: el.startTag, messageId: 'group', data: { name: elementName(el), group: elementName(el).replace(/Item$/, 'Group') } });
        },
      };
    },
  ),

  'shadcn-overlay-title': rule(
    { description: 'Dialog, Sheet, Drawer and AlertDialog content needs a Title (accessibility)', fix: 'Add `X.Title` (with `class="sr-only"` if visually hidden).' },
    { title: '`{{name}}` has no `{{title}}`: screen readers cannot announce it.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          const c = canonical(el, imports);
          const m = c && /^(dialog|sheet|drawer|alert-dialog)\.Content$/.exec(c);
          if (!m) return;
          if (!descendants(el, (n) => canonical(n, imports) === `${m[1]}.Title`)) {
            context.report({ node: el.startTag, messageId: 'title', data: { name: elementName(el), title: elementName(el).replace(/Content$/, 'Title') } });
          }
        },
      };
    },
  ),

  'shadcn-tabs-trigger-in-list': rule(
    { description: '`Tabs.Trigger` must be inside `Tabs.List`', fix: 'Wrap triggers in `Tabs.List`.' },
    { list: '`Tabs.Trigger` outside `Tabs.List`.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          if (canonical(el, imports) !== 'tabs.Trigger') return;
          if (![...ancestors(el)].some((a) => canonical(a, imports) === 'tabs.List')) context.report({ node: el.startTag, messageId: 'list' });
        },
      };
    },
  ),

  'shadcn-avatar-fallback': rule(
    { description: '`Avatar` always has an `Avatar.Fallback`', fix: 'Add `<Avatar.Fallback>` for when the image fails.' },
    { fallback: '`Avatar.Root` without `Avatar.Fallback`.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          if (canonical(el, imports) !== 'avatar.Root') return;
          if (!descendants(el, (n) => canonical(n, imports) === 'avatar.Fallback')) context.report({ node: el.startTag, messageId: 'fallback' });
        },
      };
    },
  ),

  'shadcn-button-no-loading-prop': rule(
    { description: '`Button` has no loading prop: compose `Spinner` + `disabled`', fix: '`<Button disabled={pending}><Spinner data-icon="inline-start" />Save</Button>`.' },
    { loading: '`Button` has no `{{prop}}` prop: render a `Spinner` inside and set `disabled`.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          if (canonical(el, imports) !== 'button.Button') return;
          for (const prop of ['isPending', 'isLoading', 'loading']) if (hasAttr(el, prop)) context.report({ node: el.startTag, messageId: 'loading', data: { prop } });
        },
      };
    },
  ),

  'shadcn-inputgroup-controls': rule(
    { description: 'Inside `InputGroup` use `InputGroup.Input`/`InputGroup.Textarea`', fix: 'Replace `Input` by `InputGroup.Input`.' },
    { control: '`{{name}}` inside `InputGroup.Root`: use `InputGroup.{{part}}`.' },
    (context) => {
      const imports = withImports(context);
      return {
        SvelteElement(el) {
          const c = canonical(el, imports);
          if (c !== 'input.Input' && c !== 'textarea.Textarea') return;
          if ([...ancestors(el)].some((a) => canonical(a, imports) === 'input-group.Root')) {
            context.report({ node: el.startTag, messageId: 'control', data: { name: elementName(el), part: c.split('.')[1] } });
          }
        },
      };
    },
  ),

  'shadcn-field-state-pair': rule(
    { description: 'Field state is set on both sides: `data-invalid` on `Field` + `aria-invalid` on the control (same for disabled)', fix: 'Set both attributes from the same condition.' },
    { pair: '`{{have}}` on `{{where}}` without `{{missing}}` on {{other}}.' },
    (context) => {
      const imports = withImports(context);
      const PAIRS = [['data-invalid', 'aria-invalid'], ['data-disabled', 'disabled']];
      return {
        SvelteElement(el) {
          const c = canonical(el, imports);
          if (c === 'field.Field') {
            for (const [onField, onControl] of PAIRS) {
              if (hasAttr(el, onField) && !descendants(el, (n) => n.type === 'SvelteElement' && hasAttr(n, onControl))) {
                context.report({ node: el.startTag, messageId: 'pair', data: { have: onField, where: 'Field', missing: onControl, other: 'its control' } });
              }
            }
            return;
          }
          if (el.type !== 'SvelteElement' || !el.startTag) return;
          const field = [...ancestors(el)].find((a) => canonical(a, imports) === 'field.Field');
          if (!field) return;
          const [onField, onControl] = PAIRS[0];
          if (hasAttr(el, onControl) && !hasAttr(field, onField)) {
            context.report({ node: el.startTag, messageId: 'pair', data: { have: onControl, where: elementName(el), missing: onField, other: 'the enclosing Field' } });
          }
        },
      };
    },
  ),

  'shadcn-button-icon': rule(
    { description: 'Icons in a labelled `Button` carry `data-icon` and no sizing classes', fix: '`<SearchIcon data-icon="inline-start" />` without `size-4`.' },
    { dataIcon: 'Icon in a labelled `Button` needs `data-icon="inline-start|inline-end"`.', size: 'No sizing class (`{{token}}`) on icons inside components: the component sizes them.' },
    (context) => {
      const imports = withImports(context);
      const icons = iconLocals(context.sourceCode);
      const isIcon = (n) => n?.type === 'SvelteElement' && n.kind === 'component' && n.name.type === 'Identifier' && icons.has(n.name.name);
      return {
        SvelteElement(el) {
          if (canonical(el, imports) !== 'button.Button') return;
          const kids = el.children.filter((n) => !(n.type === 'SvelteText' && !n.value.trim()));
          const labelled = kids.some((n) => !isIcon(n));
          for (const icon of kids.filter(isIcon)) {
            if (labelled && !hasAttr(icon, 'data-icon')) context.report({ node: icon.startTag, messageId: 'dataIcon' });
            for (const t of classTokens(attribute(icon, 'class'))) {
              if (/^(size|w|h)-/.test(splitVariants(t).util)) context.report({ node: icon.startTag, messageId: 'size', data: { token: t } });
            }
          }
        },
      };
    },
  ),

  'shadcn-icon-library': rule(
    { description: 'Icons come from the `iconLibrary` set in components.json', fix: 'Import from the configured icon package.' },
    { lib: '`{{src}}` is not the configured icon library (`{{lib}}`: {{pkgs}}).' },
    (context) => {
      const lib = strict(context).shadcn.iconLibrary;
      const allowed = ICON_PACKAGES[lib];
      if (!allowed) return {};
      return {
        ImportDeclaration(node) {
          const src = node.source.value;
          if (isIconSource(src) && !allowed.some((p) => src === p || src.startsWith(`${p}/`))) {
            context.report({ node, messageId: 'lib', data: { src, lib, pkgs: allowed.join(', ') } });
          }
        },
      };
    },
  ),

  'shadcn-imports': rule(
    { description: 'ui imports use the components.json alias; multi-part = `import * as X`, single = `import { X }`', fix: "`import * as Dialog from '<ui alias>/dialog'`, `import { Button } from '<ui alias>/button'`." },
    { alias: '`{{src}}`: import ui components through the `{{alias}}` alias.', ns: '`{{folder}}` exports a single component: `import { … }`, not `import * as`.', named: '`{{folder}}` is multi-part: `import * as X from …` and use `X.{{name}}`.' },
    (context) => {
      const { uiAlias, uiDir } = strict(context).shadcn;
      return {
        ImportDeclaration(node) {
          const src = node.source.value;
          if (node.importKind === 'type') return;
          if (/(^|\/)components\/ui\/[\w-]+/.test(src) && !src.startsWith(`${uiAlias}/`)) return context.report({ node, messageId: 'alias', data: { src, alias: uiAlias } });
          if (!src.startsWith(`${uiAlias}/`) || !uiDir) return;
          const folder = src.slice(uiAlias.length + 1).split('/')[0];
          const kind = barrelKind(uiDir, folder);
          for (const s of node.specifiers) {
            if (s.type === 'ImportNamespaceSpecifier' && kind === 'single') context.report({ node: s, messageId: 'ns', data: { folder } });
            const name = s.imported?.name;
            if (s.type === 'ImportSpecifier' && s.importKind !== 'type' && kind === 'multi' && /^[A-Z]/.test(name)) context.report({ node: s, messageId: 'named', data: { folder, name } });
          }
        },
      };
    },
  ),

  'shadcn-toast-sonner': rule(
    { description: 'Toasts use `svelte-sonner`', fix: "`import { toast } from 'svelte-sonner'` + the ui Sonner component." },
    { toast: '`{{src}}`: use `toast()` from `svelte-sonner`.' },
    (context) => ({
      ImportDeclaration(node) { if (TOASTS.includes(node.source.value)) context.report({ node, messageId: 'toast', data: { src: node.source.value } }); },
    }),
  ),

  'shadcn-skeleton': rule(
    { description: 'Loading placeholders use `Skeleton`, not `animate-pulse`', fix: '`<Skeleton class="h-4 w-32" />`.' },
    { pulse: '`animate-pulse` placeholder: use the `Skeleton` component.' },
    (context) => {
      const imports = withImports(context);
      return onClass((el, attr, tokens) => {
        if (tokens.some((t) => splitVariants(t).util === 'animate-pulse') && !canonical(el, imports)?.startsWith('skeleton.')) context.report({ node: attr, messageId: 'pulse' });
      });
    },
  ),
};
