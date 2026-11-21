// SvelteKit, typing and test rules.
import {
  calleeName, isRuneCall, isFunction, some, findVariable, isHooksServer, isLoadFile, isRemoteFile,
  isTestFile, isScriptTs, base, attribute,
} from './util.js';

const rule = (docs, messages, create) => ({ meta: { type: 'problem', docs, messages, schema: [] }, create });

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

export const rules = {
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
