#!/usr/bin/env node
// pbg — the pocketbase-go gate (PocketBase used as a Go framework; the
// standalone binary is supported too). Every decision is an exit code; every
// step is recorded in .pocketbase-go/state.json by this script only.
// State, baseline, scope, waivers, steps, finish and report come from strict-core.
//
//   0 pass · 1 fail or unverified · 2 usage/environment · 3 only pre-existing suite failures
//
// Commands: doctor [--install] · env [--json] · pb · start <glob…> [--kind K] [--files <f…>] [--resume] · route <file…> [--full]
//           verify <file…> [--json] · step <name> -- <cmd…> · waive <rule> <target> <reason…>
//           schema · access [--init] · migrate-check · legacy-report · finish
//           hook post-tool-use|stop · gen-references [--check]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBCHECK = path.join(SKILL, 'tooling', 'pbcheck');
const CORE = path.join(SKILL, '..', 'strict-core', 'lib', 'core.mjs');
if (!fs.existsSync(CORE)) { console.error('pbg: required skill missing: strict-core — install it next to pocketbase-go.'); process.exit(2); }
const { createCore, die, posix, readJSON, writeJSON, sortKeys, sha } = await import(pathToFileURL(CORE).href);

const core = createCore({
  cli: 'pbg', tool: 'pocketbase-go', stateDirName: '.pocketbase-go', rootMarker: 'go.mod', skillDir: SKILL,
  kinds: ['bug', 'feature', 'migration', 'refactor'],
  protectedRe: /(^|\/)(staticcheck\.conf|\.golangci\.(ya?ml|toml|json))$/,
  suppressionRe: /\/\/\s*(nolint\b|lint:(file-)?ignore\b|#nosec\b)/,
  loosen: null,
  starWaivers: [],
});
const { ROOT, STATE_DIR, rel, fileHash, git, loadState, saveState, openTask, inScope, waived } = core;
const ACCESS_FILE = 'pb-access.json';

// ══ ephemeral PocketBase ══════════════════════════════════════════════════════
// Ephemeral PocketBase instances: build (framework) or download (standalone,
// sha256-checked), serve on a free port with a fresh data dir, export a
// normalized schema, run the access matrix, check migration reversibility.
// PocketBase itself is the oracle: it validates every API rule on save.

const SU = { email: 'pbg-superuser@pbg.test', password: 'Pbg-Superuser-Passw0rd!' };
const ACTOR_PASSWORD = 'Pbg-Actor-Passw0rd!';

// ── binaries ─────────────────────────────────────────────────────────────────
/** Builds the project (framework mode) into `out`. Never under os.tmpdir(): IsProbablyGoRun() would turn Automigrate on. */
function buildApp(dir, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync('go', ['build', '-o', out, '.'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? 'auto' } });
  if (r.status !== 0) throw new Error(`go build failed:\n${(r.stderr || r.stdout).trim()}`);
  return out;
}

/** Downloads the official standalone binary for `version`, verified against the release checksums.txt. */
async function downloadPocketBase(version, cacheDir) {
  const plat = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!plat || !arch) throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
  const dir = path.join(cacheDir, `pocketbase_${version}_${plat}_${arch}`);
  const bin = path.join(dir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
  if (fs.existsSync(bin)) return bin;
  const [, minor] = version.split('.').map(Number);
  const base = minor >= 41
    ? `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v${version}/`
    : `https://github.com/pocketbase/pocketbase/releases/download/v${version}/`;
  const zipName = `pocketbase_${version}_${plat}_${arch}.zip`;
  const sums = await (await fetch(`${base}checksums.txt`)).text();
  const want = sums.split('\n').find((l) => l.trim().endsWith(zipName))?.split(/\s+/)[0];
  if (!want) throw new Error(`no checksum for ${zipName} in ${base}checksums.txt`);
  const res = await fetch(base + zipName);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${base}${zipName}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`checksum mismatch for ${zipName}: got ${got}, want ${want}`);
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, zipName);
  fs.writeFileSync(zip, buf);
  const u = spawnSync('unzip', ['-o', zip, path.basename(bin), '-d', dir], { encoding: 'utf8' });
  fs.rmSync(zip);
  if (u.status !== 0) throw new Error(`unzip failed: ${u.stderr}`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// ── instance ─────────────────────────────────────────────────────────────────
/**
 * Runs fn(api) against a fresh instance. `extra` = flags for standalone mode
 * (--migrationsDir, --hooksDir). The data dir is deleted afterwards.
 */
async function withInstance(bin, runDir, extra, fn) {
  const data = fs.mkdtempSync(path.join(runDir, 'data-'));
  const env = { ...process.env, PB_ENCRYPTION: '' };
  try {
    const up = spawnSync(bin, ['superuser', 'upsert', SU.email, SU.password, '--dir', data, ...extra], { cwd: runDir, encoding: 'utf8', env });
    if (up.status !== 0) throw new Error(`superuser upsert failed (migrations may have failed — PocketBase validates every rule):\n${(up.stderr || up.stdout).trim()}`);
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const child = spawn(bin, ['serve', '--http', `127.0.0.1:${port}`, '--dir', data, ...extra], { cwd: runDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const exited = new Promise((r) => child.on('exit', r));
    try {
      let ready = false;
      for (let i = 0; i < 150 && !ready && child.exitCode == null; i++) {
        try { ready = (await fetch(`${url}/api/health`)).ok; } catch { /* not up yet */ }
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error(`PocketBase did not start:\n${log.trim().split('\n').slice(-15).join('\n')}`);
      const api = makeApi(url);
      api.su = (await api.req('POST', '/api/collections/_superusers/auth-with-password', { identity: SU.email, password: SU.password })).data?.token;
      if (!api.su) throw new Error('superuser authentication failed');
      return await fn(api);
    } finally {
      child.kill('SIGTERM');
      await exited;
    }
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
}

function makeApi(url) {
  return {
    url,
    async req(method, p, body, token) {
      const r = await fetch(url + p, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) },
        body: body == null ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await r.json(); } catch { /* 204 */ }
      return { status: r.status, data };
    },
  };
}

// ── schema ───────────────────────────────────────────────────────────────────
/** Recursively sorted keys: two schemas compare equal whatever order the API (or state.json) used. */
const canonical = (v) => (Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);

/** Collections without volatile parts (timestamps, random field ids), canonical, sorted by name. */
async function exportSchema(api) {
  const r = await api.req('GET', '/api/collections?perPage=500&sort=name', null, api.su);
  if (r.status !== 200) throw new Error(`cannot list collections: ${r.status}`);
  return r.data.items.map((c) => {
    const { created, updated, ...rest } = c;
    return canonical({ ...rest, fields: (c.fields ?? []).map(({ id, ...f }) => f) });
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const isSystem = (c) => c.system || c.name.startsWith('_');

/** Static findings on the exported schema. */
function lintSchema(schema) {
  const out = [];
  const authIds = new Set(schema.filter((c) => c.type === 'auth').map((c) => c.id));
  for (const c of schema.filter((x) => !isSystem(x))) {
    for (const action of ['create', 'update', 'delete']) {
      if (c.type !== 'view' && c[`${action}Rule`] === '') out.push({ rule: 'rules-public-write', class: 'gate', target: c.name, message: `${c.name}.${action}Rule is "" — anyone, even unauthenticated, can ${action}` });
    }
    for (const action of ['list', 'view']) {
      if (c[`${action}Rule`] === '') out.push({ rule: 'rules-public-read', class: 'review', target: c.name, message: `${c.name}.${action}Rule is "" (public read): confirm it is intended` });
    }
    for (const action of ['list', 'view', 'create', 'update', 'delete']) {
      const rule = c[`${action}Rule`];
      // @collection.* on either side of an operator that is not the any-of (`?`) variant
      const OP = '(\\?)?(!=|>=|<=|!~|=|>|<|~)';
      const left = [...(typeof rule === 'string' ? rule.matchAll(new RegExp(`@collection\\.[\\w.:]+\\s*${OP}`, 'g')) : [])];
      const right = [...(typeof rule === 'string' ? rule.matchAll(new RegExp(`${OP}\\s*@collection\\.`, 'g')) : [])];
      if ([...left, ...right].some((m) => !m[1])) {
        out.push({ rule: 'rules-collection-any', class: 'gate', target: c.name, message: `${c.name}.${action}Rule compares @collection.* with a single-value operator: use ?=, ?~ … (several rows can match)` });
      }
    }
    for (const f of c.fields.filter((x) => x.type === 'relation' && authIds.has(x.collectionId))) {
      const u = c.updateRule;
      if (typeof u === 'string' && u !== '' && !u.includes(`@request.body.${f.name}`)) {
        out.push({ rule: 'rules-owner-change', class: 'review', target: c.name, message: `${c.name}.updateRule does not constrain @request.body.${f.name}: check the ownerChange probe of pb-access.json` });
      }
    }
  }
  return out;
}

// ── access matrix ────────────────────────────────────────────────────────────
const ACTIONS = ['list', 'view', 'create', 'update', 'delete'];
const ACTORS = ['anon', 'owner', 'other'];

/** Which entries pb-access.json must contain for this schema (D4: missing = blocking). */
function accessCoverage(schema, spec) {
  const gaps = [];
  const authIds = new Set(schema.filter((c) => c.type === 'auth').map((c) => c.id));
  for (const c of schema.filter((x) => !isSystem(x))) {
    const rules = ACTIONS.map((a) => c[`${a}Rule`]);
    if (rules.every((r) => r == null)) continue; // superusers only: nothing to test
    const entry = spec.collections?.[c.name];
    if (!entry) { gaps.push(`${c.name}: has non-null API rules but no entry in pb-access.json`); continue; }
    const actions = c.type === 'view' ? ['list', 'view'] : ACTIONS;
    for (const a of actions) for (const who of ACTORS) {
      if (entry.expect?.[a]?.[who] === undefined) gaps.push(`${c.name}: missing expect.${a}.${who}`);
    }
    const ownerFields = c.fields.filter((f) => f.type === 'relation' && authIds.has(f.collectionId));
    if (ownerFields.length && c.type !== 'view') {
      if (c.createRule != null && !entry.probes?.spoofCreate) gaps.push(`${c.name}: relation to an auth collection — probes.spoofCreate (create on behalf of another user) is required`);
      if (c.updateRule != null && !entry.probes?.ownerChange) gaps.push(`${c.name}: relation to an auth collection — probes.ownerChange (reassign ownership) is required`);
    }
  }
  return gaps;
}

/** Runs every expectation; returns [{case, want, got}] for mismatches plus counters. */
async function runAccess(api, schema, spec) {
  const byName = Object.fromEntries(schema.map((c) => [c.name, c]));
  const authName = spec.auth ?? 'users';
  let seq = 0;
  const unique = () => `pbg-${++seq}@pbg.test`;
  const mkUser = async () => {
    const email = unique();
    const r = await api.req('POST', `/api/collections/${authName}/records`, { email, password: ACTOR_PASSWORD, passwordConfirm: ACTOR_PASSWORD, verified: true, ...(spec.actorData ?? {}) }, api.su);
    if (r.status !== 200) throw new Error(`cannot create actor in ${authName}: ${r.status} ${JSON.stringify(r.data)}`);
    const t = await api.req('POST', `/api/collections/${authName}/auth-with-password`, { identity: email, password: ACTOR_PASSWORD });
    return { id: r.data.id, token: t.data?.token };
  };
  const owner = await mkUser();
  const other = await mkUser();
  const actors = { anon: { id: '', token: null }, owner, other };
  // Auth records need a password on creation only (an update with one would require oldPassword).
  const fill = (data, actor, coll, creating = false) => {
    const out = JSON.parse(JSON.stringify(data ?? {}), (k, v) => (v === '@owner' ? owner.id : v === '@other' ? other.id : v === '@actor' ? actor.id : v === '@unique' ? unique() : v));
    if (creating && coll?.type === 'auth' && !('password' in out)) Object.assign(out, { password: ACTOR_PASSWORD, passwordConfirm: ACTOR_PASSWORD });
    return out;
  };
  const seed = async (name, entry) => {
    const r = await api.req('POST', `/api/collections/${name}/records`, fill(entry.seed, owner, byName[name], true), api.su);
    if (r.status !== 200) throw new Error(`seed of ${name} failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.id;
  };
  // `self: true` (auth collections): the target record IS the acting owner — a
  // fresh user per case, so deleting it never breaks the next case.
  const mkUserIn = async (name) => {
    const email = unique();
    const r = await api.req('POST', `/api/collections/${name}/records`, { email, password: ACTOR_PASSWORD, passwordConfirm: ACTOR_PASSWORD, verified: true, ...(name === authName ? spec.actorData ?? {} : {}) }, api.su);
    if (r.status !== 200) throw new Error(`cannot create a ${name} record: ${r.status} ${JSON.stringify(r.data)}`);
    const t = await api.req('POST', `/api/collections/${name}/auth-with-password`, { identity: email, password: ACTOR_PASSWORD });
    return { id: r.data.id, token: t.data?.token };
  };
  const target = async (name, entry) => (entry.self ? mkUserIn(name) : { id: await seed(name, entry), token: owner.token });
  const exec = async (name, entry, action, who, data) => {
    const base = `/api/collections/${name}/records`;
    if (action === 'create') return (await api.req('POST', base, fill(data ?? entry.create, actors[who], byName[name], true), actors[who].token)).status;
    const tgt = await target(name, entry);
    const actor = who === 'owner' && entry.self ? tgt : actors[who];
    if (action === 'list') {
      const r = await api.req('GET', `${base}?perPage=500`, null, actor.token);
      if (r.status !== 200) return r.status;
      return r.data.items.some((x) => x.id === tgt.id) ? 'has' : 'empty';
    }
    if (action === 'view') return (await api.req('GET', `${base}/${tgt.id}`, null, actor.token)).status;
    if (action === 'update') return (await api.req('PATCH', `${base}/${tgt.id}`, fill(data ?? entry.update, actor, byName[name]), actor.token)).status;
    if (action === 'delete') return (await api.req('DELETE', `${base}/${tgt.id}`, null, actor.token)).status;
    throw new Error(`unknown action ${action}`);
  };
  const mismatches = [];
  let cases = 0;
  for (const name of Object.keys(spec.collections ?? {}).sort()) {
    const entry = spec.collections[name];
    if (!byName[name]) { mismatches.push({ case: `${name}`, want: 'collection', got: 'missing from the schema' }); continue; }
    for (const action of ACTIONS) {
      for (const who of ACTORS) {
        const want = entry.expect?.[action]?.[who];
        if (want === undefined) continue;
        cases++;
        const got = await exec(name, entry, action, who);
        if (String(got) !== String(want)) mismatches.push({ case: `${name}.${action} as ${who}`, want, got });
      }
    }
    for (const [probe, p] of Object.entries(entry.probes ?? {}).sort()) {
      cases++;
      const got = await exec(name, entry, p.action, p.as, p.data);
      if (String(got) !== String(p.expect)) mismatches.push({ case: `${name} probe ${probe} (${p.action} as ${p.as})`, want: p.expect, got });
    }
  }
  return { cases, mismatches };
}

// ── migrations ───────────────────────────────────────────────────────────────
/**
 * up (fresh) → down N → up again; the two schemas must be identical. With
 * `expectedAfterDown` (the baseline schema), the state after reverting the N
 * migrations added by the task must equal it exactly: a down that is present
 * but incomplete is caught even when an older migration would mask it.
 */
async function migrateCheck(bin, runDir, extra, count, expectedAfterDown = null) {
  const data = fs.mkdtempSync(path.join(runDir, 'mig-'));
  const env = { ...process.env, PB_ENCRYPTION: '' };
  const pb = (args, input) => spawnSync(bin, [...args, '--dir', data, ...extra], { cwd: runDir, encoding: 'utf8', env, input });
  try {
    const up1 = pb(['migrate', 'up']);
    if (up1.status !== 0) return { ok: false, detail: [`migrate up failed or the migrate command is not registered (migratecmd.MustRegister): ${(up1.stderr || up1.stdout).trim().split('\n').slice(-3).join(' / ')}`] };
    const s1 = await schemaOfDir(bin, runDir, extra, data);
    if (count > 0) {
      const down = pb(['migrate', 'down', String(count)], 'y\n');
      if (down.status !== 0) return { ok: false, detail: [`migrate down ${count} failed: ${(down.stderr || down.stdout).trim().split('\n').slice(-3).join(' / ')}`] };
      if (expectedAfterDown) {
        const sd = await schemaOfDir(bin, runDir, extra, data);
        const want = new Map(expectedAfterDown.map((c) => [c.name, JSON.stringify(c)]));
        const got = new Map(sd.map((c) => [c.name, JSON.stringify(c)]));
        const diff = [...new Set([...want.keys(), ...got.keys()])].filter((n) => want.get(n) !== got.get(n)).sort();
        if (diff.length) {
          const first = firstDiff(expectedAfterDown.find((c) => c.name === diff[0]), sd.find((c) => c.name === diff[0]), diff[0]);
          return { ok: false, detail: [`after reverting the ${count} new migration(s) the schema differs from the baseline in: ${diff.join(', ')} — a down function does not undo its up (first difference: ${first})`] };
        }
      }
      const up2 = pb(['migrate', 'up']);
      if (up2.status !== 0) return { ok: false, detail: [`migrate up after down failed (down did not undo up): ${(up2.stderr || up2.stdout).trim().split('\n').slice(-3).join(' / ')}`] };
    }
    const s2 = await schemaOfDir(bin, runDir, extra, data);
    const a = JSON.stringify(s1), b = JSON.stringify(s2);
    if (a === b) return { ok: true, detail: [`${count} migration(s): up → down → up gives an identical schema`] };
    const names = (s) => new Map(s.map((c) => [c.name, JSON.stringify(c)]));
    const m1 = names(s1), m2 = names(s2);
    const diff = [...new Set([...m1.keys(), ...m2.keys()])].filter((n) => m1.get(n) !== m2.get(n)).sort();
    return { ok: false, detail: [`schema differs after up → down → up in: ${diff.join(', ')}`] };
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
}

/** Schema of an existing data dir (served briefly). */
async function schemaOfDir(bin, runDir, extra, data) {
  const env = { ...process.env, PB_ENCRYPTION: '' };
  spawnSync(bin, ['superuser', 'upsert', SU.email, SU.password, '--dir', data, ...extra], { cwd: runDir, env });
  const port = await freePort();
  const child = spawn(bin, ['serve', '--http', `127.0.0.1:${port}`, '--dir', data, ...extra], { cwd: runDir, env, stdio: 'ignore' });
  const exited = new Promise((r) => child.on('exit', r));
  try {
    const api = makeApi(`http://127.0.0.1:${port}`);
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`${api.url}/api/health`)).ok) break; } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    api.su = (await api.req('POST', '/api/collections/_superusers/auth-with-password', { identity: SU.email, password: SU.password })).data?.token;
    return await exportSchema(api);
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
}

/** First differing path between two JSON values, for actionable messages. */
function firstDiff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
      const d = firstDiff(a[k], b[k], `${p}.${k}`);
      if (d) return d;
    }
  }
  return `${p}: baseline ${JSON.stringify(a)?.slice(0, 60)} vs now ${JSON.stringify(b)?.slice(0, 60)}`;
}

const runRoot = (stateDir) => { const d = path.join(stateDir, 'run'); fs.mkdirSync(d, { recursive: true }); return d; };
const userCache = () => path.join(os.homedir(), '.cache', 'pocketbase-go');

// ── env ──────────────────────────────────────────────────────────────────────
const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
function goFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'vendor', '.pocketbase-go', 'pb_data'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.go')) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}
function detectEnv() {
  const local = (spawnSync('go', ['env', 'GOVERSION'], { encoding: 'utf8', cwd: PBCHECK, env: { ...process.env, GOTOOLCHAIN: 'local' } }).stdout ?? '').trim().replace(/^go/, '') || null;
  const gomod = path.join(ROOT, 'go.mod');
  const env = { mode: null, pocketbase: null, modulePath: null, goLine: null, toolchain: null, localGo: local, migrationsDir: null, migratecmd: false, jsvm: false, notes: [] };
  if (fs.existsSync(gomod)) {
    const mod = fs.readFileSync(gomod, 'utf8');
    const req = /^\s*(?:require\s+)?((?:github\.com|ganigeorgiev\.com)\/pocketbase\/pocketbase)\s+v([\d.]+)/m.exec(mod);
    if (req) {
      env.mode = 'framework';
      env.modulePath = req[1];
      env.pocketbase = req[2];
      env.goLine = /^go\s+([\d.]+)/m.exec(mod)?.[1] ?? null;
      env.toolchain = /^toolchain\s+go([\d.]+)/m.exec(mod)?.[1] ?? null;
      const code = goFiles(ROOT).filter((f) => !f.endsWith('_test.go')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
      env.migratecmd = /migratecmd\.(Must)?Register\(/.test(code);
      env.migrationsDir = /migratecmd\.Config\{[^}]*\bDir:\s*"([^"]+)"/s.exec(code)?.[1] ?? 'migrations';
      env.jsvm = /jsvm\.(Must)?Register\(/.test(code) || fs.existsSync(path.join(ROOT, 'pb_hooks'));
      if (env.modulePath.startsWith('github.com')) env.notes.push('PocketBase moved to ganigeorgiev.com in v0.41.0; github.com/pocketbase/pocketbase is frozen at v0.40.6 — plan the module path migration (CHANGELOG v0.41.0).');
    }
  }
  if (!env.mode) {
    const bin = path.join(ROOT, 'pocketbase');
    const pinned = fs.existsSync(path.join(ROOT, '.pocketbase-version')) ? fs.readFileSync(path.join(ROOT, '.pocketbase-version'), 'utf8').trim().replace(/^v/, '') : null;
    const fromBin = fs.existsSync(bin) ? /(\d+\.\d+\.\d+)/.exec(spawnSync(bin, ['--version'], { encoding: 'utf8' }).stdout ?? '')?.[1] : null;
    if (pinned || fromBin) {
      env.mode = 'standalone';
      env.pocketbase = pinned ?? fromBin;
      env.migrationsDir = 'pb_migrations';
      env.migratecmd = true;
      env.jsvm = true;
    }
  }
  return env;
}
function loadEnv() {
  const env = readJSON(path.join(STATE_DIR, 'env.json'));
  if (!env) die(2, 'pbg: no env.json — run `pbg env` first.');
  return env;
}

/** Toolchain the analyzers are built with: at least the project's (go/toolchain lines), downloaded by the go command if needed. */
function toolchainFor(env) {
  const want = [env.goLine, env.toolchain].filter(Boolean).map((v) => (v.split('.').length === 2 ? `${v}.0` : v)).sort(cmpVer).pop();
  return want ? { GOTOOLCHAIN: `go${want}+auto`, key: want } : { GOTOOLCHAIN: 'local', key: 'local' };
}
/** Builds (once per toolchain + source hash) pbcheck and the pinned staticcheck. */
function tools(env) {
  const tc = toolchainFor(env);
  const src = sha(['go.mod', 'go.sum', 'main.go', 'checks/checks.go'].map((f) => fs.readFileSync(path.join(PBCHECK, f), 'utf8')).join('\0'));
  const out = path.join(userCache(), 'tools', `${tc.GOTOOLCHAIN.replace(/[^\w.]/g, '_')}-${src}`);
  const bins = { pbcheck: path.join(out, 'pbcheck'), staticcheck: path.join(out, 'staticcheck') };
  if (!fs.existsSync(bins.pbcheck) || !fs.existsSync(bins.staticcheck)) {
    fs.mkdirSync(out, { recursive: true });
    for (const [name, target] of [['pbcheck', '.'], ['staticcheck', 'honnef.co/go/tools/cmd/staticcheck']]) {
      const r = spawnSync('go', ['build', '-o', bins[name], target], { cwd: PBCHECK, encoding: 'utf8', env: { ...process.env, GOTOOLCHAIN: tc.GOTOOLCHAIN, GOFLAGS: '-mod=mod' } });
      if (r.status !== 0) die(2, `pbg: cannot build ${name} with ${tc.GOTOOLCHAIN}:\n${r.stderr}`);
    }
  }
  // A binary built by an older toolchain cannot type-check newer code: verify, never assume.
  const built = /go(\d+\.\d+(?:\.\d+)?)/.exec(spawnSync('go', ['version', bins.pbcheck], { encoding: 'utf8' }).stdout ?? '')?.[1];
  if (tc.key !== 'local' && (!built || cmpVer(built, tc.key) < 0)) die(2, `pbg: pbcheck was built with go${built}, the project needs go${tc.key}`);
  return bins;
}

// ── analysis: pbcheck + staticcheck + gofmt ──────────────────────────────────
const REVIEW_ANALYZERS = new Set(['routeauth']);
/** Findings for `patterns` (go package patterns) inside `dir`; files are relative to dir. */
function analyze(env, dir, patterns) {
  const bins = tools(env);
  // Tools report resolved paths (macOS: /var → /private/var): compare resolved paths only.
  const realDir = fs.realpathSync(dir);
  const relTo = (f) => { let a = f; try { a = fs.realpathSync(f); } catch { /* deleted file */ } return posix(path.relative(realDir, a)); };
  const runEnv = { ...process.env, GOTOOLCHAIN: 'auto' };
  const out = [];
  const pb = spawnSync(bins.pbcheck, ['-json', ...patterns], { cwd: dir, encoding: 'utf8', env: runEnv, maxBuffer: 64 << 20 });
  let parsed = null;
  try { parsed = JSON.parse(pb.stdout || 'null'); } catch { /* compile errors go to stderr */ }
  if (!parsed && pb.status !== 0) out.push({ tool: 'build', rule: 'compile', file: '.', line: 0, col: 0, message: (pb.stderr || 'pbcheck failed').trim().split('\n').slice(0, 5).join(' / '), class: 'gate' });
  for (const byAnalyzer of Object.values(parsed ?? {})) {
    for (const [analyzer, diags] of Object.entries(byAnalyzer)) {
      if (!Array.isArray(diags)) { if (diags?.error) out.push({ tool: 'build', rule: 'compile', file: '.', line: 0, col: 0, message: diags.error, class: 'gate' }); continue; }
      for (const d of diags) {
        const m = /^(.*):(\d+):(\d+)$/.exec(d.posn) ?? [null, d.posn, 0, 0];
        out.push({ tool: 'pbcheck', rule: analyzer, file: relTo(m[1]), line: +m[2], col: +m[3], message: d.message, class: REVIEW_ANALYZERS.has(analyzer) ? 'review' : 'gate' });
      }
    }
  }
  const sc = spawnSync(bins.staticcheck, ['-f', 'json', ...patterns], { cwd: dir, encoding: 'utf8', env: runEnv, maxBuffer: 64 << 20 });
  for (const line of (sc.stdout ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      out.push({ tool: 'staticcheck', rule: d.code, file: relTo(d.location.file), line: d.location.line, col: d.location.column, message: d.message, class: 'gate' });
    } catch { /* not a diagnostic */ }
  }
  const seen = new Set();
  return out.filter((f) => { const k = `${f.rule}|${f.file}|${f.line}|${f.message}`; return !seen.has(k) && seen.add(k); })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}
const findingKey = (f) => `${f.rule}|${f.file}|${f.message}`;
function gofmt(dir, files) {
  if (!files.length) return [];
  const r = spawnSync('gofmt', ['-l', ...files], { cwd: dir, encoding: 'utf8' });
  return (r.stdout ?? '').split('\n').filter(Boolean).map((f) => ({ tool: 'gofmt', rule: 'gofmt', file: posix(f), line: 0, col: 0, message: 'file is not gofmt-formatted (run gofmt -w)', class: 'gate' }));
}
function baselineAnalysis(s, env, task, patterns) {
  s.baselineAnalysis ??= {};
  const key = patterns.join(' ');
  if (!s.baselineAnalysis[key]) {
    s.baselineAnalysis[key] = core.withBaselineWorktree(task, (tmp) => analyze(env, tmp, patterns).filter((f) => f.rule !== 'compile')) ?? [];
    saveState(s);
  }
  return s.baselineAnalysis[key];
}

// ── binaries for the ephemeral instance ──────────────────────────────────────
async function appBinary(env, dir, name) {
  const runDir = runRoot(STATE_DIR);
  if (env.mode === 'framework') return { bin: buildApp(dir, path.join(runDir, name)), runDir, extra: [] };
  const bin = await downloadPocketBase(env.pocketbase, userCache());
  const extra = ['--migrationsDir', path.join(dir, 'pb_migrations')];
  if (fs.existsSync(path.join(dir, 'pb_hooks'))) extra.push('--hooksDir', path.join(dir, 'pb_hooks'));
  return { bin, runDir, extra };
}
function migrationCount(env, dir) {
  const d = path.join(dir, env.migrationsDir ?? 'migrations');
  if (!fs.existsSync(d)) return 0;
  const re = env.mode === 'framework' ? /^\d+_.*(?<!_test)\.go$/ : /^\d+_.*\.js$/;
  return fs.readdirSync(d).filter((f) => re.test(f)).length;
}
/** Baseline schema (fresh instance of the baseline app), computed once per task. */
async function baselineSchema(s, env, task) {
  if (!s.baselineSchema) {
    s.baselineSchema = await core.withBaselineWorktree(task, async (tmp) => {
      try {
        const b = await appBinary(env, tmp, 'baseline-app');
        return await withInstance(b.bin, b.runDir, b.extra, exportSchema);
      } catch { return []; } // a baseline that does not build has no schema
    });
    saveState(s);
  }
  return s.baselineSchema;
}
/** Migration files: edits of already-shipped migrations, count of new ones, reversibility vs the baseline. */
async function migrationGate(s, env, task, app) {
  const dir = env.migrationsDir ?? 'migrations';
  const re = env.mode === 'framework' ? /^\d+_.*(?<!_test)\.go$/ : /^\d+_.*\.js$/;
  const now = fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)) : [];
  const before = (git(['ls-tree', '--name-only', `${task.baseline}:${dir}`]) ?? '').split('\n').filter((f) => re.test(f));
  const edited = before.filter((f) => now.includes(f) && git(['show', `${task.baseline}:${dir}/${f}`]) !== fs.readFileSync(path.join(ROOT, dir, f), 'utf8'))
    .filter((f) => !waived('migration-edit', `${dir}/${f}`));
  const added = now.filter((f) => !before.includes(f));
  const r = await migrateCheck(app.bin, app.runDir, app.extra, added.length, await baselineSchema(s, env, task));
  return [
    { name: 'migration-edit', ok: edited.length === 0, detail: edited.map((f) => `${dir}/${f}: an already-shipped migration was modified (write a new migration instead) — needs a validated \`migration-edit\` waiver`) },
    { name: 'migrations', ok: r.ok, detail: r.detail },
  ];
}
const readSpec = (text) => { try { return JSON.parse(text); } catch (e) { die(1, `pbg: ${ACCESS_FILE} is not valid JSON: ${e.message}`); } };

// ── commands ─────────────────────────────────────────────────────────────────
function cmdDoctor(args) {
  const problems = [];
  if (spawnSync('go', ['version']).status !== 0) problems.push('go not found in PATH');
  if (spawnSync('git', ['--version']).status !== 0) problems.push('git not found');
  if (spawnSync('gofmt', ['-h']).error) problems.push('gofmt not found in PATH');
  for (const [skill, file] of [['fix-root', 'scripts/verify-suite.sh'], ['naming-convention', 'linter/lint.sh']]) {
    if (!core.siblingSkill(skill, file)) problems.push(`required skill missing: ${skill} (${file}) — install it next to pocketbase-go`);
  }
  if (args.includes('--install')) tools(fs.existsSync(path.join(STATE_DIR, 'env.json')) ? loadEnv() : detectEnv());
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) return 2;
  if (!args.includes('--quiet')) console.log('pbg doctor: ok (graph: use codebase-memory if connected; pbg itself does not need it)');
  return 0;
}

function cmdEnv(args = []) {
  const env = detectEnv();
  if (!env.mode) die(1, 'pbg env: no PocketBase found — neither a go.mod requiring (github.com|ganigeorgiev.com)/pocketbase/pocketbase, nor ./pocketbase, nor .pocketbase-version (no default version is assumed).');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJSON(path.join(STATE_DIR, 'env.json'), env);
  if (args.includes('--json')) console.log(JSON.stringify(sortKeys(env), null, 2));
  else console.log(core.formatEnvLine([['pocketbase', env.pocketbase], ['mode', env.mode], ['module', env.modulePath], ['go', env.goLine], ['migrations', env.migrationsDir], ['jsvm', env.jsvm]]) + ` (full: pbg env --json)`);
  return 0;
}

async function cmdPb() {
  const env = loadEnv();
  if (env.mode !== 'standalone') { console.log('pbg pb: framework mode — the binary is built from your code, nothing to download.'); return 0; }
  const bin = await downloadPocketBase(env.pocketbase, userCache());
  console.log(`pbg pb: ${posix(bin)} (sha256 verified against checksums.txt)`);
  return 0;
}

const REFERENCES = { go: 'references/framework.md', hooks: 'references/framework.md', test: 'references/framework.md', migrations: 'references/schema.md', access: 'references/schema.md' };
const CHECKLIST = [
  { id: 'enrich-not-list-hooks', when: 'hooks', text: 'Response shaping (hiding fields, computed values) is done in OnRecordEnrich, not in list/view request hooks (realtime goes through Enrich too).' },
  { id: 'after-success', when: 'hooks', text: 'Side effects that require the record to be persisted (emails, webhooks) run in OnRecordAfter*Success, never in *Execute or before e.Next().' },
  { id: 'no-external-in-tx', when: 'go', text: 'No email, HTTP call or other slow external I/O inside RunInTransaction.' },
  { id: 'no-global-mutex', when: 'hooks', text: 'Hooks take no global mutex (hooks can recurse, e.g. cascade delete).' },
  { id: 'bindbody-fields', when: 'hooks', text: 'Structs passed to e.BindBody have no exported field the client must not set.' },
  { id: 'route-namespace', when: 'hooks', text: 'Custom routes live under /api/<yourapp>/ and use apis.Require* explicitly when not public.' },
  { id: 'migration-snapshot', when: 'migrations', text: 'Schema changes come from `migrate collections` / automigrate in dev and are committed; hand-written migrations only for data/seed.' },
  { id: 'data-migration-idempotent', when: 'migrations', text: 'Data migrations are idempotent and batched for large tables.' },
  { id: 'index-rule-fields', when: 'access', text: 'Fields used in list/view rules and frequent filters/sorts are indexed.' },
  { id: 'apiscenario', when: 'test', text: 'Custom routes and hooks are covered by tests.ApiScenario with ExpectedEvents, using a committed test_pb_data.' },
];
function routeTags(env, files) {
  const tags = new Set();
  for (const f of files) {
    const r = rel(f);
    const text = fs.existsSync(path.join(ROOT, r)) ? fs.readFileSync(path.join(ROOT, r), 'utf8') : '';
    if (r.endsWith('.go')) tags.add('go');
    if (/\.On[A-Z]\w*\(|BindFunc\(|\.Router\.|RequestEvent/.test(text)) tags.add('hooks');
    if (env.migrationsDir && r.startsWith(`${env.migrationsDir}/`)) tags.add('migrations');
    if (r === ACCESS_FILE || /\b(List|View|Create|Update|Delete)Rule\b/.test(text)) tags.add('access');
    if (r.endsWith('_test.go')) tags.add('test');
  }
  return [...tags].sort();
}
// tag -> [file, heading prefix]; no heading = whole file. A renamed heading throws in printSections.
const SECTIONS = {
  go: [['references/framework.md', 'Module and toolchain'], ['references/framework.md', 'Which app to use']],
  hooks: [['references/framework.md', 'Hooks and routing']],
  test: [['references/framework.md', 'Testing a PocketBase Go app']],
  migrations: [['references/schema.md', 'Migrations (Go)']],
  access: [['references/schema.md', 'API rules and the access matrix']],
};
function cmdRoute(args) {
  const full = args.includes('--full');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) die(2, 'pbg route: give the files you will touch.');
  const env = loadEnv();
  const tags = routeTags(env, files);
  const refs = [...new Set(tags.map((t) => REFERENCES[t]).filter(Boolean))].sort();
  console.log(`tags: ${tags.join(' ') || '(none)'}`);
  if (full) {
    console.log('read:');
    for (const r of refs) console.log(`  ${posix(path.join(SKILL, r))}`);
  } else core.printSections(SKILL, tags, SECTIONS);
  const items = CHECKLIST.filter((c) => tags.includes(c.when));
  if (items.length) { console.log('review checklist (not blocking, reported by finish):'); for (const c of items) console.log(`  [${c.id}] ${c.text}`); }
  const s = loadState();
  if (s.task?.open) { s.routeTags = [...new Set([...(s.routeTags ?? []), ...tags])].sort(); saveState(s); }
  return 0;
}

function analyzerDoc(rule) {
  const name = rule.split('/').pop();
  const src = fs.readFileSync(path.join(PBCHECK, 'checks', 'checks.go'), 'utf8');
  return [...src.matchAll(/newAnalyzer\("(\w+)",\s*\n?\s*"([^"]+)"/g)].find((m) => m[1] === name)?.[2];
}

function cmdVerify(args) {
  const only = core.takeFlag(args, '--rule');
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--')).map(rel);
  if (!files.length) die(2, 'pbg verify: give the files to check.');
  const s = loadState();
  const task = openTask(s);
  const env = loadEnv();
  for (const r of files) {
    if (!fs.existsSync(path.join(ROOT, r))) die(2, `pbg verify: ${r} does not exist.`);
    if (!inScope(task, r) && !waived('scope', r)) die(1, `pbg verify: ${r} is outside the task scope (${task.scope.join(' ')}). Widen it with a new \`pbg start\`, or ask the user for a \`scope\` waiver.`);
    if (/(^|\/)pb_hooks\//.test(r)) die(2, `pbg verify: ${r} is a JSVM hook — not covered by pocketbase-go (it would be a false green).`);
    if (!r.endsWith('.go')) die(2, `pbg verify: ${r} is not a Go file (API rules and migrations are checked by \`pbg finish\`).`);
  }
  const patterns = [...new Set(files.map((f) => `./${path.posix.dirname(f)}`))].sort();
  const now = [...analyze(env, ROOT, patterns), ...gofmt(ROOT, files)].filter((f) => files.includes(f.file) || f.rule === 'compile');
  const before = baselineAnalysis(s, env, task, patterns).filter((f) => files.includes(f.file));
  const fresh = core.newFindings(now, before, findingKey);
  const report = { gate: [], review: [], waived: [], preExisting: now.length - fresh.length };
  for (const f of fresh) {
    if (f.class === 'review') report.review.push(f);
    else if (waived(f.rule, f.file)) report.waived.push(f);
    else report.gate.push(f);
  }
  const perFile = {};
  for (const r of files) {
    perFile[r] = { hash: fileHash(r), ok: !report.gate.some((f) => f.file === r || f.rule === 'compile'), review: report.review.filter((f) => f.file === r), preExisting: now.filter((f) => f.file === r).length - fresh.filter((f) => f.file === r).length };
  }
  const ok = report.gate.length === 0;
  const passes = core.recordVerify(s, perFile, ok);
  if (json) console.log(JSON.stringify(sortKeys({ ok, passes, ...report }), null, 2));
  else {
    const ruleOf = (f) => `${f.tool}/${f.rule}`;
    if (only) {
      const known = [...report.gate, ...report.waived, ...report.review].map(ruleOf);
      if (!known.includes(only)) die(2, `pbg verify: no finding for rule \`${only}\`. Rules with findings: ${[...new Set(known)].join(', ') || '(none)'}${known.length ? `. Closest: ${core.suggestOptions(only, known).join(', ')}` : ''}.`);
    }
    core.printFindings(report, { cli: 'pbg', files, rule: only, ruleOf, whereOf: (f) => `${f.file}:${f.line}:${f.col}`, fixOf: analyzerDoc });
    if (report.preExisting) console.log(`(${report.preExisting} pre-existing finding(s) in these files: not blocking, listed by \`pbg legacy-report\`)`);
    console.log(`verify: ${ok ? 'PASS' : `FAIL (${report.gate.length} new gate finding(s), pass ${passes}/${core.MAX_PASSES})`}`);
  }
  return ok ? 0 : 1;
}

async function cmdSchema() {
  const env = loadEnv();
  const { bin, runDir, extra } = await appBinary(env, ROOT, 'app');
  const schema = await withInstance(bin, runDir, extra, exportSchema);
  writeJSON(path.join(STATE_DIR, 'schema.json'), schema);
  const lint = lintSchema(schema);
  for (const f of lint) console.log(`${f.class === 'gate' ? 'GATE  ' : 'REVIEW'}  ${f.rule}  ${f.message}`);
  console.log(`schema: ${schema.length} collection(s) → ${posix(path.relative(process.cwd(), path.join(STATE_DIR, 'schema.json')))}`);
  return lint.some((f) => f.class === 'gate' && !waived(f.rule, f.target)) ? 1 : 0;
}

async function cmdAccess(args) {
  const env = loadEnv();
  const { bin, runDir, extra } = await appBinary(env, ROOT, 'app');
  const specPath = path.join(ROOT, ACCESS_FILE);
  const spec = fs.existsSync(specPath) ? readSpec(fs.readFileSync(specPath, 'utf8')) : { auth: 'users', collections: {} };
  return withInstance(bin, runDir, extra, async (api) => {
    const schema = await exportSchema(api);
    const gaps = accessCoverage(schema, spec);
    if (args.includes('--init')) {
      // Skeleton only: expectations are written by a human, never measured (a measured matrix would test nothing).
      for (const c of schema.filter((x) => !x.system && !x.name.startsWith('_'))) {
        if (spec.collections[c.name] || ['list', 'view', 'create', 'update', 'delete'].every((a) => c[`${a}Rule`] == null)) continue;
        const q = { anon: '?', owner: '?', other: '?' };
        spec.collections[c.name] = { seed: {}, create: {}, update: {}, expect: Object.fromEntries((c.type === 'view' ? ['list', 'view'] : ['list', 'view', 'create', 'update', 'delete']).map((a) => [a, { ...q }])) };
      }
      fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
      console.log(`pbg access --init: skeleton written to ${ACCESS_FILE} — replace every "?" with the intended status (list: "has" | "empty" | status).`);
      return 0;
    }
    const placeholders = JSON.stringify(spec).includes('"?"') ? [`${ACCESS_FILE} still contains "?" placeholders`] : [];
    for (const g of [...gaps, ...placeholders]) console.log(`GAP     ${g}`);
    if (gaps.length || placeholders.length) { console.log('access: FAIL (coverage — D4: every collection with non-null rules is specified)'); return 1; }
    const { cases, mismatches } = await runAccess(api, schema, spec);
    for (const m of mismatches) console.log(`MISMATCH ${m.case}: expected ${m.want}, got ${m.got}`);
    console.log(`access: ${mismatches.length ? 'FAIL' : 'PASS'} (${cases} case(s), ${mismatches.length} mismatch(es))`);
    const s = loadState();
    if (s.task?.open) { s.access = { ok: !mismatches.length, tree: core.scopeTreeHash(s.task), cases, mismatches }; saveState(s); }
    return mismatches.length ? 1 : 0;
  });
}

async function cmdMigrateCheck() {
  const env = loadEnv();
  const app = await appBinary(env, ROOT, 'app');
  const s = loadState();
  if (s.task?.open) {
    const checks = await migrationGate(s, env, s.task, app);
    for (const c of checks) for (const d of c.detail.length ? c.detail : ['ok']) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${d}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  const r = await migrateCheck(app.bin, app.runDir, app.extra, migrationCount(env, ROOT));
  for (const d of r.detail) console.log(`${r.ok ? '✓' : '✗'} ${d}`);
  console.log('(no open task: round trip only — inside a task, the state after reverting the new migrations must equal the baseline schema)');
  return r.ok ? 0 : 1;
}

async function cmdLegacyReport() {
  const env = loadEnv();
  const findings = analyze(env, ROOT, ['./...']);
  const rows = new Map();
  for (const f of findings) { const k = `${f.file}\t${f.tool}/${f.rule}`; rows.set(k, (rows.get(k) ?? 0) + 1); }
  const list = [...rows].map(([k, n]) => { const [file, rule] = k.split('\t'); return { file, rule, count: n }; })
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
  const { bin, runDir, extra } = await appBinary(env, ROOT, 'app');
  const { lint, gaps } = await withInstance(bin, runDir, extra, async (api) => {
    const schema = await exportSchema(api);
    const spec = fs.existsSync(path.join(ROOT, ACCESS_FILE)) ? readSpec(fs.readFileSync(path.join(ROOT, ACCESS_FILE), 'utf8')) : { collections: {} };
    return { lint: lintSchema(schema), gaps: accessCoverage(schema, spec) };
  });
  writeJSON(path.join(STATE_DIR, 'legacy-report.json'), { code: list, schema: lint, accessGaps: gaps, notes: env.notes });
  for (const r of list) console.log(`${String(r.count).padStart(5)}  ${r.file}  ${r.rule}`);
  for (const f of lint) console.log(`schema  ${f.rule}  ${f.message}`);
  for (const g of gaps) console.log(`access  ${g}`);
  for (const n of env.notes) console.log(`note    ${n}`);
  console.log(`legacy-report: ${findings.length} code finding(s), ${lint.length} schema finding(s), ${gaps.length} access gap(s) — the work list (nothing filtered).`);
  return 0;
}

// ── finish ───────────────────────────────────────────────────────────────────
async function cmdFinish() {
  const s = loadState();
  const task = openTask(s);
  const env = loadEnv();
  const checks = core.commonChecks(s, task, { verifiable: (f) => f.endsWith('.go'), namable: /\.go$/ });
  const push = (name, ok, detail = []) => checks.push({ name, ok, detail });
  const changed = core.changedFiles(task);

  // JSVM hooks are outside this skill: a change there is unverified.
  const jsvm = changed.filter((f) => /(^|\/)pb_hooks\//.test(f) && !waived('jsvm', f));
  push('jsvm', jsvm.length === 0, jsvm.map((f) => `${f}: JSVM hook not covered by pocketbase-go (unverified) — needs a validated \`jsvm\` waiver`));

  // Whole-project analysis vs baseline, gofmt on changed files.
  const now = analyze(env, ROOT, ['./...']);
  const compile = now.filter((f) => f.rule === 'compile');
  push('build', compile.length === 0, compile.map((f) => f.message));
  const fresh = core.newFindings(now.filter((f) => f.rule !== 'compile'), baselineAnalysis(s, env, task, ['./...']), findingKey);
  const gate = fresh.filter((f) => f.class === 'gate' && !waived(f.rule, f.file));
  push('analysis', gate.length === 0, gate.map((f) => `${f.file}:${f.line} ${f.tool}/${f.rule} ${f.message}`));
  const fmt = gofmt(ROOT, changed.filter((f) => f.endsWith('.go') && fs.existsSync(path.join(ROOT, f))));
  push('gofmt', fmt.length === 0, fmt.map((f) => `${f.file}: ${f.message}`));

  // Schema (new findings vs baseline), access matrix (D4), migrations.
  let schema = null;
  const review = fresh.filter((f) => f.class === 'review');
  try {
    const app = await appBinary(env, ROOT, 'app');
    const { bin, runDir, extra } = app;
    const spec = fs.existsSync(path.join(ROOT, ACCESS_FILE)) ? readSpec(fs.readFileSync(path.join(ROOT, ACCESS_FILE), 'utf8')) : { auth: 'users', collections: {} };
    await withInstance(bin, runDir, extra, async (api) => {
      schema = await exportSchema(api);
      const gaps = accessCoverage(schema, spec);
      const placeholders = JSON.stringify(spec).includes('"?"') ? [`${ACCESS_FILE} still contains "?" placeholders`] : [];
      if (gaps.length || placeholders.length) push('access', false, [...gaps, ...placeholders]);
      else {
        const { cases, mismatches } = await runAccess(api, schema, spec);
        push('access', mismatches.length === 0, mismatches.length ? mismatches.map((m) => `${m.case}: expected ${m.want}, got ${m.got}`) : [`${cases} case(s) pass`]);
      }
    });
    await baselineSchema(s, env, task);
    const key = (f) => `${f.rule}|${f.message}`;
    const schemaNew = core.newFindings(lintSchema(schema), lintSchema(s.baselineSchema ?? []), key);
    const schemaGate = schemaNew.filter((f) => f.class === 'gate' && !waived(f.rule, f.target));
    push('schema', schemaGate.length === 0, schemaGate.map((f) => `${f.rule}: ${f.message}`));
    review.push(...schemaNew.filter((f) => f.class === 'review').map((f) => ({ file: ACCESS_FILE, line: 0, tool: 'schema', rule: f.rule, message: f.message })));
    checks.push(...await migrationGate(s, env, task, app));
  } catch (e) {
    push('instance', false, [`ephemeral PocketBase failed — UNVERIFIED: ${String(e.message).split('\n').slice(0, 4).join(' / ')}`]);
  }

  // The access matrix is the spec: changing an existing expectation needs the user's waiver.
  const oldSpec = git(['show', `${task.baseline}:${ACCESS_FILE}`]);
  if (oldSpec && fs.existsSync(path.join(ROOT, ACCESS_FILE))) {
    const before = readSpec(oldSpec).collections ?? {};
    const after = readSpec(fs.readFileSync(path.join(ROOT, ACCESS_FILE), 'utf8')).collections ?? {};
    const changedEntries = Object.keys(before).filter((c) => JSON.stringify(before[c]) !== JSON.stringify(after[c]) && !waived('access-spec', c));
    push('access-spec', changedEntries.length === 0, changedEntries.map((c) => `${ACCESS_FILE}: expectations of existing collection "${c}" changed — needs a validated \`access-spec\` waiver`));
  }

  const items = CHECKLIST.filter((c) => (s.routeTags ?? []).includes(c.when));
  return core.finalize(s, task, checks, [
    { title: 'Review findings (not blocking)', lines: [
      ...review.map((f) => `- \`${f.file}:${f.line}\` ${f.tool}/${f.rule}: ${f.message}`).sort(),
      ...(items.length ? ['', '### Checklist', '', ...items.map((c) => `- [ ] (${c.id}) ${c.text}`)] : []),
    ] },
    { title: 'Environment notes', lines: env.notes.length ? env.notes.map((n) => `- ${n}`) : ['none'] },
    { title: 'Pre-existing findings in touched files (legacy work list)', lines: [
      ...Object.entries(s.verify.files).filter(([, v]) => v.preExisting).sort().map(([f, v]) => `- \`${f}\`: ${v.preExisting}`),
      '', 'Full list: `pbg legacy-report`.',
    ] },
  ]);
}

// ── references generated from the analyzers ─────────────────────────────────
function cmdGenReferences(args) {
  const src = fs.readFileSync(path.join(PBCHECK, 'checks', 'checks.go'), 'utf8');
  const analyzers = [...src.matchAll(/var (\w+) = newAnalyzer\("(\w+)",\s*\n?\s*"([^"]+)"/g)].map((m) => ({ name: m[2], doc: m[3] }));
  const lines = [
    '# Rule catalog (generated — `pbg gen-references`, do not edit)', '',
    'Gate findings block `pbg verify`/`pbg finish` when NEW against the git baseline. Review findings and the checklist are reported, never blocking.', '',
    '## pbcheck analyzers (Go, `tooling/pbcheck/checks`)', '', '| analyzer | class | rule |', '|---|---|---|',
    ...analyzers.map((a) => `| \`${a.name}\` | ${REVIEW_ANALYZERS.has(a.name) ? 'review' : 'gate'} | ${a.doc} |`), '',
    '## Other code gates', '',
    '- `staticcheck` (pinned in `tooling/pbcheck/go.mod`, default checks) — every finding is a gate.',
    '- `gofmt -l` on changed files.',
    '- The project must build (`compile`).', '',
    '## Schema and runtime gates (ephemeral PocketBase)', '',
    '| check | class | rule |', '|---|---|---|',
    '| `rules-public-write` | gate | create/update/delete rule `""` (anyone, even unauthenticated) |',
    '| `rules-collection-any` | gate | `@collection.*` compared with a single-value operator instead of `?=`, `?~`… |',
    '| `rules-public-read` | review | list/view rule `""` |',
    '| `rules-owner-change` | review | update rule does not constrain the relation to the auth collection |',
    '| `access` | gate | every case of `pb-access.json` matches; every collection with non-null rules is specified (anon/owner/other × actions, `spoofCreate`/`ownerChange` probes for owned collections) |',
    '| `access-spec` | gate | an existing expectation changed without a validated waiver |',
    '| `migrations` | gate | `migrate up` → `down N` → `up` gives an identical schema |', '',
    'Measured on PocketBase v0.42.3: denied list → 200 with the record absent, denied view/update/delete → 404, denied create → 400, `null` rule → 403, successful delete → 204, unknown token → 401.', '',
    '## Review checklist', '', '| id | applies to | check |', '|---|---|---|',
    ...CHECKLIST.map((c) => `| ${c.id} | ${c.when} | ${c.text} |`), '',
  ].join('\n');
  const out = path.join(SKILL, 'references', 'rules.md');
  if (args.includes('--check')) {
    const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === lines;
    console.log(same ? 'references/rules.md up to date' : 'references/rules.md is stale — run pbg gen-references');
    return same ? 0 : 1;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines);
  console.log(`wrote ${posix(out)}`);
  return 0;
}

// ── main ─────────────────────────────────────────────────────────────────────
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

const [command, ...args] = process.argv.slice(2);
const commands = {
  doctor: cmdDoctor, env: cmdEnv, pb: cmdPb, start: cmdStart, route: cmdRoute, verify: cmdVerify,
  step: core.cmdStep, waive: core.cmdWaive, schema: cmdSchema, access: cmdAccess, 'migrate-check': cmdMigrateCheck,
  'legacy-report': cmdLegacyReport, finish: cmdFinish,
  hook: (a) => core.cmdHook(a, { script: fileURLToPath(import.meta.url), matches: (f) => f.endsWith('.go') }),
  'gen-references': cmdGenReferences,
};
if (!commands[command]) die(2, 'usage: pbg doctor|env|pb|start|route|verify|step|waive|schema|access|migrate-check|legacy-report|finish|hook|gen-references');
try {
  process.exitCode = await commands[command](args);
} catch (e) {
  // An instance that cannot boot, a build that fails…: the check did not run, so it is not a pass.
  console.error(`pbg ${command}: UNVERIFIED — ${String(e.message).split('\n').slice(0, 8).join('\n')}`);
  process.exitCode = 1;
}
