// Runes, reactivity and component-state rules (Svelte 5).
import {
  calleeName, isRuneCall, isFunction, some, findVariable, rootIdentifier, declaratorOf,
  propsVariables, isBrowserCheck, isSvelteModule, isServerOnly, strict, walk,
} from './util.js';

const rule = (docs, messages, create) => ({ meta: { type: 'problem', docs, messages, schema: [] }, create });

const effectCallback = (call) => (isRuneCall(call, '$effect', '$effect.pre') && isFunction(call.arguments[0]) ? call.arguments[0] : null);
const hasTopLevelReturn = (fn) =>
  fn.body.type === 'BlockStatement' && fn.body.body.some((s) => s.type === 'ReturnStatement' && s.argument);
const isStateVariable = (variable, ...runes) => isRuneCall(declaratorOf(variable)?.init, ...runes);

export const rules = {
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
    { description: '`writable` used as shared state: use a class with `$state` fields or `createContext`', class: 'gate', area: 'state', fix: 'See references/state-decision.md: class with `$state` fields, or `createContext` for SSR-safe sharing.' },
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
