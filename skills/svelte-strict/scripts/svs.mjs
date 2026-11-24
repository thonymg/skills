#!/usr/bin/env node
// svs — the svelte-strict gate. Every decision is an exit code, every step is
// recorded in .svelte-strict/state.json by this script only (never by hand).
// The gate machinery (state, baseline, scope, waivers, steps, finish, report)
// lives in the strict-core skill; this file only adds the Svelte analysis.
//
//   0 pass · 1 fail or unverified · 2 usage/environment · 3 only pre-existing suite failures
//
// Commands: doctor [--install] · env [--json] · start <glob…> [--kind K] [--files <f…>] [--resume] · route <file…> [--full]
//           verify <file…> [--json] · step <name> -- <cmd…> · waive <rule> <file> <reason…>
//           shadcn <cmd> [args…] · legacy-report [dir…] · finish · docs sync|path [--dry-run]
//           hook post-tool-use|stop · gen-references [--check]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLING = path.join(SKILL, 'tooling');
const CORE = path.join(SKILL, '..', 'strict-core', 'lib', 'core.mjs');
if (!fs.existsSync(CORE)) { console.error('svs: required skill missing: strict-core — install it next to svelte-strict.'); process.exit(2); }
const { createCore, die, posix, readJSON, writeJSON, sortKeys, sha } = await import(pathToFileURL(CORE).href);

const core = createCore({
  cli: 'svs', tool: 'svelte-strict', stateDirName: '.svelte-strict', rootMarker: 'package.json', skillDir: SKILL,
  kinds: ['bug', 'feature', 'migration', 'ui', 'refactor'],
  protectedRe: /(^|\/)(eslint\.config\.[cm]?[jt]s|\.eslintrc[^/]*|\.eslintignore|tsconfig[^/]*\.json|jsconfig\.json|svelte\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|components\.json)$/,
  suppressionRe: /svelte-ignore|eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/,
  loosen: { re: /(:\s*any\b|\bas\s+any\b|<any>)/, files: /\.(ts|svelte)$/ },
  starWaivers: ['shadcn-overwrite', 'shadcn-registry-url'],
  stateExtra: { shadcn: {} },
});
const { ROOT, STATE_DIR, rel, fileHash, git, loadState, saveState, openTask, inScope, waived } = core;

function loadEnv() {
  const env = readJSON(path.join(STATE_DIR, 'env.json'));
  if (!env) die(2, 'svs: no env.json — run `svs env` first.');
  return { ...env, root: ROOT };
}
async function engine() {
  if (!fs.existsSync(path.join(TOOLING, 'node_modules'))) die(2, `svs: tooling not installed — run \`node ${posix(path.join(SKILL, 'scripts/svs.mjs'))} doctor --install\`.`);
  return import(pathToFileURL(path.join(TOOLING, 'engine.mjs')).href);
}

// ── env ──────────────────────────────────────────────────────────────────────
const pkgVersion = (name) => readJSON(path.join(ROOT, 'node_modules', name, 'package.json'))?.version ?? null;
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
    if (!core.siblingSkill(skill, file)) problems.push(`required skill missing: ${skill} (${file}) — install it next to svelte-strict`);
  }
  if (spawnSync('git', ['--version']).status !== 0) problems.push('git not found');
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) return 2;
  if (!args.includes('--quiet')) console.log('svs doctor: ok (graph: use codebase-memory if connected, else svs falls back to its own import resolver)');
  return 0;
}

function cmdEnv(args = []) {
  const env = detectEnv();
  if (!env.svelte) die(1, 'svs env: svelte not found in node_modules — install the project dependencies first (no default version is assumed).');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJSON(path.join(STATE_DIR, 'env.json'), env);
  if (args.includes('--json')) console.log(JSON.stringify(sortKeys(env), null, 2));
  else console.log(core.formatEnvLine([['svelte', env.svelte], ['kit', env.kit], ['shadcn', env.shadcn ? 'yes' : null], ['runes', env.runes === null ? null : String(env.runes)], ['async', env.async], ['remote-functions', env.remoteFunctions], ['adapter', env.adapter], ['ts', env.ts]]) + ` (full: svs env --json)`);
  return 0;
}

const REFERENCES = { svelte: 'references/svelte.md', legacy: 'references/svelte.md', test: 'references/svelte.md', kit: 'references/sveltekit.md', shadcn: 'references/shadcn.md' };
// tag -> [file, heading prefix]; no heading = whole file. A renamed heading throws in printSections.
const SECTIONS = {
  svelte: [['references/svelte.md', 'State decision table']],
  legacy: [['references/svelte.md', 'Legacy']],
  test: [['references/svelte.md', 'Testing Svelte 5']],
  kit: [['references/sveltekit.md']],
  shadcn: [['references/shadcn.md']],
};
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
async function cmdRoute(args) {
  const full = args.includes('--full');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) die(2, 'svs route: give the files you will touch.');
  const env = loadEnv();
  const tags = routeTags(env, files);
  const { checklist } = await engine();
  const refs = [...new Set(tags.map((t) => REFERENCES[t]).filter(Boolean))].sort();
  console.log(`tags: ${tags.join(' ') || '(none)'}`);
  if (full) {
    console.log('read:');
    for (const r of refs) console.log(`  ${posix(path.join(SKILL, r))}`);
  } else core.printSections(SKILL, tags, SECTIONS);
  const items = checklist.filter((c) => tags.includes(c.when));
  if (items.length) { console.log('review checklist (not blocking, reported by finish):'); for (const c of items) console.log(`  [${c.id}] ${c.text}`); }
  const s = loadState();
  if (s.task?.open) { s.routeTags = [...new Set([...(s.routeTags ?? []), ...tags])].sort(); saveState(s); }
  return 0;
}

async function cmdVerify(args) {
  const only = core.takeFlag(args, '--rule');
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
  const perFile = {};
  for (const r of files) {
    const abs = path.join(ROOT, r);
    const now = await eng.analyze(env, abs, fs.readFileSync(abs, 'utf8'), reachable);
    const old = git(['show', `${task.baseline}:${r}`]);
    const before = old == null ? [] : await eng.analyze(env, abs, old, reachable);
    const fresh = core.newFindings(now, before, (f) => `${f.rule}|${f.message}`);
    const preExisting = now.length - fresh.length;
    report.preExisting += preExisting;
    for (const f of fresh) {
      if (f.class === 'review') report.review.push(f);
      else if (waived(f.rule, f.file)) report.waived.push(f);
      else report.gate.push(f);
    }
    perFile[r] = { hash: fileHash(r), ok: !fresh.some((f) => f.class === 'gate' && !waived(f.rule, f.file)), preExisting, review: fresh.filter((f) => f.class === 'review') };
  }
  const ok = report.gate.length === 0;
  const passes = core.recordVerify(s, perFile, ok);
  if (json) console.log(JSON.stringify(sortKeys({ ok, passes, ...report }), null, 2));
  else {
    if (only) {
      const known = [...report.gate, ...report.waived, ...report.review].map((f) => f.rule);
      if (!known.includes(only)) die(2, `svs verify: no finding for rule \`${only}\`. Rules with findings: ${[...new Set(known)].join(', ') || '(none)'}${known.length ? `. Closest: ${core.suggestOptions(only, known).join(', ')}` : ''}.`);
    }
    core.printFindings(report, { cli: 'svs', files, rule: only, ruleOf: (f) => f.rule, whereOf: (f) => `${f.file}:${f.line}:${f.column}`, fixOf: (r) => eng.strictRules[r.replace(/^svelte-strict\//, '')]?.meta?.docs?.fix });
    if (report.preExisting) console.log(`(${report.preExisting} pre-existing finding(s) in these files: not blocking, listed by \`svs legacy-report\`)`);
    console.log(`verify: ${ok ? 'PASS' : `FAIL (${report.gate.length} new gate finding(s), pass ${passes}/${core.MAX_PASSES})`}`);
  }
  return ok ? 0 : 1;
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
  return { diags, completed: /COMPLETED/.test(r.stdout ?? '') };
}

// ── finish ───────────────────────────────────────────────────────────────────
async function cmdFinish() {
  const s = loadState();
  const task = openTask(s);
  const env = loadEnv();
  const eng = await engine();
  const shadcnClean = (f) => s.shadcn[f] && s.shadcn[f] === fileHash(f);
  const checks = core.commonChecks(s, task, { verifiable: (f) => eng.LINTABLE.test(f), toolWritten: shadcnClean, namable: /\.(svelte|[cm]?[jt]s)$/ });

  const uiEdited = Object.keys(s.shadcn).filter((f) => s.shadcn[f] !== fileHash(f) && !waived('ui-customization', f));
  checks.push({ name: 'ui-customizations', ok: uiEdited.length === 0, detail: uiEdited.map((f) => `${f} edited after shadcn wrote it: needs a validated \`ui-customization\` waiver`) });

  // svelte-check: only NEW diagnostics block (D1), whole project, baseline worktree computed once
  if (!s.baselineSvelteCheck) {
    s.baselineSvelteCheck = core.withBaselineWorktree(task, (tmp) => {
      if (env.kit) spawnSync(process.execPath, [path.join(ROOT, 'node_modules', '@sveltejs', 'kit', 'svelte-kit.js'), 'sync'], { cwd: tmp, stdio: 'ignore' });
      return svelteCheck(tmp);
    }, ['node_modules']);
  }
  const nowCheck = svelteCheck(ROOT);
  const base = s.baselineSvelteCheck;
  if (!nowCheck.completed || !base?.completed) checks.push({ name: 'svelte-check', ok: false, detail: ['svelte-check did not complete (on the project or on the baseline worktree): UNVERIFIED'] });
  else {
    const fresh = core.newFindings(nowCheck.diags, base.diags, (d) => `${d.file}|${d.code}|${d.message}`);
    checks.push({ name: 'svelte-check', ok: fresh.length === 0, detail: fresh.map((d) => `${d.file}:${d.line} ${d.message}`) });
  }

  const { checklist } = await import(pathToFileURL(path.join(TOOLING, 'plugin', 'index.js')).href);
  const items = checklist.filter((c) => (s.routeTags ?? []).includes(c.when));
  return core.finalize(s, task, checks, [
    { title: 'Review findings (not blocking)', lines: [
      ...Object.values(s.verify.files).flatMap((v) => v.review ?? []).map((f) => `- \`${f.file}:${f.line}\` ${f.rule}: ${f.message}`).sort(),
      ...(items.length ? ['', '### Checklist', '', ...items.map((c) => `- [ ] (${c.id}) ${c.text}`)] : []),
    ] },
    { title: 'Pre-existing findings in touched files (legacy work list)', lines: [
      ...Object.entries(s.verify.files).filter(([, v]) => v.preExisting).sort().map(([f, v]) => `- \`${f}\`: ${v.preExisting}`),
      '', 'Full list: `svs legacy-report`.',
    ] },
  ]);
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
// `start --files <f…>` = doctor + env + start + route in one call; without --files it is the plain start.
async function cmdStart(args) {
  const files = core.takeList(args, '--files');
  if (!files.length) return core.cmdStart(args);
  if (!args.includes('--resume')) {
    const failed = cmdDoctor(['--quiet']) || cmdEnv([]);
    if (failed) return failed;
  }
  const code = core.cmdStart(args);
  return code || cmdRoute(files);
}

const commands = {
  doctor: cmdDoctor, env: cmdEnv, start: cmdStart, route: cmdRoute, verify: cmdVerify, step: core.cmdStep,
  waive: core.cmdWaive, shadcn: cmdShadcn, 'legacy-report': cmdLegacyReport, finish: cmdFinish, docs: cmdDocs,
  hook: (a) => core.cmdHook(a, { script: fileURLToPath(import.meta.url), matches: (f) => /\.(svelte|[cm]?[jt]s)$/.test(f) }),
  'gen-references': cmdGenReferences,
};
if (!commands[command]) die(2, 'usage: svs doctor|env|start|route|verify|step|waive|shadcn|legacy-report|finish|docs|hook|gen-references');
process.exitCode = await commands[command](args);
