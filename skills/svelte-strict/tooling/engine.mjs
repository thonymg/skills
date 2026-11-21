// Analysis engine used by scripts/svs.mjs: one ESLint config (plugin officiel +
// svelte-strict + restricted-*), the PROJECT's Svelte compiler, and the
// server-reachability graph. Pure functions of (env, file, code).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import ts from 'typescript';
import strictPlugin, { rules as strictRules, checklist } from './plugin/index.js';
import { isServerOnly } from './plugin/util.js';

export { strictRules, checklist };

// ── versions ─────────────────────────────────────────────────────────────────
const parse = (v) => (String(v).match(/\d+/g) ?? []).slice(0, 3).map(Number).concat([0, 0, 0]).slice(0, 3);
const cmp = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
/** `satisfies('5.30.1', '>=5.29.0 <6.0.0')`. A missing version never satisfies. */
export function satisfies(version, range) {
  if (!version) return false;
  return range.trim().split(/\s+/).every((c) => {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(c);
    const d = cmp(version, m[2]);
    return { '>=': d >= 0, '<=': d <= 0, '>': d > 0, '<': d < 0, '=': d === 0, undefined: d === 0 }[m[1]];
  });
}

/** Is a svelte-strict rule active for this project (needs + since)? */
export function ruleActive(meta, env) {
  const d = meta.docs;
  if (d.needs === 'kit' && !env.kit) return false;
  if (d.needs === 'shadcn' && !env.shadcn) return false;
  if (d.needs === 'remote' && !env.remoteFunctions) return false;
  if (d.since?.svelte && !satisfies(env.svelte, d.since.svelte)) return false;
  if (d.since?.kit && !satisfies(env.kit, d.since.kit)) return false;
  return true;
}

// ── ESLint config ────────────────────────────────────────────────────────────
const SERVER_GLOBS = (kitMajor) => ['**/*.server.*', '**/+server.*', '**/*.remote.*', kitMajor >= 3 ? '**/server/**' : 'src/lib/server/**'];

export function buildConfig(env, serverReachable = []) {
  const recommended = {};
  for (const c of svelte.configs.recommended) Object.assign(recommended, c.rules ?? {});
  const svelteRules = {};
  for (const [k, v] of Object.entries(recommended)) {
    if (!k.startsWith('svelte/')) continue;
    const level = Array.isArray(v) ? v[0] : v;
    svelteRules[k] = level === 'off' || level === 0 ? 'off' : Array.isArray(v) ? ['error', ...v.slice(1)] : 'error';
  }
  Object.assign(svelteRules, {
    'svelte/valid-compile': 'off', // the project's own compiler runs instead (engine.compileFindings)
    'svelte/prefer-class-directive': 'off', // contradicts Svelte 5 guidance: clsx arrays/objects over class:
    'svelte/no-at-debug-tags': 'error',
    'svelte/no-inspect': 'error',
    'svelte/no-target-blank': 'error',
    'svelte/no-top-level-browser-globals': 'error',
    'svelte/no-add-event-listener': 'error',
    'svelte/prefer-derived-over-derived-by': 'error',
    'svelte/no-ignored-unsubscribe': 'error',
    'svelte/require-stores-init': 'error',
    'svelte/button-has-type': 'error',
    'svelte/no-navigation-without-resolve': satisfies(env.kit, '>=2.26.0') ? 'error' : 'off',
  });
  if (env.shadcn) svelteRules['svelte/no-restricted-html-elements'] = ['error', { elements: ['hr'], message: 'Use the shadcn `Separator` component.' }];

  const custom = {};
  for (const [name, r] of Object.entries(strictRules)) {
    custom[`svelte-strict/${name}`] = ruleActive(r.meta, env) ? (r.meta.docs.class === 'gate' ? 'error' : 'warn') : 'off';
  }

  const legacyImports = [{ name: 'svelte', importNames: ['createEventDispatcher', 'beforeUpdate', 'afterUpdate'], message: 'Legacy API: callback props instead of createEventDispatcher, $effect.pre/$effect instead of beforeUpdate/afterUpdate.' }];
  if (satisfies(env.kit, '>=2.12.0')) legacyImports.push({ name: '$app/stores', message: 'Use `$app/state` (runes) instead of `$app/stores`.' });
  const privateEnv = ['$env/static/private', '$env/dynamic/private'].map((name) => ({ name, message: 'Private env in code that can reach the client: move it to a *.server.* file.' }));

  const legacySyntax = [
    { selector: "SvelteDirective[kind='EventHandler']", message: 'Legacy `on:` directive: use the `onclick={…}` attribute.' },
    { selector: "SvelteElement[kind='html'][name.name='slot']", message: 'Legacy `<slot>`: use `{@render children()}` / snippets.' },
    { selector: "SvelteAttribute[key.name='slot']", message: 'Legacy `slot="…"`: pass a snippet instead.' },
    { selector: "SvelteElement[kind='special'][name.name=/^svelte:(component|self|fragment)$/]", message: 'Legacy special element: render the component variable directly / import itself / use a snippet.' },
    { selector: 'SvelteReactiveStatement', message: 'Legacy `$:`: use `$derived` (or `$effect` only for side effects).' },
    { selector: "ExportNamedDeclaration > VariableDeclaration[kind='let']", message: 'Legacy `export let`: use `let { … } = $props()`.' },
    { selector: 'Identifier[name=/^\\$\\$(props|restProps|slots)$/]', message: 'Legacy `$$props`/`$$restProps`/`$$slots`: use `$props()` with a rest element / snippets.' },
  ];
  if (satisfies(env.svelte, '>=5.29.0')) legacySyntax.push({ selector: "SvelteDirective[kind='Action']:not([key.name.name='enhance'])", message: 'Legacy `use:` action: use `{@attach …}` (wrap existing actions with `fromAction`).' });
  if (satisfies(env.svelte, '>=5.16.0')) legacySyntax.push({ selector: "SvelteDirective[kind='Class']", message: 'Legacy `class:` directive: use a clsx array/object in `class` (or `cn()`).' });

  return [
    ...svelte.configs.recommended,
    {
      files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
      languageOptions: {
        parserOptions: {
          parser: tseslint.parser,
          extraFileExtensions: ['.svelte'],
          svelteConfig: { compilerOptions: { runes: env.runes ?? undefined, experimental: { async: !!env.async } } },
        },
      },
    },
    { files: ['**/*.{ts,mts,cts,js,mjs,cjs}'], ignores: ['**/*.svelte.ts', '**/*.svelte.js'], languageOptions: { parser: tseslint.parser } },
    {
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      plugins: { 'svelte-strict': strictPlugin },
      settings: {
        svelteStrict: {
          kit: env.kit, kitMajor: parse(env.kit ?? 0)[0], serverReachable,
          shadcn: env.shadcn && { ...env.shadcn, uiDir: env.shadcn.uiDir && path.resolve(env.root, env.shadcn.uiDir) },
        },
      },
      rules: { ...svelteRules, ...custom, 'no-restricted-imports': ['error', { paths: legacyImports }] },
    },
    { files: ['**/*.svelte'], rules: { 'no-restricted-syntax': ['error', ...legacySyntax] } },
    ...(env.kit ? [{ files: ['**/*'], ignores: SERVER_GLOBS(parse(env.kit)[0]), rules: { 'no-restricted-imports': ['error', { paths: [...legacyImports, ...privateEnv] }] } }] : []),
  ];
}

// ── analysis ─────────────────────────────────────────────────────────────────
export const LINTABLE = /\.(svelte|[cm]?[jt]s)$/;
const linters = new Map();

function linter(env, reachable) {
  const key = JSON.stringify([env, reachable]);
  if (!linters.has(key)) {
    linters.set(key, new ESLint({ cwd: env.root, overrideConfigFile: true, overrideConfig: buildConfig(env, reachable), ignore: false }));
  }
  return linters.get(key);
}

let projectCompiler;
function compiler(env) {
  projectCompiler ??= createRequire(path.join(env.root, 'package.json'))('svelte/compiler');
  return projectCompiler;
}

/** Warnings/errors of the project's own Svelte compiler. */
export function compileFindings(env, abs, code) {
  const isComponent = abs.endsWith('.svelte');
  const isModule = /\.svelte\.[jt]s$/.test(abs);
  if (!isComponent && !isModule) return [];
  const { compile, compileModule } = compiler(env);
  const options = { filename: path.basename(abs), generate: false };
  if (env.runes != null) options.runes = env.runes;
  if (env.async && satisfies(env.svelte, '>=5.36.0')) options.experimental = { async: true };
  let source = code;
  if (isModule && abs.endsWith('.ts')) source = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText;
  try {
    const result = isComponent ? compile(source, options) : compileModule(source, { filename: options.filename, generate: false });
    return result.warnings.map((w) => ({ line: w.start?.line ?? 0, column: (w.start?.column ?? 0) + 1, rule: `compile/${w.code}`, message: w.message.split('\n')[0], class: 'gate' }));
  } catch (e) {
    return [{ line: e.start?.line ?? 0, column: (e.start?.column ?? 0) + 1, rule: `compile/${e.code ?? 'error'}`, message: String(e.message).split('\n')[0], class: 'gate' }];
  }
}

/** All findings for one file content, sorted. `abs` decides which rules apply. */
export async function analyze(env, abs, code, reachable = []) {
  const rel = path.relative(env.root, abs).split(path.sep).join('/');
  const out = compileFindings(env, abs, code);
  const [result] = await linter(env, reachable).lintText(code, { filePath: abs });
  for (const m of result?.messages ?? []) {
    out.push({ line: m.line ?? 0, column: m.column ?? 0, rule: m.ruleId ?? 'eslint/parse', message: m.message, class: m.severity === 2 ? 'gate' : 'review' });
  }
  return out.map((f) => ({ file: rel, ...f }))
    .sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
}

// ── server reachability ──────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', '.git', 'build', 'dist', '.svelte-strict']);
export function sourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (LINTABLE.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out.sort();
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function resolveImport(env, fromFile, spec) {
  let target;
  const lib = env.libAlias ?? '$lib';
  if (spec.startsWith('.')) target = path.resolve(path.dirname(fromFile), spec);
  else if (spec === lib || spec.startsWith(`${lib}/`)) target = path.join(env.root, 'src/lib', spec.slice(lib.length));
  else return null;
  for (const c of [target, `${target}.ts`, `${target}.js`, `${target}.svelte.ts`, `${target}.svelte.js`, path.join(target, 'index.ts'), path.join(target, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** Absolute paths of every source file reachable from a server-only entry point. */
export function serverReachable(env) {
  if (!env.kit) return [];
  const kitMajor = parse(env.kit)[0];
  const files = sourceFiles(path.join(env.root, 'src'));
  const seen = new Set(files.filter((f) => isServerOnly(f, kitMajor) || /(^|[\\/])hooks\.server\.[jt]s$/.test(f)));
  const queue = [...seen];
  while (queue.length) {
    const f = queue.pop();
    for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
      const r = resolveImport(env, f, m[1] ?? m[2] ?? m[3]);
      if (r && !seen.has(r)) { seen.add(r); queue.push(r); }
    }
  }
  return [...seen].sort();
}
