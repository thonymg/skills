#!/usr/bin/env node
// svs — the svelte-strict gate. Every decision is an exit code, every step is
// recorded in .svelte-strict/state.json by this script only (never by hand).
//
//   0 pass · 1 fail or unverified · 2 usage/environment · 3 only pre-existing suite failures
//
// Commands: doctor [--install] · env · start <glob…> [--kind K] [--resume] · route <file…>
//           verify <file…> [--json] · step <name> -- <cmd…> · waive <rule> <file> <reason…>
//           shadcn <cmd> [args…] · legacy-report [dir…] · finish · docs sync|path [--dry-run]
//           hook post-tool-use|stop · gen-references [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLING = path.join(SKILL, 'tooling');
const MAX_PASSES = 3;
const KINDS = ['bug', 'feature', 'migration', 'ui', 'refactor'];
const PROTECTED = /(^|\/)(eslint\.config\.[cm]?[jt]s|\.eslintrc[^/]*|\.eslintignore|tsconfig[^/]*\.json|jsconfig\.json|svelte\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|components\.json)$/;
const SUPPRESSION = /svelte-ignore|eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/;
const ANY = /(:\s*any\b|\bas\s+any\b|<any>)/;

// ── small utils ──────────────────────────────────────────────────────────────
const die = (code, msg) => { if (msg) console.error(msg); process.exit(code); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const posix = (p) => p.split(path.sep).join('/');
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const writeJSON = (p, v) => fs.writeFileSync(p, `${JSON.stringify(sortKeys(v), null, 2)}\n`);

function projectRoot() {
  const flag = process.argv.indexOf('--project');
  let dir = path.resolve(flag > 0 ? process.argv.splice(flag, 2)[1] : process.cwd());
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (path.dirname(d) === d) return dir;
  }
}
const ROOT = projectRoot();
const STATE_DIR = path.join(ROOT, '.svelte-strict');
const STATE = path.join(STATE_DIR, 'state.json');
const WAIVERS = path.join(STATE_DIR, 'waivers.md');
const rel = (p) => posix(path.relative(ROOT, path.resolve(ROOT, p)));
const fileHash = (r) => { const p = path.join(ROOT, r); return fs.existsSync(p) ? sha(fs.readFileSync(p)) : 'deleted'; };

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  return r.status === 0 ? r.stdout : null;
}
const inGit = () => git(['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';

function loadState() { return readJSON(STATE, { task: null, steps: {}, verify: { passes: 0, files: {} }, shadcn: {}, routeTags: [] }); }
function saveState(s) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, '.gitignore'), '*\n'); writeJSON(STATE, s); }
function openTask(s) { if (!s.task?.open) die(2, 'svs: no open task — run `svs start <glob…>` first.'); return s.task; }

function loadEnv() {
  const env = readJSON(path.join(STATE_DIR, 'env.json'));
  if (!env) die(2, 'svs: no env.json — run `svs env` first.');
  return { ...env, root: ROOT };
}
async function engine() {
  if (!fs.existsSync(path.join(TOOLING, 'node_modules'))) die(2, `svs: tooling not installed — run \`node ${posix(path.join(SKILL, 'scripts/svs.mjs'))} doctor --install\`.`);
  return import(pathToFileURL(path.join(TOOLING, 'engine.mjs')).href);
}

// ── glob (minimal: **, *, ?) ─────────────────────────────────────────────────
function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const inScope = (task, r) => task.scope.some((g) => globRe(g).test(r));

// ── waivers ──────────────────────────────────────────────────────────────────
// .svelte-strict/waivers.md table: | rule | target | reason | validated |
// `svs waive` always writes `non`. Only the user turns it into `oui`.
function waivers() {
  if (!fs.existsSync(WAIVERS)) return [];
  return fs.readFileSync(WAIVERS, 'utf8').split('\n')
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length === 4 && c[0] !== 'rule' && !/^-+$/.test(c[0]))
    .map(([rule, target, reason, validated]) => ({ rule, target, reason, validated: validated.toLowerCase() === 'oui' }));
}
const waived = (rule, target) => waivers().some((w) => w.validated && w.rule === rule && (w.target === target || w.target === '*'));

// ── env ──────────────────────────────────────────────────────────────────────
function pkgVersion(name) {
  const p = path.join(ROOT, 'node_modules', name, 'package.json');
  return readJSON(p)?.version ?? null;
}
function detectEnv() {
  const pkg = readJSON(path.join(ROOT, 'package.json'), {});
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const configText = ['svelte.config.js', 'svelte.config.ts', 'svelte.config.mjs', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs']
    .map((f) => path.join(ROOT, f)).filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const flag = (name) => new RegExp(`\\b${name}\\s*:\\s*true\\b`).test(configText);
  const runesMatch = /\brunes\s*:\s*(true|false)\b/.exec(configText);
  const kit = pkgVersion('@sveltejs/kit');
  const components = readJSON(path.join(ROOT, 'components.json'));
  const kitMajor = kit ? Number(kit.split('.')[0]) : 0;
  const libAlias = kitMajor >= 3 ? '#lib' : '$lib';
  let shadcn = null;
  if (components) {
    const uiAlias = components.aliases?.ui ?? `${components.aliases?.components ?? `${libAlias}/components`}/ui`;
    const uiDir = uiAlias.startsWith(libAlias) ? `src/lib${uiAlias.slice(libAlias.length)}` : null;
    shadcn = {
      uiAlias, uiDir, iconLibrary: components.iconLibrary ?? 'lucide', style: components.style ?? null,
      tailwindCss: components.tailwind?.css ?? null, installed: uiDir && fs.existsSync(path.join(ROOT, uiDir)) ? fs.readdirSync(path.join(ROOT, uiDir)).sort() : [],
    };
  }
  return {
    svelte: pkgVersion('svelte'), kit, libAlias,
    runes: runesMatch ? runesMatch[1] === 'true' : null,
    async: flag('async'), remoteFunctions: flag('remoteFunctions'),
    adapter: /@sveltejs\/adapter-([\w-]+)/.exec(configText)?.[1] ?? null,
    ts: fs.existsSync(path.join(ROOT, 'tsconfig.json')),
    tailwind: pkgVersion('tailwindcss'), bitsUi: pkgVersion('bits-ui'),
    testRunner: ['vitest', 'jest', '@playwright/test'].find((d) => deps[d]) ?? null,
    configParsing: 'regex',
    shadcn,
  };
}

// ── commands ─────────────────────────────────────────────────────────────────
function cmdDoctor(args) {
  const problems = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major >= 24 || (major === 22 && minor >= 13) || (major === 20 && minor >= 19))) problems.push(`node ${process.versions.node}: need ^20.19 || ^22.13 || >=24`);
  if (!fs.existsSync(path.join(TOOLING, 'node_modules'))) {
    if (args.includes('--install')) {
      const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: TOOLING, stdio: 'inherit' });
      if (r.status !== 0) problems.push('npm ci failed in tooling/');
    } else problems.push(`tooling not installed: svs doctor --install (runs npm ci in ${posix(TOOLING)})`);
  }
  for (const [skill, file] of [['fix-root', 'scripts/verify-suite.sh'], ['naming-convention', 'linter/lint.sh']]) {
    if (!siblingSkill(skill, file)) problems.push(`required skill missing: ${skill} (${file}) — install it next to svelte-strict`);
  }
  if (spawnSync('git', ['--version']).status !== 0) problems.push('git not found');
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) return 2;
  console.log('svs doctor: ok (graph: use codebase-memory if connected, else svs falls back to its own import resolver)');
  return 0;
}
function siblingSkill(skill, file) {
  const p = path.join(SKILL, '..', skill, file);
  return fs.existsSync(p) ? p : null;
}

function cmdEnv() {
  const env = detectEnv();
  if (!env.svelte) die(1, 'svs env: svelte not found in node_modules — install the project dependencies first (no default version is assumed).');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJSON(path.join(STATE_DIR, 'env.json'), env);
  console.log(JSON.stringify(sortKeys(env), null, 2));
  return 0;
}

function cmdStart(args) {
  const kindAt = args.indexOf('--kind');
  const kind = kindAt >= 0 ? args.splice(kindAt, 2)[1] : 'feature';
  const resume = args.includes('--resume');
  const scope = args.filter((a) => !a.startsWith('--'));
  const s = loadState();
  if (resume) {
    openTask(s);
    s.task.resumes = (s.task.resumes ?? 0) + 1;
    s.verify.passes = 0;
    saveState(s);
    console.log(`svs: task resumed (resume #${s.task.resumes}, recorded in the report).`);
    return 0;
  }
  if (!KINDS.includes(kind)) die(2, `svs start: --kind must be one of ${KINDS.join(', ')}`);
  if (!scope.length) die(2, 'svs start: give the scope as globs, e.g. `svs start "src/routes/login/**" src/lib/auth.ts`');
  if (!fs.existsSync(path.join(STATE_DIR, 'env.json'))) die(2, 'svs start: run `svs env` first.');
  if (!inGit()) die(2, 'svs start: not a git repository — the baseline (D1) needs git.');
  const baseline = git(['stash', 'create'])?.trim() || git(['rev-parse', 'HEAD'])?.trim();
  if (!baseline) die(2, 'svs start: no commit to use as baseline (commit once first).');
  saveState({ task: { open: true, kind, scope, baseline, resumes: 0 }, steps: {}, verify: { passes: 0, files: {} }, shadcn: {}, routeTags: [] });
  console.log(`svs: task started — kind=${kind}, baseline=${baseline.slice(0, 12)}, scope=${scope.join(' ')}`);
  return 0;
}

const REFERENCES = { svelte: 'references/state-decision.md', legacy: 'references/migration-runes.md', kit: 'references/sveltekit.md', shadcn: 'references/shadcn.md', test: 'references/testing.md' };
function routeTags(env, files) {
  const tags = new Set();
  for (const f of files) {
    const r = rel(f);
    const abs = path.join(ROOT, r);
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const svelteish = /\.svelte$|\.svelte\.[jt]s$/.test(r);
    if (svelteish) tags.add('svelte');
    if (svelteish && /export\s+let\b|^\s*\$:|\bon:[a-z]|<slot\b|createEventDispatcher|svelte\/store/m.test(text)) tags.add('legacy');
    if (env.kit && (/(^|\/)(\+[\w.@-]+|hooks\.(server|client)\.[jt]s|[\w-]+\.remote\.[jt]s|svelte\.config\.[cm]?[jt]s)$/.test(r) || /\$app\/|@sveltejs\/kit/.test(text))) tags.add('kit');
    if (env.shadcn && svelteish && r.endsWith('.svelte')) tags.add('shadcn');
    if (/\.(test|spec)\.[cm]?[jt]s$/.test(r)) tags.add('test');
    if (/\.ts$/.test(r) || /lang=["']ts["']/.test(text)) tags.add('ts');
    if (env.async && /\bawait\b/.test(text) && svelteish) tags.add('async');
  }
  return [...tags].sort();
}
async function cmdRoute(files) {
  if (!files.length) die(2, 'svs route: give the files you will touch.');
  const env = loadEnv();
  const tags = routeTags(env, files);
  const { checklist } = await engine();
  const refs = [...new Set(tags.map((t) => REFERENCES[t]).filter(Boolean))].sort();
  console.log(`tags: ${tags.join(' ') || '(none)'}`);
  console.log('read:');
  for (const r of refs) console.log(`  ${posix(path.join(SKILL, r))}`);
  const items = checklist.filter((c) => tags.includes(c.when));
  if (items.length) { console.log('review checklist (not blocking, reported by finish):'); for (const c of items) console.log(`  [${c.id}] ${c.text}`); }
  const s = loadState();
  if (s.task?.open) { s.routeTags = [...new Set([...(s.routeTags ?? []), ...tags])].sort(); saveState(s); }
  return 0;
}

/** Findings for the current content vs the baseline content: new = count increase per rule|message. */
async function compare(env, eng, r, reachable, baseline) {
  const abs = path.join(ROOT, r);
  const now = await eng.analyze(env, abs, fs.readFileSync(abs, 'utf8'), reachable);
  const old = git(['show', `${baseline}:${r}`]);
  const before = old == null ? [] : await eng.analyze(env, abs, old, reachable);
  const key = (f) => `${f.rule}|${f.message}`;
  const count = (list) => list.reduce((m, f) => m.set(key(f), (m.get(key(f)) ?? 0) + 1), new Map());
  const a = count(now), b = count(before);
  const fresh = now.filter((f) => (a.get(key(f)) ?? 0) > (b.get(key(f)) ?? 0));
  const preExisting = now.length - fresh.length;
  return { now, fresh, preExisting };
}

async function cmdVerify(args) {
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--')).map(rel);
  if (!files.length) die(2, 'svs verify: give the files to check.');
  const s = loadState();
  const task = openTask(s);
  const env = loadEnv();
  const eng = await engine();
  for (const r of files) {
    if (!fs.existsSync(path.join(ROOT, r))) die(2, `svs verify: ${r} does not exist.`);
    if (!inScope(task, r) && !waived('scope', r)) die(1, `svs verify: ${r} is outside the task scope (${task.scope.join(' ')}). Widen it with a new \`svs start\`, or ask the user for a \`scope\` waiver.`);
    if (!eng.LINTABLE.test(r)) die(2, `svs verify: ${r} is not a Svelte/JS/TS file.`);
  }
  const reachable = eng.serverReachable(env);
  const report = { gate: [], review: [], waived: [], preExisting: 0 };
  for (const r of files) {
    const { fresh, preExisting } = await compare(env, eng, r, reachable, task.baseline);
    report.preExisting += preExisting;
    for (const f of fresh) {
      if (f.class === 'review') report.review.push(f);
      else if (waived(f.rule, f.file)) report.waived.push(f);
      else report.gate.push(f);
    }
    s.verify.files[r] = { hash: fileHash(r), ok: !fresh.some((f) => f.class === 'gate' && !waived(f.rule, f.file)), preExisting, review: fresh.filter((f) => f.class === 'review') };
  }
  const ok = report.gate.length === 0;
  s.verify.passes = ok ? 0 : s.verify.passes + 1;
  saveState(s);
  if (json) console.log(JSON.stringify(sortKeys({ ok, passes: s.verify.passes, ...report }), null, 2));
  else {
    for (const f of report.gate) console.log(`GATE    ${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.message}`);
    for (const f of report.waived) console.log(`WAIVED  ${f.file}:${f.line}:${f.column}  ${f.rule}`);
    for (const f of report.review) console.log(`REVIEW  ${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.message}`);
    if (report.preExisting) console.log(`(${report.preExisting} pre-existing finding(s) in these files: not blocking, listed by \`svs legacy-report\`)`);
    console.log(`verify: ${ok ? 'PASS' : `FAIL (${report.gate.length} new gate finding(s), pass ${s.verify.passes}/${MAX_PASSES})`}`);
  }
  if (!ok && s.verify.passes >= MAX_PASSES) {
    console.error(`STOP: ${MAX_PASSES} failing passes. Do not keep patching: ask the user (fix strategy, or a waiver they validate), then \`svs start --resume\`.`);
  }
  return ok ? 0 : 1;
}

function changedFiles(task) {
  const tracked = (git(['diff', '--name-only', task.baseline]) ?? '').split('\n');
  const untracked = (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n');
  return [...new Set([...tracked, ...untracked])].filter((f) => f && !f.startsWith('.svelte-strict/')).sort();
}
function scopeTreeHash(task) {
  return sha(changedFiles(task).map((f) => `${f}:${fileHash(f)}`).join('\n'));
}

function cmdStep(args) {
  const sep = args.indexOf('--');
  const name = args[0];
  if (!name || sep < 0 || sep === args.length - 1) die(2, 'svs step: usage `svs step <name> -- <cmd…>` (names: test-first, suite, or any).');
  const s = loadState();
  const task = openTask(s);
  const [cmd, ...rest] = args.slice(sep + 1);
  const r = spawnSync(cmd, rest, { cwd: ROOT, stdio: 'inherit' });
  const exit = r.status ?? 1;
  s.steps[name] = { exit, cmd: [cmd, ...rest].join(' '), tree: scopeTreeHash(task) };
  saveState(s);
  console.log(`svs step ${name}: exit ${exit} (recorded)`);
  return exit;
}

function cmdWaive(args) {
  const [rule, target, ...reason] = args;
  if (!rule || !target || !reason.length) die(2, 'svs waive: usage `svs waive <rule> <file|*> <reason…>`');
  if (target === '*' && !['shadcn-overwrite', 'shadcn-registry-url'].includes(rule)) die(2, 'svs waive: `*` is only allowed for shadcn-overwrite / shadcn-registry-url.');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(WAIVERS)) fs.writeFileSync(WAIVERS, '# Waivers — only the user may change `non` to `oui`\n\n| rule | target | reason | validated |\n|---|---|---|---|\n');
  fs.appendFileSync(WAIVERS, `| ${rule} | ${target} | ${reason.join(' ').replace(/\|/g, '/')} | non |\n`);
  console.log(`svs: waiver proposed (validated: non) in ${posix(path.relative(process.cwd(), WAIVERS))}. Ask the user to review it and set \`oui\`.`);
  return 0;
}

// ── shadcn wrapper ───────────────────────────────────────────────────────────
function shadcnBin() {
  const pkgDir = path.join(TOOLING, 'node_modules', 'shadcn-svelte');
  const pkg = readJSON(path.join(pkgDir, 'package.json'));
  if (!pkg) die(2, 'svs shadcn: tooling not installed (svs doctor --install).');
  const bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
  return path.join(pkgDir, bin);
}
function snapshot(dirs) {
  const out = {};
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const p = stack.pop();
      if (fs.statSync(p).isDirectory()) { if (!['node_modules', '.git', '.svelte-strict'].includes(path.basename(p))) stack.push(...fs.readdirSync(p).map((n) => path.join(p, n))); }
      else out[rel(p)] = sha(fs.readFileSync(p));
    }
  }
  return out;
}
async function cmdShadcn(args) {
  const [command, ...rest] = args;
  const help = spawnSync(process.execPath, [shadcnBin(), '--help'], { encoding: 'utf8' }).stdout ?? '';
  const commands = [...help.matchAll(/^\s{2}(\w[\w-]*)\b/gm)].map((m) => m[1]).filter((c) => c !== 'help');
  if (!command || !commands.includes(command)) die(2, `svs shadcn: unknown command \`${command ?? ''}\`. The pinned CLI offers: ${commands.join(', ')}`);
  if (rest.some((a) => a === '--overwrite' || a === '-o') && !waived('shadcn-overwrite', '*')) die(1, 'svs shadcn: --overwrite destroys local edits — needs a validated `shadcn-overwrite` waiver.');
  for (const url of rest.filter((a) => /^https?:\/\//.test(a))) if (!waived('shadcn-registry-url', url) && !waived('shadcn-registry-url', '*')) die(1, `svs shadcn: ${url} is a third-party registry item — needs a validated \`shadcn-registry-url\` waiver for it.`);
  const s = loadState();
  openTask(s);
  const env = loadEnv();
  const watched = ['src', 'components.json', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'bun.lock', 'yarn.lock'];
  const before = snapshot(watched);
  const r = spawnSync(process.execPath, [shadcnBin(), command, ...rest, '--cwd', ROOT], { stdio: 'inherit' });
  const after = snapshot(watched);
  const written = Object.keys(after).filter((f) => after[f] !== before[f]).sort();
  for (const f of written) s.shadcn[f] = after[f];
  saveState(s);
  console.log(`svs shadcn: exit ${r.status}; ${written.length} file(s) recorded as written by the CLI.`);
  if (r.status !== 0) return 1;
  const lint = written.filter((f) => /\.(svelte|ts|js)$/.test(f) && env.shadcn?.uiDir && f.startsWith(env.shadcn.uiDir));
  if (lint.length) console.log(`Next: svs verify ${lint.join(' ')}`);
  return 0;
}

// ── legacy report ────────────────────────────────────────────────────────────
async function cmdLegacyReport(args) {
  const env = loadEnv();
  const eng = await engine();
  const dirs = args.length ? args : ['src'];
  const reachable = eng.serverReachable(env);
  const rows = new Map();
  for (const d of dirs) {
    for (const abs of eng.sourceFiles(path.join(ROOT, d))) {
      for (const f of await eng.analyze(env, abs, fs.readFileSync(abs, 'utf8'), reachable)) {
        const k = `${f.file}\t${f.rule}`;
        rows.set(k, (rows.get(k) ?? 0) + 1);
      }
    }
  }
  const list = [...rows].map(([k, n]) => { const [file, rule] = k.split('\t'); return { file, rule, count: n }; })
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJSON(path.join(STATE_DIR, 'legacy-report.json'), list);
  const total = list.reduce((n, r) => n + r.count, 0);
  for (const r of list) console.log(`${String(r.count).padStart(5)}  ${r.file}  ${r.rule}`);
  console.log(`legacy-report: ${total} finding(s) in ${new Set(list.map((r) => r.file)).size} file(s) — the migration work list (nothing filtered).`);
  return 0;
}

// ── svelte-check with baseline ───────────────────────────────────────────────
function svelteCheck(dir) {
  const bin = path.join(TOOLING, 'node_modules', 'svelte-check', 'bin', 'svelte-check');
  const r = spawnSync(process.execPath, [bin, '--workspace', dir, '--output', 'machine-verbose'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  const diags = [];
  for (const line of (r.stdout ?? '').split('\n')) {
    const j = line.indexOf('{');
    if (j < 0) continue;
    try {
      const d = JSON.parse(line.slice(j));
      if (d.type === 'ERROR' || d.type === 'WARNING') diags.push({ file: posix(d.filename), code: String(d.code ?? ''), message: String(d.message).split('\n')[0], line: (d.start?.line ?? 0) + 1 });
    } catch { /* not a diagnostic line */ }
  }
  const completed = /COMPLETED/.test(r.stdout ?? '');
  return { diags, completed };
}
function baselineSvelteCheck(task, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svs-baseline-'));
  try {
    if (git(['worktree', 'add', '--detach', tmp, task.baseline], { stdio: 'pipe' }) == null) return null;
    if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
    if (env.kit) spawnSync(process.execPath, [path.join(ROOT, 'node_modules', '@sveltejs', 'kit', 'svelte-kit.js'), 'sync'], { cwd: tmp, stdio: 'ignore' });
    return svelteCheck(tmp);
  } finally {
    git(['worktree', 'remove', '--force', tmp]);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── finish ───────────────────────────────────────────────────────────────────
async function cmdFinish() {
  const s = loadState();
  const task = openTask(s);
  const env = loadEnv();
  const eng = await engine();
  const checks = [];
  const check = (name, ok, detail = []) => checks.push({ name, ok, detail });
  const changed = changedFiles(task);

  // 1. scope
  const shadcnClean = (f) => s.shadcn[f] && s.shadcn[f] === fileHash(f);
  const outOfScope = changed.filter((f) => !inScope(task, f) && !shadcnClean(f) && !waived('scope', f));
  check('scope', outOfScope.length === 0, outOfScope.map((f) => `${f} changed outside the scope (svs start globs, or a validated \`scope\` waiver)`));

  // 2. ui customizations: files written by `svs shadcn`, then edited
  const uiEdited = Object.keys(s.shadcn).filter((f) => s.shadcn[f] !== fileHash(f) && !waived('ui-customization', f));
  check('ui-customizations', uiEdited.length === 0, uiEdited.map((f) => `${f} edited after shadcn wrote it: needs a validated \`ui-customization\` waiver`));

  // 3. every changed lintable file verified on its CURRENT content
  const unverified = changed.filter((f) => eng.LINTABLE.test(f) && fs.existsSync(path.join(ROOT, f)) && !shadcnClean(f))
    .filter((f) => s.verify.files[f]?.hash !== fileHash(f) || !s.verify.files[f]?.ok);
  check('verified', unverified.length === 0, unverified.map((f) => `${f}: ${s.verify.files[f] ? (s.verify.files[f].ok ? 'edited after verify' : 'last verify failed') : 'never verified'} — run svs verify ${f}`));

  // 4. anti-calibration: suppressions, `any`, protected configs
  const calib = [];
  for (const f of changed) {
    const added = fs.existsSync(path.join(ROOT, f))
      ? (git(['ls-files', '--error-unmatch', f], { stdio: 'pipe' }) == null ? fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n') : (git(['diff', '-U0', task.baseline, '--', f]) ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')))
      : [];
    if (added.some((l) => SUPPRESSION.test(l)) && !waived('suppression', f)) calib.push(`${f}: adds a lint/type suppression (needs a validated \`suppression\` waiver)`);
    if (/\.(ts|svelte)$/.test(f) && added.some((l) => ANY.test(l)) && !waived('any', f)) calib.push(`${f}: adds \`any\` (needs a validated \`any\` waiver)`);
    if (PROTECTED.test(f) && !shadcnClean(f) && !waived('config', f)) calib.push(`${f}: protected config changed (needs a validated \`config\` waiver)`);
  }
  check('anti-calibration', calib.length === 0, calib);

  // 5. svelte-check: only NEW diagnostics block (D1), whole project
  if (!s.baselineSvelteCheck) s.baselineSvelteCheck = baselineSvelteCheck(task, env);
  const nowCheck = svelteCheck(ROOT);
  const base = s.baselineSvelteCheck;
  if (!nowCheck.completed || !base?.completed) check('svelte-check', false, ['svelte-check did not complete (on the project or on the baseline worktree): UNVERIFIED']);
  else {
    const key = (d) => `${d.file}|${d.code}|${d.message}`;
    const before = base.diags.reduce((m, d) => m.set(key(d), (m.get(key(d)) ?? 0) + 1), new Map());
    const fresh = [];
    for (const d of nowCheck.diags) { const n = before.get(key(d)) ?? 0; if (n > 0) before.set(key(d), n - 1); else fresh.push(d); }
    check('svelte-check', fresh.length === 0, fresh.map((d) => `${d.file}:${d.line} ${d.message}`));
  }

  // 6. naming-convention on the changed files, new findings only
  const lint = siblingSkill('naming-convention', 'linter/lint.sh');
  const namable = changed.filter((f) => /\.(svelte|[cm]?[jt]s)$/.test(f) && fs.existsSync(path.join(ROOT, f)));
  if (!lint) check('naming', false, ['naming-convention skill not installed (svs doctor)']);
  else if (namable.length) {
    const r = spawnSync('bash', [lint, ...namable, '--since', task.baseline, '--no-color'], { cwd: ROOT, encoding: 'utf8' });
    check('naming', r.status === 0, r.status === 0 ? [] : (r.stdout + r.stderr).split('\n').filter((l) => /✗|ERROR|error/i.test(l)).slice(0, 30));
  } else check('naming', true);

  // 7. recorded steps on the current tree
  const tree = scopeTreeHash(task);
  const step = (name, okExits) => {
    const st = s.steps[name];
    if (!st) return `${name}: never run (svs step ${name} -- …)`;
    if (st.tree !== tree) return `${name}: run on an older version of the changes — run it again`;
    if (!okExits.includes(st.exit)) return `${name}: exit ${st.exit}`;
    return null;
  };
  const stepProblems = [step('suite', [0, 3])];
  if (['bug', 'feature'].includes(task.kind)) stepProblems.push(step('test-first', [0]));
  check('steps', stepProblems.every((p) => !p), stepProblems.filter(Boolean));

  // 8. waivers all validated
  const pending = waivers().filter((w) => !w.validated);
  check('waivers', pending.length === 0, pending.map((w) => `${w.rule} ${w.target}: not validated by the user`));

  const ok = checks.every((c) => c.ok);
  const suite3 = s.steps.suite?.exit === 3;
  const { checklist } = await import(pathToFileURL(path.join(TOOLING, 'plugin', 'index.js')).href);
  writeReport(s, task, checks, checklist.filter((c) => (s.routeTags ?? []).includes(c.when)), ok);
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
    for (const d of c.detail) console.log(`    ${d}`);
  }
  if (ok) { s.task.open = false; }
  saveState(s);
  console.log(`finish: ${ok ? (suite3 ? 'PASS with pre-existing suite failures (exit 3)' : 'PASS') : 'FAIL'} — report: ${posix(path.relative(process.cwd(), path.join(STATE_DIR, 'report.md')))}`);
  return ok ? (suite3 ? 3 : 0) : 1;
}

function writeReport(s, task, checks, items, ok) {
  const lines = [
    '# svelte-strict report', '',
    `- result: **${ok ? 'PASS' : 'FAIL'}**`,
    `- kind: ${task.kind} · baseline: \`${task.baseline.slice(0, 12)}\` · resumes after the ${MAX_PASSES}-pass limit: ${task.resumes ?? 0}`,
    `- scope: ${task.scope.map((g) => `\`${g}\``).join(' ')}`, '',
    '## Gates', '', '| gate | result | detail |', '|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : 'FAIL'} | ${c.detail.join('<br>').replace(/\|/g, '/')} |`), '',
    '## Steps', '', '| step | exit | command |', '|---|---|---|',
    ...Object.entries(s.steps).sort().map(([n, st]) => `| ${n} | ${st.exit} | \`${st.cmd.replace(/\|/g, '/')}\` |`), '',
    '## Waivers', '',
    ...(waivers().length ? ['| rule | target | reason | validated |', '|---|---|---|---|', ...waivers().map((w) => `| ${w.rule} | ${w.target} | ${w.reason} | ${w.validated ? 'oui' : 'non'} |`)] : ['none']), '',
    '## Review findings (not blocking)', '',
    ...(Object.values(s.verify.files).flatMap((v) => v.review ?? []).map((f) => `- \`${f.file}:${f.line}\` ${f.rule}: ${f.message}`).sort()),
    ...(items.length ? ['', '### Checklist', '', ...items.map((c) => `- [ ] (${c.id}) ${c.text}`)] : []), '',
    '## Pre-existing findings in touched files (legacy work list)', '',
    ...Object.entries(s.verify.files).filter(([, v]) => v.preExisting).sort().map(([f, v]) => `- \`${f}\`: ${v.preExisting}`),
    '', 'Full list: `svs legacy-report`.', '',
  ];
  fs.writeFileSync(path.join(STATE_DIR, 'report.md'), lines.join('\n'));
}

// ── docs snapshot ────────────────────────────────────────────────────────────
function cmdDocs(args) {
  const [sub] = args;
  const env = loadEnv();
  const dir = path.join(STATE_DIR, 'docs');
  const targets = [['svelte', `svelte@${env.svelte}`, 'documentation/docs']];
  if (env.kit) targets.push(['kit', `@sveltejs/kit@${env.kit}`, 'documentation/docs']);
  if (sub === 'path') { console.log(posix(dir)); return 0; }
  if (sub !== 'sync') die(2, 'svs docs: usage `svs docs sync [--dry-run]` or `svs docs path`');
  for (const [repo, tag, sub2] of targets) {
    const url = `https://codeload.github.com/sveltejs/${repo}/tar.gz/refs/tags/${encodeURIComponent(tag)}`;
    const out = path.join(dir, repo);
    if (args.includes('--dry-run')) { console.log(`${url} -> ${posix(out)} (${sub2})`); continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svs-docs-'));
    const r = spawnSync('bash', ['-c', 'set -o pipefail; curl -fsSL "$1" | tar -xz -C "$2"', '_', url, tmp], { stdio: 'inherit' });
    const top = r.status === 0 ? fs.readdirSync(tmp)[0] : null;
    if (!top || !fs.existsSync(path.join(tmp, top, sub2))) { fs.rmSync(tmp, { recursive: true, force: true }); die(1, `svs docs: download failed for ${tag}`); }
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.cpSync(path.join(tmp, top, sub2), out, { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`docs: ${tag} -> ${posix(out)}`);
  }
  return 0;
}

// ── hooks (optional, Claude Code only) ───────────────────────────────────────
async function cmdHook(args) {
  const input = readJSON('/dev/stdin', {});
  const s = loadState();
  if (!s.task?.open) return 0;
  if (args[0] === 'post-tool-use') {
    const f = input.tool_input?.file_path;
    if (!f || !/\.(svelte|[cm]?[jt]s)$/.test(f) || !inScope(s.task, rel(f))) return 0;
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'verify', f, '--project', ROOT], { encoding: 'utf8' });
    if (r.status !== 0) { process.stderr.write(r.stdout + r.stderr); return 2; }
    return 0;
  }
  if (args[0] === 'stop') {
    if (input.stop_hook_active) return 0; // already blocked once: let the user see report.md
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'finish', '--project', ROOT], { encoding: 'utf8' });
    if (r.status !== 0 && r.status !== 3) { process.stderr.write(`svelte-strict task still open — finish fails:\n${r.stdout}`); return 2; }
    return 0;
  }
  die(2, 'svs hook: post-tool-use | stop');
}

// ── references generated from rule meta ─────────────────────────────────────
async function cmdGenReferences(args) {
  const { rules, checklist } = await import(pathToFileURL(path.join(TOOLING, 'plugin', 'index.js')).href);
  const { buildConfig } = await engine();
  const cfg = buildConfig({ root: ROOT, svelte: '99.0.0', kit: '99.0.0', shadcn: {}, remoteFunctions: true });
  const reused = Object.entries(Object.assign({}, ...cfg.map((c) => c.rules ?? {})))
    .filter(([k, v]) => k.startsWith('svelte/') && (Array.isArray(v) ? v[0] : v) !== 'off').map(([k]) => k).sort();
  const since = (d) => [d.since?.svelte && `svelte ${d.since.svelte}`, d.since?.kit && `kit ${d.since.kit}`].filter(Boolean).join(', ');
  const lines = [
    '# Rule catalog (generated — `svs gen-references`, do not edit)', '',
    'Gate rules block `svs verify`/`svs finish` when NEW (D1). Review rules and the checklist are reported, never blocking.', '',
    '## svelte-strict rules', '', '| rule | class | area | active when | fix |', '|---|---|---|---|---|',
    ...Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)).map(([name, r]) => {
      const d = r.meta.docs;
      return `| \`svelte-strict/${name}\` | ${d.class} | ${d.area} | ${[d.needs, since(d)].filter(Boolean).join(', ') || 'always'} | ${d.fix} |`;
    }), '',
    '## Reused eslint-plugin-svelte rules (all `error`)', '', reused.map((r) => `\`${r}\``).join(' · '), '',
    'Disabled on purpose: `svelte/valid-compile` (the project\'s own compiler runs instead), `svelte/prefer-class-directive` (contradicts Svelte 5 clsx guidance).', '',
    'Version gates (checked against the official CHANGELOGs): `use:` → `{@attach}` from svelte 5.29.0; `class:` → clsx from 5.16.0; `svelte/no-navigation-without-resolve` from kit 2.26.0; `$app/stores` → `$app/state` from kit 2.12.0.', '',
    '## Review checklist (not decidable by a script)', '', '| id | applies to | check |', '|---|---|---|',
    ...checklist.map((c) => `| ${c.id} | ${c.when} | ${c.text} |`), '',
  ].join('\n');
  const out = path.join(SKILL, 'references', 'rules.md');
  if (args.includes('--check')) {
    const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === lines;
    console.log(same ? 'references/rules.md up to date' : 'references/rules.md is stale — run svs gen-references');
    return same ? 0 : 1;
  }
  fs.writeFileSync(out, lines);
  console.log(`wrote ${posix(out)}`);
  return 0;
}

// ── main ─────────────────────────────────────────────────────────────────────
const [command, ...args] = process.argv.slice(2);
const commands = {
  doctor: cmdDoctor, env: cmdEnv, start: cmdStart, route: cmdRoute, verify: cmdVerify, step: cmdStep,
  waive: cmdWaive, shadcn: cmdShadcn, 'legacy-report': cmdLegacyReport, finish: cmdFinish, docs: cmdDocs,
  hook: cmdHook, 'gen-references': cmdGenReferences,
};
if (!commands[command]) die(2, 'usage: svs doctor|env|start|route|verify|step|waive|shadcn|legacy-report|finish|docs|hook|gen-references');
process.exitCode = await commands[command](args);
