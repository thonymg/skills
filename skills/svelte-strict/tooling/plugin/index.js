// eslint-plugin-svelte-strict: the rules eslint-plugin-svelte and the Svelte
// compiler do not already cover. Each rule's meta.docs is the single source of
// truth for references/rules.md (class gate|review, area, needs, since, fix).
// Sections: runes/state · SvelteKit/typing/tests · shadcn-svelte · checklist.
import {
  ICON_PACKAGES, attribute, barrelKind, base, calleeName, canonical, classTokens, declaratorOf, elementName, findVariable, iconLocals, inUiDir, isBrowserCheck, isFunction, isHooksServer, isIconSource, isLoadFile, isRemoteFile, isRuneCall, isScriptTs, isServerOnly, isSvelteModule, isTestFile, propsVariables, rootIdentifier, some, splitVariants, strict, uiImports, walk,
} from './util.js';

// ── runes, reactivity, state ─────────────────────────────────────────────────

const rule = (docs, messages, create) => ({ meta: { type: 'problem', docs, messages, schema: [] }, create });

const effectCallback = (call) => (isRuneCall(call, '$effect', '$effect.pre') && isFunction(call.arguments[0]) ? call.arguments[0] : null);
const hasTopLevelReturn = (fn) =>
  fn.body.type === 'BlockStatement' && fn.body.body.some((s) => s.type === 'ReturnStatement' && s.argument);
const isStateVariable = (variable, ...runes) => isRuneCall(declaratorOf(variable)?.init, ...runes);

const runesRules = {
  'derived-with-function': rule(
    { description: '`$derived` takes an expression, not a function', class: 'gate', area: 'runes', fix: 'Use `$derived.by(() => …)` or pass the expression directly.' },
    { fn: '`$derived` received a function: it would store the function itself. Use `$derived.by(fn)`.' },
    (context) => ({
      CallExpression(node) {
        if (isRuneCall(node, '$derived') && isFunction(node.arguments[0])) context.report({ node, messageId: 'fn' });
      },
    }),
  ),

  'no-destructure-reactive': rule(
    { description: 'Destructuring a `$state`/`$props()` object at top level loses reactivity', class: 'gate', area: 'runes', fix: 'Read through the object (`props.x`) or wrap each field in `$derived`.' },
    { lost: 'Destructuring `{{name}}` copies its current values once: they will not update. Read `{{name}}.x` or use `$derived`.' },
    (context) => {
      const sc = context.sourceCode;
      return {
        VariableDeclarator(node) {
          if (!['ObjectPattern', 'ArrayPattern'].includes(node.id.type) || !node.init) return;
          if (isRuneCall(node.init)) return;
          const scope = sc.getScope(node);
          if (scope.type === 'function' || scope.upper?.type === 'function') return;
          const root = rootIdentifier(node.init);
          const variable = root && findVariable(scope, root.name);
          if (variable && isStateVariable(variable, '$state', '$props')) context.report({ node, messageId: 'lost', data: { name: root.name } });
        },
      };
    },
  ),

  'no-export-primitive-state': rule(
    { description: 'Exporting a primitive `$state` from a module never updates importers', class: 'gate', area: 'state', fix: 'Export an object, a class instance with `$state` fields, or getter/setter functions.' },
    { primitive: 'Exported primitive `$state` cannot be reassigned by importers and never propagates. Export an object/class or accessor functions.' },
    (context) => {
      if (!isSvelteModule(context.filename)) return {};
      const primitive = (a) => a && (a.type === 'Literal' || (a.type === 'TemplateLiteral' && !a.expressions.length) || (a.type === 'UnaryExpression' && a.argument.type === 'Literal'));
      return {
        'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator'(node) {
          if (isRuneCall(node.init, '$state', '$state.raw') && (node.init.arguments.length === 0 || primitive(node.init.arguments[0]))) {
            context.report({ node, messageId: 'primitive' });
          }
        },
      };
    },
  ),

  'prop-derived-without-derived': rule(
    { description: 'A value computed from props at top level must use `$derived`', class: 'gate', area: 'runes', fix: 'Wrap the expression in `$derived(…)`.' },
    { stale: '`{{name}}` is computed from prop `{{prop}}` once: it will not update when the prop changes. Use `$derived(…)`.' },
    (context) => {
      const sc = context.sourceCode;
      let props;
      return {
        VariableDeclarator(node) {
          if (!node.init || isRuneCall(node.init) || isFunction(node.init) || node.id.type !== 'Identifier') return;
          const scope = sc.getScope(node);
          if (scope.type === 'function') return;
          props ??= propsVariables(sc);
          const [s, e] = node.init.range;
          const ref = scope.references.find((r) => r.identifier.range[0] >= s && r.identifier.range[1] <= e && props.has(r.resolved));
          if (ref) context.report({ node, messageId: 'stale', data: { name: node.id.name, prop: ref.identifier.name } });
        },
      };
    },
  ),

  'no-prop-mutation': rule(
    { description: 'Mutating a prop that is not `$bindable`', class: 'gate', area: 'runes', fix: 'Declare the prop with `$bindable()`, or emit a callback prop and let the owner mutate.' },
    { mutate: 'Prop `{{name}}` is mutated but not declared `$bindable()`: the owner does not own this change.' },
    (context) => {
      const sc = context.sourceCode;
      let props;
      const check = (target, node) => {
        if (target.type !== 'MemberExpression') return;
        const root = rootIdentifier(target);
        if (!root) return;
        props ??= propsVariables(sc);
        const v = findVariable(sc.getScope(node), root.name);
        if (v && props.has(v) && !props.get(v).bindable) context.report({ node, messageId: 'mutate', data: { name: root.name } });
      };
      return {
        AssignmentExpression: (n) => check(n.left, n),
        UpdateExpression: (n) => check(n.argument, n),
      };
    },
  ),

  'no-bind-non-bindable-prop': rule(
    { description: '`bind:` on a prop that is not `$bindable` does not propagate to the owner', class: 'gate', area: 'runes', fix: 'Declare the prop with `$bindable()`.' },
    { bind: '`bind:` targets prop `{{name}}`, which is not `$bindable()`: updates stay local.' },
    (context) => {
      const sc = context.sourceCode;
      let props;
      return {
        SvelteDirective(node) {
          if (node.kind !== 'Binding' || !node.expression) return;
          const root = rootIdentifier(node.expression);
          if (!root) return;
          props ??= propsVariables(sc);
          const v = findVariable(sc.getScope(node.expression), root.name);
          if (v && props.has(v) && !props.get(v).bindable) context.report({ node, messageId: 'bind', data: { name: root.name } });
        },
      };
    },
  ),

  'effect-needs-cleanup': rule(
    { description: 'An effect that starts a timer, observer or subscription must return a cleanup', class: 'gate', area: 'runes', fix: 'Return a function that clears the timer / disconnects the observer / unsubscribes.' },
    { cleanup: 'This effect starts `{{what}}` but returns no cleanup: it leaks on every re-run and on unmount.' },
    (context) => {
      const sc = context.sourceCode;
      return {
        CallExpression(node) {
          const fn = effectCallback(node);
          if (!fn || hasTopLevelReturn(fn)) return;
          let what = null;
          walk(fn.body, (n) => {
            if (what) return false;
            if (n.type === 'CallExpression') {
              const name = calleeName(n) ?? (n.callee.type === 'MemberExpression' && n.callee.property.type === 'Identifier' ? `.${n.callee.property.name}` : null);
              if (['setInterval', 'setTimeout', 'requestAnimationFrame', 'requestIdleCallback'].includes(name) || name?.endsWith('.subscribe')) what = name;
            }
            if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && /Observer$/.test(n.callee.name)) what = `new ${n.callee.name}`;
            return true;
          }, sc.visitorKeys);
          if (what) context.report({ node, messageId: 'cleanup', data: { what } });
        },
      };
    },
  ),

  'effect-fetch-needs-abort': rule(
    { description: '`fetch` inside an effect must be abortable', class: 'gate', area: 'runes', fix: 'Create an `AbortController`, pass `signal`, and `return () => controller.abort()`.' },
    { abort: '`fetch` in an effect without an AbortController: a stale response can overwrite a newer one.' },
    (context) => {
      const sc = context.sourceCode;
      return {
        CallExpression(node) {
          const fn = effectCallback(node);
          if (!fn) return;
          const hasFetch = some(fn.body, (n) => n.type === 'CallExpression' && calleeName(n) === 'fetch', sc);
          if (hasFetch && !/\bAbortController\b|\bsignal\b/.test(sc.getText(fn))) context.report({ node, messageId: 'abort' });
        },
      };
    },
  ),

  'no-browser-guard-in-effect': rule(
    { description: 'Effects never run on the server: a `browser` guard around or inside them is dead code', class: 'gate', area: 'runes', fix: 'Remove the guard.' },
    { guard: 'Effects do not run during SSR: this `browser`/`typeof window` guard is useless.' },
    (context) => ({
      CallExpression(node) {
        if (!isRuneCall(node, '$effect', '$effect.pre')) return;
        const fn = node.arguments[0];
        const first = isFunction(fn) && fn.body.type === 'BlockStatement' ? fn.body.body[0] : null;
        if (first?.type === 'IfStatement' && isBrowserCheck(first.test)) return context.report({ node: first, messageId: 'guard' });
        for (let p = node.parent; p && !isFunction(p); p = p.parent) {
          if (p.type === 'IfStatement' && isBrowserCheck(p.test)) return context.report({ node, messageId: 'guard' });
        }
      },
    }),
  ),

  'effect-root-dispose': rule(
    { description: '`$effect.root` returns a dispose function that must be kept', class: 'gate', area: 'runes', fix: 'Store the return value and call it when done (`const dispose = $effect.root(…)`).' },
    { dispose: 'The dispose function returned by `$effect.root` is discarded: these effects can never be stopped.' },
    (context) => ({
      CallExpression(node) {
        if (isRuneCall(node, '$effect.root') && node.parent.type === 'ExpressionStatement') context.report({ node, messageId: 'dispose' });
      },
    }),
  ),

  'snapshot-before-clone': rule(
    { description: '`structuredClone`/`postMessage` of a `$state` proxy throws', class: 'gate', area: 'runes', fix: 'Pass `$state.snapshot(value)`.' },
    { snapshot: '`{{name}}` is a `$state` proxy: `{{fn}}` cannot clone it. Pass `$state.snapshot({{name}})`.' },
    (context) => ({
      CallExpression(node) {
        const name = calleeName(node);
        const fn = name === 'structuredClone' ? name : (node.callee.type === 'MemberExpression' && node.callee.property.name === 'postMessage' ? 'postMessage' : null);
        if (!fn || !node.arguments[0]) return;
        const root = rootIdentifier(node.arguments[0]);
        const v = root && findVariable(context.sourceCode.getScope(node), root.name);
        if (v && isStateVariable(v, '$state')) context.report({ node, messageId: 'snapshot', data: { name: root.name, fn } });
      },
    }),
  ),

  'no-imported-runes': rule(
    { description: 'Runes are compiler keywords, never imports', class: 'gate', area: 'runes', fix: 'Remove the import; use `$state(…)` directly.' },
    { imported: '`{{name}}` is a rune: do not import it.' },
    (context) => ({
      ImportSpecifier(node) {
        const name = node.imported.name ?? node.imported.value;
        if (node.parent.source.value === 'svelte' && name.startsWith('$')) context.report({ node, messageId: 'imported', data: { name } });
      },
    }),
  ),

  'no-store-as-state': rule(
    { description: '`writable` used as shared state: use a class with `$state` fields or `createContext`', class: 'gate', area: 'state', fix: 'See references/svelte.md: class with `$state` fields, or `createContext` for SSR-safe sharing.' },
    { writable: '`writable` as shared state is legacy in Svelte 5: use a class with `$state` fields (or `createContext`).' },
    (context) => ({
      ImportSpecifier(node) {
        if (node.parent.source.value === 'svelte/store' && (node.imported.name ?? node.imported.value) === 'writable') context.report({ node, messageId: 'writable' });
      },
    }),
  ),

  'store-usage': rule(
    { description: 'Store API in use: legitimate for external streams/interop, otherwise migrate', class: 'review', area: 'state', fix: 'Keep `readable`/`fromStore`/`toStore` for external sources; migrate plain shared state to `$state`.' },
    { store: '`{{name}}` from svelte/store: check it wraps an external source (else migrate to `$state`).' },
    (context) => ({
      ImportSpecifier(node) {
        const name = node.imported.name ?? node.imported.value;
        if (node.parent.source.value === 'svelte/store' && name !== 'writable') context.report({ node, messageId: 'store', data: { name } });
      },
    }),
  ),

  'ssr-shared-state': rule(
    { description: 'Module-level `$state` in code that runs on the server is shared by every request', class: 'gate', area: 'ssr', fix: 'Move it into `createContext` (per request tree) or into `event.locals`.' },
    { shared: 'Module-level `$state` here is reachable from server code: one instance is shared by all users. Use `createContext` or `event.locals`.' },
    (context) => {
      const s = strict(context);
      const reachable = isServerOnly(context.filename, s.kitMajor) || (s.serverReachable ?? []).includes(context.filename);
      return reachable ? moduleState(context, (node) => context.report({ node, messageId: 'shared' }), true) : {};
    },
  ),

  'ssr-module-state': rule(
    { description: 'Module-level state in universal code is shared during SSR', class: 'review', area: 'ssr', fix: 'Only mutate it in the browser (event handlers/effects), or use `createContext`.' },
    { module: 'Module-level state `{{name}}`: shared by all requests during SSR. Make sure it is only mutated in the browser, or use `createContext`.' },
    (context) => {
      const s = strict(context);
      if (!s.kit || isServerOnly(context.filename, s.kitMajor) || (s.serverReachable ?? []).includes(context.filename)) return {};
      return moduleState(context, (node, name) => context.report({ node, messageId: 'module', data: { name } }), false);
    },
  ),
};

/**
 * Module-level state: `$state(…)` (and, when !stateOnly, reassigned `let`) at
 * module scope — a `.ts/.js` module, a `.svelte.*` module or `<script module>`.
 */
function moduleState(context, report, stateOnly) {
  const sc = context.sourceCode;
  const isModuleScope = (scope) => scope.type === 'module' || (scope.type === 'global' && !context.filename.endsWith('.svelte'));
  return {
    VariableDeclarator(node) {
      const scope = sc.getScope(node);
      if (!isModuleScope(scope)) return;
      if (context.filename.endsWith('.svelte') && !inModuleScript(sc, node)) return;
      if (isRuneCall(node.init, '$state', '$state.raw')) return report(node, node.id.name ?? '?');
      if (stateOnly || node.parent.kind !== 'let') return;
      for (const v of sc.getDeclaredVariables(node)) {
        if (v.references.some((r) => r.isWrite() && r.identifier !== node.id)) return report(node, v.name);
      }
    },
  };
}

function inModuleScript(sc, node) {
  const before = sc.text.slice(0, node.range[0]);
  const open = before.lastIndexOf('<script');
  return open >= 0 && /<script\b[^>]*\b(module|context\s*=\s*["']module["'])/.test(before.slice(open, before.indexOf('>', open) + 1));
}

// ── SvelteKit, typing, tests ─────────────────────────────────────────────────


/** Function bound to `export function <name>` / `export const <name> = fn`. */
function exportedFunctions(program, name) {
  const out = [];
  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue;
    const d = node.declaration;
    if (d.type === 'FunctionDeclaration' && d.id?.name === name) out.push({ fn: d, decl: d });
    if (d.type === 'VariableDeclaration') {
      for (const v of d.declarations) {
        if (v.id.name !== name) continue;
        const init = v.init?.type === 'TSSatisfiesExpression' ? v.init.expression : v.init;
        out.push({ fn: isFunction(init) ? init : null, decl: v });
      }
    }
  }
  return out;
}

const importedFrom = (variable, source) =>
  variable?.defs?.[0]?.type === 'ImportBinding' && variable.defs[0].parent.source.value === source;

const kitRules = {
  'load-use-event-fetch': rule(
    { description: '`load` must use the `fetch` it receives', class: 'gate', area: 'kit', needs: 'kit', fix: 'Destructure `fetch` from the load event: `load({ fetch })`.' },
    { global: 'Global `fetch` in `load`: no cookies forwarding, no SSR response inlining, double request on hydration. Use the event `fetch`.' },
    (context) => {
      if (!isLoadFile(context.filename)) return {};
      return {
        'Program:exit'(program) {
          for (const { fn } of exportedFunctions(program, 'load')) {
            if (!fn) continue;
            some(fn.body, (n) => {
              if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'fetch') {
                const v = findVariable(context.sourceCode.getScope(n), 'fetch');
                if (!v || v.defs.length === 0) context.report({ node: n, messageId: 'global' });
              }
              return false;
            }, context.sourceCode);
          }
        },
      };
    },
  ),

  'no-swallowed-redirect': rule(
    { description: '`redirect()`/`error()` throw: a `catch` that does not rethrow swallows them', class: 'gate', area: 'kit', needs: 'kit', fix: 'Call it outside the `try`, or rethrow in the `catch` (`if (isRedirect(e)) throw e`).' },
    { swallowed: '`{{name}}()` throws inside a `try` whose `catch` never rethrows: the {{name}} is silently swallowed.' },
    (context) => ({
      CallExpression(node) {
        const name = calleeName(node);
        if (name !== 'redirect' && name !== 'error') return;
        if (!importedFrom(findVariable(context.sourceCode.getScope(node), name), '@sveltejs/kit')) return;
        for (let child = node, p = node.parent; p && !isFunction(p); child = p, p = p.parent) {
          if (p.type === 'TryStatement' && p.block === child && p.handler) {
            const rethrows = some(p.handler.body, (n) => n.type === 'ThrowStatement', context.sourceCode, { skipFunctions: true });
            if (!rethrows) context.report({ node, messageId: 'swallowed', data: { name } });
            return;
          }
        }
      },
    }),
  ),

  'form-post-enhance': rule(
    { description: 'A POST `<form>` should be progressively enhanced', class: 'gate', area: 'kit', needs: 'kit', fix: 'Add `use:enhance` (from `$app/forms`), or spread a remote `form`.' },
    { enhance: '`<form method="POST">` without `use:enhance`: full page reload and lost client state on submit.' },
    (context) => ({
      SvelteElement(node) {
        if (node.kind !== 'html' || node.name.name !== 'form') return;
        const method = attribute(node, 'method');
        const value = method?.value?.[0]?.type === 'SvelteLiteral' ? method.value[0].value : '';
        if (value.toLowerCase() !== 'post') return;
        const attrs = node.startTag.attributes;
        const enhanced = attrs.some((a) => (a.type === 'SvelteDirective' && a.kind === 'Action' && a.key.name.name === 'enhance') || a.type === 'SvelteSpreadAttribute' || a.type === 'SvelteAttachTag');
        if (!enhanced) context.report({ node: node.startTag, messageId: 'enhance' });
      },
    }),
  ),

  'remote-needs-schema': rule(
    { description: 'A remote function that takes an argument must validate it', class: 'gate', area: 'kit', needs: 'remote', since: { kit: '>=2.27.0' }, fix: 'Pass a Standard Schema first: `query(v.string(), async (id) => …)`.' },
    { schema: 'Remote `{{name}}` takes an argument but has no validation schema: the client controls it.' },
    (context) => {
      if (!isRemoteFile(context.filename)) return {};
      return {
        CallExpression(node) {
          const name = calleeName(node);
          if (!['query', 'command', 'form', 'prerender', 'query.batch'].includes(name)) return;
          const v = findVariable(context.sourceCode.getScope(node), name.split('.')[0]);
          if (!importedFrom(v, '$app/server')) return;
          const [first] = node.arguments;
          if (node.arguments.length === 1 && isFunction(first) && first.params.length > 0) context.report({ node, messageId: 'schema', data: { name } });
        },
      };
    },
  ),

  'locals-only-in-handle': rule(
    { description: '`event.locals` is written in `handle` only', class: 'gate', area: 'kit', needs: 'kit', fix: 'Populate `locals` in `hooks.server` `handle`; read it elsewhere.' },
    { locals: '`locals` written outside `handle`: order-dependent and invisible to other loads. Set it in `hooks.server`.' },
    (context) => {
      if (isHooksServer(context.filename)) return {};
      // `locals.x = …` or `event.locals.x = …`: `locals` somewhere in the object chain.
      const touchesLocals = (left) => {
        for (let m = left.object; m; m = m.type === 'MemberExpression' ? m.object : null) {
          if (m.type === 'Identifier') return m.name === 'locals';
          if (m.type === 'MemberExpression' && !m.computed && m.property.name === 'locals') return true;
        }
        return false;
      };
      return { AssignmentExpression(node) { if (node.left.type === 'MemberExpression' && touchesLocals(node.left)) context.report({ node, messageId: 'locals' }); } };
    },
  ),

  'handle-calls-resolve': rule(
    { description: '`handle` must call `resolve(event)`', class: 'gate', area: 'kit', needs: 'kit', fix: 'Return `resolve(event)` (or use `sequence`).' },
    { resolve: '`handle` never calls `resolve`: every request would hang or bypass rendering.' },
    (context) => {
      if (!isHooksServer(context.filename)) return {};
      return {
        'Program:exit'(program) {
          for (const { fn, decl } of exportedFunctions(program, 'handle')) {
            if (!fn) continue;
            let name = null;
            const [first, second] = fn.params;
            if (first?.type === 'ObjectPattern') name = first.properties.find((p) => p.key?.name === 'resolve')?.value?.name ?? null;
            if (!name && second?.type === 'Identifier') name = second.name;
            const calls = name && some(fn.body, (n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name, context.sourceCode);
            if (!calls) context.report({ node: decl, messageId: 'resolve' });
          }
        },
      };
    },
  ),

  'csrf-safe': rule(
    { description: 'CSRF origin check must stay enabled', class: 'gate', area: 'security', needs: 'kit', fix: 'Remove `checkOrigin: false` / the `*` trusted origin; list real origins in `trustedOrigins`.' },
    { off: 'CSRF protection disabled (`{{what}}`).' },
    (context) => {
      if (!/(^|[\\/])(svelte|vite)\.config\.[cm]?[jt]s$/.test(context.filename)) return {};
      return {
        Property(node) {
          const key = node.key.name ?? node.key.value;
          if (key === 'checkOrigin' && node.value.type === 'Literal' && node.value.value === false) context.report({ node, messageId: 'off', data: { what: 'checkOrigin: false' } });
          if (key === 'trustedOrigins' && node.value.type === 'ArrayExpression' && node.value.elements.some((e) => e?.type === 'Literal' && e.value === '*')) {
            context.report({ node, messageId: 'off', data: { what: "trustedOrigins: ['*']" } });
          }
        },
      };
    },
  ),

  'typed-props': rule(
    { description: '`$props()` must be typed in a TypeScript component', class: 'gate', area: 'typing', fix: 'Annotate: `let { a }: Props = $props();` (or `PageProps`/`LayoutProps` for routes).' },
    { untyped: '`$props()` is untyped in a `lang="ts"` component.' },
    (context) => {
      if (!context.filename.endsWith('.svelte') || !isScriptTs(context.sourceCode, context.filename)) return {};
      return {
        VariableDeclarator(node) {
          if (isRuneCall(node.init, '$props') && !node.id.typeAnnotation && !node.init.typeArguments) context.report({ node, messageId: 'untyped' });
        },
      };
    },
  ),

  'kit-typed-page-props': rule(
    { description: 'Route components type their props with `PageProps`/`LayoutProps`', class: 'gate', area: 'typing', needs: 'kit', since: { kit: '>=2.16.0' }, fix: "`let { data }: PageProps = $props();` with `import type { PageProps } from './$types'`." },
    { type: '`{{file}}` props should be typed `{{expected}}` (from `./$types`).' },
    (context) => {
      const m = /^\+(page|layout)\.svelte$/.exec(base(context.filename));
      if (!m || !isScriptTs(context.sourceCode, context.filename)) return {};
      const expected = m[1] === 'page' ? 'PageProps' : 'LayoutProps';
      return {
        VariableDeclarator(node) {
          if (!isRuneCall(node.init, '$props') || !node.id.typeAnnotation) return;
          if (!context.sourceCode.getText(node.id.typeAnnotation).includes(expected)) {
            context.report({ node, messageId: 'type', data: { file: base(context.filename), expected } });
          }
        },
      };
    },
  ),

  'kit-typed-load': rule(
    { description: '`load`/`actions` exports are typed with the generated `./$types`', class: 'gate', area: 'typing', needs: 'kit', fix: '`export const load: PageLoad = …` / `satisfies Actions`.' },
    { untyped: '`{{name}}` is untyped: annotate it with the matching type from `./$types`.' },
    (context) => {
      if (!isLoadFile(context.filename) || !context.filename.endsWith('.ts')) return {};
      return {
        'Program:exit'(program) {
          for (const name of ['load', 'actions']) {
            for (const { fn, decl } of exportedFunctions(program, name)) {
              const typed = decl.type === 'VariableDeclarator'
                ? !!decl.id.typeAnnotation || decl.init?.type === 'TSSatisfiesExpression' || !!fn?.params[0]?.typeAnnotation
                : !!fn?.params[0]?.typeAnnotation;
              if (!typed) context.report({ node: decl, messageId: 'untyped', data: { name } });
            }
          }
        },
      };
    },
  ),

  'test-no-sleep': rule(
    { description: 'Tests wait on state, not on time', class: 'gate', area: 'tests', fix: 'Use `flushSync()`, `await tick()` or `expect.poll(…)`.' },
    { sleep: '`setTimeout` in a test: timing-dependent and flaky. Use `flushSync`, `tick` or `expect.poll`.' },
    (context) => {
      if (!isTestFile(context.filename)) return {};
      return { CallExpression(node) { if (calleeName(node) === 'setTimeout') context.report({ node, messageId: 'sleep' }); } };
    },
  ),
};

// ── shadcn-svelte ────────────────────────────────────────────────────────────
// shadcn-svelte rules, transcribed from the official skill's rules/*.md into
// detectors. Active only when the project has a components.json; never on the
// vendored ui folder itself.

const shadcnRule = (docs, messages, create) => ({
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

const shadcnRules = {
  'shadcn-no-space-utils': shadcnRule(
    { description: 'No `space-x-*`/`space-y-*`: use `flex` + `gap-*`', fix: '`flex flex-col gap-4` instead of `space-y-4`.' },
    { space: '`{{token}}`: use `flex` (or `flex flex-col`) with `gap-*`.' },
    (context) => onClass((el, attr, tokens) => {
      for (const t of tokens) if (/^-?space-[xy]-/.test(splitVariants(t).util)) context.report({ node: attr, messageId: 'space', data: { token: t } });
    }),
  ),

  'shadcn-size-truncate': shadcnRule(
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

  'shadcn-semantic-colors': shadcnRule(
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

  'shadcn-no-overlay-z': shadcnRule(
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

  'shadcn-class-cn': shadcnRule(
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

  'shadcn-item-in-group': shadcnRule(
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

  'shadcn-overlay-title': shadcnRule(
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

  'shadcn-tabs-trigger-in-list': shadcnRule(
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

  'shadcn-avatar-fallback': shadcnRule(
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

  'shadcn-button-no-loading-prop': shadcnRule(
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

  'shadcn-inputgroup-controls': shadcnRule(
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

  'shadcn-field-state-pair': shadcnRule(
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

  'shadcn-button-icon': shadcnRule(
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

  'shadcn-icon-library': shadcnRule(
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

  'shadcn-imports': shadcnRule(
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

  'shadcn-toast-sonner': shadcnRule(
    { description: 'Toasts use `svelte-sonner`', fix: "`import { toast } from 'svelte-sonner'` + the ui Sonner component." },
    { toast: '`{{src}}`: use `toast()` from `svelte-sonner`.' },
    (context) => ({
      ImportDeclaration(node) { if (TOASTS.includes(node.source.value)) context.report({ node, messageId: 'toast', data: { src: node.source.value } }); },
    }),
  ),

  'shadcn-skeleton': shadcnRule(
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

export const rules = { ...runesRules, ...kitRules, ...shadcnRules };

export default { meta: { name: 'eslint-plugin-svelte-strict' }, rules };

/**
 * Review-only checks: real problems that no script can decide (P8). They are
 * printed in report.md as a checklist when `svs route` says they apply.
 * `when` uses the same tags as `svs route`.
 */
export const checklist = [
  { id: 'state-raw', when: 'svelte', text: 'Large objects that are only ever reassigned (API responses) use `$state.raw`, not deep `$state`.' },
  { id: 'untrack', when: 'svelte', text: 'Every value read inside an effect is meant to re-trigger it; otherwise `untrack(…)` it.' },
  { id: 'effect-derives', when: 'svelte', text: 'No effect only writes state computed from other state (multi-statement case not caught by `prefer-writable-derived`).' },
  { id: 'external-source', when: 'svelte', text: 'External sources (WebSocket, media query, DOM API) use `createSubscriber` or a `readable` store, not an effect writing `$state`.' },
  { id: 'key-block', when: 'svelte', text: '`{#key}` is only used to replay transitions, never to re-run script logic (`$derived` instead).' },
  { id: 'boundary', when: 'async', text: 'Every markup `await` has a `<svelte:boundary>` with `pending`/`failed` somewhere above it (possibly in a parent).' },
  { id: 'transition-scope', when: 'svelte', text: 'Transitions inside `{#if}`/`{#each}` declare `|global` only when they must run on parent mount/unmount.' },
  { id: 'load-serializable', when: 'kit', text: 'Universal `load` returns only what crosses the network (no class instances or functions meant for the server).' },
  { id: 'waterfall', when: 'kit', text: 'Independent awaits in a `load` run in parallel (`Promise.all` or returning promises).' },
  { id: 'invalidate', when: 'kit', text: '`depends(key)` and `invalidate(key)` use the same keys; no `invalidateAll` where a key suffices.' },
  { id: 'server-input', when: 'kit', text: 'Every `+server` handler and form action validates its input on the server.' },
  { id: 'handle-error', when: 'kit', text: '`handleError` is defined and never leaks internal messages to the client.' },
  { id: 'cookies', when: 'kit', text: 'Cookies that hold credentials keep `httpOnly`, `secure` and a strict enough `sameSite`.' },
  { id: 'typing', when: 'ts', text: 'Snippet props are typed `Snippet<[Args]>`; generic components declare `generics`; wrappers extend `HTMLAttributes`.' },
  { id: 'test-contract', when: 'test', text: 'Tests drive components through props, events and accessible roles, not internal DOM structure; module state is reset between tests.' },
  { id: 'shadcn-form-layout', when: 'shadcn', text: 'Forms use `Field.FieldGroup` + `Field.Field`; groups of checkboxes/radios use `Field.FieldSet` + `Field.FieldLegend`.' },
  { id: 'shadcn-toggle-group', when: 'shadcn', text: '2–7 mutually exclusive options use `ToggleGroup`, not a loop of `Button` with manual active state.' },
  { id: 'shadcn-card', when: 'shadcn', text: '`Card` uses its full composition (Header/Title/Description/Content/Footer).' },
  { id: 'shadcn-components-first', when: 'shadcn', text: 'No hand-made callout/empty-state/badge/separator markup where `Alert`/`Empty`/`Badge`/`Separator` exist.' },
  { id: 'shadcn-class-layout', when: 'shadcn', text: '`class` on shadcn components only sets layout (margins, width, grid), never colors or typography.' },
];
