// Shared helpers for the svelte-strict ESLint rules. No rule logic here.
import fs from 'node:fs';
import path from 'node:path';

export const RUNES = new Set([
  '$state', '$state.raw', '$state.snapshot', '$state.eager', '$derived', '$derived.by',
  '$effect', '$effect.pre', '$effect.root', '$effect.tracking', '$effect.pending',
  '$props', '$props.id', '$bindable', '$inspect', '$inspect.trace', '$host',
]);

/** `foo` → 'foo', `a.b` → 'a.b', anything else → null. */
export function calleeName(call) {
  const c = call?.callee;
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.property.type === 'Identifier') {
    return `${c.object.name}.${c.property.name}`;
  }
  return null;
}

export const isRuneCall = (node, ...names) =>
  node?.type === 'CallExpression' && (names.length ? names.includes(calleeName(node)) : RUNES.has(calleeName(node)));

export const isFunction = (n) =>
  n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');

/** Depth-first walk over child nodes using the parser's visitor keys. */
export function walk(node, visit, keys, { skipFunctions = false } = {}) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === false) return;
  for (const key of keys[node.type] ?? Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    for (const c of Array.isArray(child) ? child : [child]) {
      if (!c || typeof c.type !== 'string') continue;
      if (skipFunctions && isFunction(c)) continue;
      walk(c, visit, keys, { skipFunctions });
    }
  }
}

export function some(node, pred, sourceCode, opts) {
  let hit = false;
  walk(node, (n) => { if (hit) return false; if (pred(n)) { hit = true; return false; } return true; }, sourceCode.visitorKeys, opts);
  return hit;
}

export function findVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const v = s.set.get(name);
    if (v) return v;
  }
  return null;
}

/** Root identifier of `a.b.c` / `a[0].b` / `a`. */
export function rootIdentifier(node) {
  let n = node;
  while (n && (n.type === 'MemberExpression' || n.type === 'ChainExpression')) n = n.type === 'ChainExpression' ? n.expression : n.object;
  return n?.type === 'Identifier' ? n : null;
}

/** Declarator node that created a variable (or null). */
export const declaratorOf = (variable) => variable?.defs?.[0]?.type === 'Variable' ? variable.defs[0].node : null;

/**
 * Props of the component: Map<variable, {bindable:boolean}> for every local
 * binding created by `let {...} = $props()` or `let props = $props()`.
 */
export function propsVariables(sourceCode) {
  const out = new Map();
  walk(sourceCode.ast, (n) => {
    if (n.type !== 'VariableDeclarator' || !isRuneCall(n.init, '$props')) return true;
    const bindable = new Map();
    if (n.id.type === 'ObjectPattern') {
      for (const p of n.id.properties) {
        if (p.type === 'RestElement') { if (p.argument.type === 'Identifier') bindable.set(p.argument.name, false); continue; }
        const v = p.value;
        if (v.type === 'Identifier') bindable.set(v.name, false);
        else if (v.type === 'AssignmentPattern' && v.left.type === 'Identifier') bindable.set(v.left.name, isRuneCall(v.right, '$bindable'));
      }
    } else if (n.id.type === 'Identifier') bindable.set(n.id.name, false);
    for (const variable of sourceCode.getDeclaredVariables(n)) {
      if (bindable.has(variable.name)) out.set(variable, { bindable: bindable.get(variable.name) });
    }
    return false;
  }, sourceCode.visitorKeys, { skipFunctions: true });
  return out;
}

export function isBrowserCheck(test) {
  if (!test) return false;
  if (test.type === 'Identifier') return test.name === 'browser';
  if (test.type === 'UnaryExpression' && test.operator === '!') return isBrowserCheck(test.argument);
  if (test.type === 'BinaryExpression') {
    const side = (s) => s.type === 'UnaryExpression' && s.operator === 'typeof' && s.argument.type === 'Identifier' && ['window', 'document'].includes(s.argument.name);
    return side(test.left) || side(test.right);
  }
  if (test.type === 'LogicalExpression') return isBrowserCheck(test.left) || isBrowserCheck(test.right);
  return false;
}

// ── files ────────────────────────────────────────────────────────────────────
export const base = (filename) => path.basename(filename);
export const isSvelteFile = (f) => f.endsWith('.svelte');
export const isSvelteModule = (f) => /\.svelte\.(ts|js)$/.test(f);
export const isTestFile = (f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);
export const isRemoteFile = (f) => /\.remote\.[jt]s$/.test(f);
export const isHooksServer = (f) => /(^|[\\/])hooks\.server\.[jt]s$/.test(f);
export const isLoadFile = (f) => /(^|[\\/])\+(page|layout)(\.server)?\.[jt]s$/.test(f);
export const isScriptTs = (sourceCode, filename) =>
  /\.ts$/.test(filename) || /<script\b[^>]*\blang\s*=\s*["']ts["']/.test(sourceCode.text);

/** Server-only per SvelteKit: *.server.*, hooks.server, +server, server/ dirs. */
export function isServerOnly(filename, kitMajor = 2) {
  const f = filename.split(path.sep).join('/');
  if (/\.server\.[jt]s$/.test(f) || /(^|\/)\+server\.[jt]s$/.test(f) || /\.remote\.[jt]s$/.test(f)) return true;
  if (kitMajor >= 3) return /\/server\//.test(f) && !/\/src\/routes\//.test(f);
  return /\/src\/lib\/server\//.test(f);
}

export function strict(context) {
  return context.settings?.svelteStrict ?? {};
}

// ── shadcn helpers ───────────────────────────────────────────────────────────
export const ICON_PACKAGES = {
  lucide: ['@lucide/svelte', 'lucide-svelte'],
  tabler: ['@tabler/icons-svelte'],
  hugeicons: ['@hugeicons/svelte', '@hugeicons/core-free-icons'],
  phosphor: ['phosphor-svelte'],
  remixicon: ['svelte-remixicon'],
  radix: ['svelte-radix'],
};
export const ALL_ICON_PACKAGES = Object.values(ICON_PACKAGES).flat();
export const isIconSource = (src) => ALL_ICON_PACKAGES.some((p) => src === p || src.startsWith(`${p}/`));

/** True when the file belongs to the shadcn ui folder itself (vendored source). */
export function inUiDir(context) {
  const ui = strict(context).shadcn?.uiDir;
  return !!ui && path.resolve(context.filename).startsWith(path.resolve(ui) + path.sep);
}

/**
 * Map local import name → { folder, part|null } for imports from the ui alias.
 * `import * as Dialog from '$lib/components/ui/dialog'` → Dialog → {folder:'dialog', ns:true}
 * `import { Button } from '$lib/components/ui/button'` → Button → {folder:'button', imported:'Button'}
 */
/** Top-level statements, including those inside `<script>` blocks of a .svelte file. */
export const statements = (ast) => ast.body.flatMap((n) => (n.type === 'SvelteScriptElement' ? n.body : [n]));

export function uiImports(sourceCode, alias) {
  const map = new Map();
  if (!alias) return map;
  for (const node of statements(sourceCode.ast)) {
    if (node.type !== 'ImportDeclaration') continue;
    const src = node.source.value;
    if (!src.startsWith(`${alias}/`)) continue;
    const folder = src.slice(alias.length + 1).split('/')[0];
    for (const s of node.specifiers) {
      if (s.type === 'ImportNamespaceSpecifier') map.set(s.local.name, { folder, ns: true });
      else if (s.type === 'ImportSpecifier') map.set(s.local.name, { folder, imported: s.imported.name ?? s.imported.value });
      else map.set(s.local.name, { folder, imported: 'default' });
    }
  }
  return map;
}

/** Local names imported from any known icon package. */
export function iconLocals(sourceCode) {
  const names = new Set();
  for (const node of statements(sourceCode.ast)) {
    if (node.type === 'ImportDeclaration' && isIconSource(node.source.value)) node.specifiers.forEach((s) => names.add(s.local.name));
  }
  return names;
}

/** `Dialog.Content` → 'dialog.Content', `Button` → 'button.Button', null otherwise. */
export function canonical(el, imports) {
  if (el?.type !== 'SvelteElement' || el.kind !== 'component') return null;
  const n = el.name;
  if (n.type === 'SvelteMemberExpressionName' && n.object.type === 'Identifier') {
    const imp = imports.get(n.object.name);
    return imp?.ns ? `${imp.folder}.${n.property.name}` : null;
  }
  if (n.type === 'Identifier') {
    const imp = imports.get(n.name);
    return imp && !imp.ns ? `${imp.folder}.${imp.imported}` : null;
  }
  return null;
}

export const elementName = (el) => {
  const n = el?.name;
  if (!n) return '';
  if (n.type === 'SvelteMemberExpressionName') return `${elementName({ name: n.object })}.${n.property.name}`;
  return n.name ?? '';
};

export const attribute = (el, name) =>
  el.startTag.attributes.find((a) => a.type === 'SvelteAttribute' && a.key.name === name);

/** Static class tokens from `class="..."` and string literals inside `class={...}`. */
export function classTokens(attr) {
  const out = [];
  const add = (s) => s.split(/\s+/).filter(Boolean).forEach((t) => out.push(t));
  const fromExpr = (e) => {
    if (!e) return;
    switch (e.type) {
      case 'Literal': if (typeof e.value === 'string') add(e.value); break;
      case 'TemplateLiteral': e.quasis.forEach((q) => add(q.value.cooked ?? '')); e.expressions.forEach(fromExpr); break;
      case 'ConditionalExpression': fromExpr(e.consequent); fromExpr(e.alternate); break;
      case 'LogicalExpression': fromExpr(e.left); fromExpr(e.right); break;
      case 'ArrayExpression': e.elements.forEach(fromExpr); break;
      case 'ObjectExpression': e.properties.forEach((p) => { if (p.type === 'Property') fromExpr(p.key.type === 'Identifier' ? { type: 'Literal', value: p.key.name } : p.key); }); break;
      case 'CallExpression': e.arguments.forEach(fromExpr); break;
    }
  };
  for (const v of attr?.value ?? []) {
    if (v.type === 'SvelteLiteral') add(v.value);
    else if (v.type === 'SvelteMustacheTag') fromExpr(v.expression);
  }
  return out;
}

/** `md:hover:bg-red-500` → { variants:['md','hover'], util:'bg-red-500' } (brackets respected). */
export function splitVariants(token) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of token) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  return { variants: parts, util: cur.replace(/^!/, '') };
}

const barrelCache = new Map();
/** 'multi' | 'single' | null (unknown) from the ui folder's index file on disk. */
export function barrelKind(uiDir, folder) {
  const key = `${uiDir}/${folder}`;
  if (!barrelCache.has(key)) {
    let kind = null;
    for (const f of ['index.ts', 'index.js']) {
      const p = path.join(uiDir, folder, f);
      if (fs.existsSync(p)) { kind = /\bRoot\b/.test(fs.readFileSync(p, 'utf8')) ? 'multi' : 'single'; break; }
    }
    barrelCache.set(key, kind);
  }
  return barrelCache.get(key);
}
