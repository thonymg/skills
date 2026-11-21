// strict-core — the gate machinery shared by svelte-strict (svs) and
// pocketbase-go (pbg). A tool supplies its analysis; the core owns everything
// that must behave identically across tools: the state file (written only by
// the CLI), the git baseline, the scope, waivers validated by the user, recorded
// steps bound to the current tree, the common finish checks and the report.
//
// Exit codes everywhere: 0 pass · 1 fail or unverified · 2 usage/environment ·
// 3 only pre-existing suite failures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
export const posix = (p) => p.split(path.sep).join('/');
export const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
export const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
export const writeJSON = (p, v) => fs.writeFileSync(p, `${JSON.stringify(sortKeys(v), null, 2)}\n`);
export const die = (code, msg) => { if (msg) console.error(msg); process.exit(code); };

/** Minimal glob → RegExp (`**`, `*`, `?`). */
export function globRe(glob) {
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

/**
 * @param {object} o
 * @param {string} o.cli            command name shown in messages (`svs`, `pbg`)
 * @param {string} o.tool           report title (`svelte-strict`, `pocketbase-go`)
 * @param {string} o.stateDirName   `.svelte-strict`, `.pocketbase-go`
 * @param {string} o.rootMarker     file that marks the project root (`package.json`, `go.mod`)
 * @param {string} o.skillDir       absolute dir of the calling skill (for sibling lookup)
 * @param {string[]} o.kinds        allowed `--kind` values
 * @param {RegExp} o.protectedRe    config files whose change needs a `config` waiver
 * @param {RegExp} o.suppressionRe  lint/type suppressions whose addition needs a `suppression` waiver
 * @param {{re: RegExp, files: RegExp}|null} o.loosen  e.g. `any` in TS — needs an `any` waiver
 * @param {string[]} [o.starWaivers] rules for which `*` is an allowed waiver target
 * @param {object} [o.stateExtra]   tool-specific default fields of state.json
 */
export function createCore(o) {
  const MAX_PASSES = 3;
  const flag = process.argv.indexOf('--project');
  const start = path.resolve(flag > 0 ? process.argv.splice(flag, 2)[1] : process.cwd());
  let ROOT = start;
  for (let d = start; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, o.rootMarker))) { ROOT = d; break; }
    if (path.dirname(d) === d) break;
  }
  const STATE_DIR = path.join(ROOT, o.stateDirName);
  const STATE = path.join(STATE_DIR, 'state.json');
  const WAIVERS = path.join(STATE_DIR, 'waivers.md');
  const rel = (p) => posix(path.relative(ROOT, path.resolve(ROOT, p)));
  const fileHash = (r) => { const p = path.join(ROOT, r); return fs.existsSync(p) ? sha(fs.readFileSync(p)) : 'deleted'; };
  const git = (args, opts = {}) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
    return r.status === 0 ? r.stdout : null;
  };
  const inGit = () => git(['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';

  const fresh = () => ({ task: null, steps: {}, verify: { passes: 0, files: {} }, routeTags: [], ...structuredClone(o.stateExtra ?? {}) });
  const loadState = () => ({ ...fresh(), ...readJSON(STATE, {}) });
  const saveState = (s) => { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, '.gitignore'), '*\n'); writeJSON(STATE, s); };
  const openTask = (s) => { if (!s.task?.open) die(2, `${o.cli}: no open task — run \`${o.cli} start <glob…>\` first.`); return s.task; };
  const inScope = (task, r) => task.scope.some((g) => globRe(g).test(r));

  // .<tool>/waivers.md: | rule | target | reason | validated |. The CLI writes `non`; only the user writes `oui`.
  const waivers = () => {
    if (!fs.existsSync(WAIVERS)) return [];
    return fs.readFileSync(WAIVERS, 'utf8').split('\n')
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length === 4 && c[0] !== 'rule' && !/^-+$/.test(c[0]))
      .map(([rule, target, reason, validated]) => ({ rule, target, reason, validated: validated.toLowerCase() === 'oui' }));
  };
  const waived = (rule, target) => waivers().some((w) => w.validated && w.rule === rule && (w.target === target || w.target === '*'));

  function changedFiles(task) {
    const tracked = (git(['diff', '--name-only', task.baseline]) ?? '').split('\n');
    const untracked = (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n');
    return [...new Set([...tracked, ...untracked])].filter((f) => f && !f.startsWith(`${o.stateDirName}/`)).sort();
  }
  const scopeTreeHash = (task) => sha(changedFiles(task).map((f) => `${f}:${fileHash(f)}`).join('\n'));

  /** Lines this task added to a file (whole file if untracked). */
  function addedLines(task, f) {
    if (!fs.existsSync(path.join(ROOT, f))) return [];
    if (git(['ls-files', '--error-unmatch', f], { stdio: 'pipe' }) == null) return fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    return (git(['diff', '-U0', task.baseline, '--', f]) ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  }

  /** Runs fn(dir) in a throwaway git worktree checked out at the baseline (fn may be async). */
  function withBaselineWorktree(task, fn, links = []) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${o.cli}-baseline-`));
    const cleanup = () => { git(['worktree', 'remove', '--force', tmp]); fs.rmSync(tmp, { recursive: true, force: true }); };
    let pending = false;
    try {
      if (git(['worktree', 'add', '--detach', tmp, task.baseline], { stdio: 'pipe' }) == null) return null;
      for (const l of links) if (fs.existsSync(path.join(ROOT, l))) fs.symlinkSync(path.join(ROOT, l), path.join(tmp, l), 'dir');
      const res = fn(tmp);
      if (res && typeof res.then === 'function') { pending = true; return res.finally(cleanup); }
      return res;
    } finally {
      if (!pending) cleanup();
    }
  }

  const siblingSkill = (skill, file) => { const p = path.join(o.skillDir, '..', skill, file); return fs.existsSync(p) ? p : null; };

  // ── commands shared verbatim by every tool ─────────────────────────────────
  function cmdStart(args, { requireEnv = true } = {}) {
    const kindAt = args.indexOf('--kind');
    const kind = kindAt >= 0 ? args.splice(kindAt, 2)[1] : 'feature';
    const scope = args.filter((a) => !a.startsWith('--'));
    const s = loadState();
    if (args.includes('--resume')) {
      openTask(s);
      s.task.resumes = (s.task.resumes ?? 0) + 1;
      s.verify.passes = 0;
      saveState(s);
      console.log(`${o.cli}: task resumed (resume #${s.task.resumes}, recorded in the report).`);
      return 0;
    }
    if (!o.kinds.includes(kind)) die(2, `${o.cli} start: --kind must be one of ${o.kinds.join(', ')}`);
    if (!scope.length) die(2, `${o.cli} start: give the scope as globs, e.g. \`${o.cli} start "src/feature/**"\``);
    if (requireEnv && !fs.existsSync(path.join(STATE_DIR, 'env.json'))) die(2, `${o.cli} start: run \`${o.cli} env\` first.`);
    if (!inGit()) die(2, `${o.cli} start: not a git repository — the baseline needs git.`);
    const baseline = git(['stash', 'create'])?.trim() || git(['rev-parse', 'HEAD'])?.trim();
    if (!baseline) die(2, `${o.cli} start: no commit to use as baseline (commit once first).`);
    saveState({ ...fresh(), task: { open: true, kind, scope, baseline, resumes: 0 } });
    console.log(`${o.cli}: task started — kind=${kind}, baseline=${baseline.slice(0, 12)}, scope=${scope.join(' ')}`);
    return 0;
  }

  function cmdStep(args) {
    const sep = args.indexOf('--');
    const name = args[0];
    if (!name || sep < 0 || sep === args.length - 1) die(2, `${o.cli} step: usage \`${o.cli} step <name> -- <cmd…>\` (names: test-first, suite, or any).`);
    const s = loadState();
    const task = openTask(s);
    const [cmd, ...rest] = args.slice(sep + 1);
    const r = spawnSync(cmd, rest, { cwd: ROOT, stdio: 'inherit' });
    const exit = r.status ?? 1;
    s.steps[name] = { exit, cmd: [cmd, ...rest].join(' '), tree: scopeTreeHash(task) };
    saveState(s);
    console.log(`${o.cli} step ${name}: exit ${exit} (recorded)`);
    return exit;
  }

  function cmdWaive(args) {
    const [rule, target, ...reason] = args;
    if (!rule || !target || !reason.length) die(2, `${o.cli} waive: usage \`${o.cli} waive <rule> <file|*> <reason…>\``);
    if (target === '*' && !(o.starWaivers ?? []).includes(rule)) die(2, `${o.cli} waive: \`*\` is only allowed for ${(o.starWaivers ?? []).join(' / ') || 'no rule'}.`);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (!fs.existsSync(WAIVERS)) fs.writeFileSync(WAIVERS, '# Waivers — only the user may change `non` to `oui`\n\n| rule | target | reason | validated |\n|---|---|---|---|\n');
    fs.appendFileSync(WAIVERS, `| ${rule} | ${target} | ${reason.join(' ').replace(/\|/g, '/')} | non |\n`);
    console.log(`${o.cli}: waiver proposed (validated: non) in ${posix(path.relative(process.cwd(), WAIVERS))}. Ask the user to review it and set \`oui\`.`);
    return 0;
  }

  /** Bookkeeping after a verify pass: per-file record + the 3-pass limit. */
  function recordVerify(s, perFile, ok) {
    Object.assign(s.verify.files, perFile);
    s.verify.passes = ok ? 0 : s.verify.passes + 1;
    saveState(s);
    if (!ok && s.verify.passes >= MAX_PASSES) {
      console.error(`STOP: ${MAX_PASSES} failing passes. Do not keep patching: ask the user (fix strategy, or a waiver they validate), then \`${o.cli} start --resume\`.`);
    }
    return s.verify.passes;
  }

  /** Findings now vs baseline: new = per-key count increase (line numbers shift, keys do not). */
  function newFindings(now, before, key) {
    const count = (list) => list.reduce((m, f) => m.set(key(f), (m.get(key(f)) ?? 0) + 1), new Map());
    const a = count(now), b = count(before);
    return now.filter((f) => (a.get(key(f)) ?? 0) > (b.get(key(f)) ?? 0));
  }

  // ── finish: checks every tool shares ───────────────────────────────────────
  /**
   * @param {object} p
   * @param {(f:string)=>boolean} p.verifiable    files that must have a passing verify on current content
   * @param {(f:string)=>boolean} [p.toolWritten] files written by a recorded tool run, still untouched
   * @param {RegExp} p.namable                     files the naming linter must check
   */
  function commonChecks(s, task, p) {
    const checks = [];
    const check = (name, ok, detail = []) => checks.push({ name, ok, detail });
    const changed = changedFiles(task);
    const toolWritten = p.toolWritten ?? (() => false);

    const outOfScope = changed.filter((f) => !inScope(task, f) && !toolWritten(f) && !waived('scope', f));
    check('scope', outOfScope.length === 0, outOfScope.map((f) => `${f} changed outside the scope (${o.cli} start globs, or a validated \`scope\` waiver)`));

    const unverified = changed.filter((f) => p.verifiable(f) && fs.existsSync(path.join(ROOT, f)) && !toolWritten(f))
      .filter((f) => s.verify.files[f]?.hash !== fileHash(f) || !s.verify.files[f]?.ok);
    check('verified', unverified.length === 0, unverified.map((f) => `${f}: ${s.verify.files[f] ? (s.verify.files[f].ok ? 'edited after verify' : 'last verify failed') : 'never verified'} — run ${o.cli} verify ${f}`));

    const calib = [];
    for (const f of changed) {
      const added = addedLines(task, f);
      if (added.some((l) => o.suppressionRe.test(l)) && !waived('suppression', f)) calib.push(`${f}: adds a lint/type suppression (needs a validated \`suppression\` waiver)`);
      if (o.loosen && o.loosen.files.test(f) && added.some((l) => o.loosen.re.test(l)) && !waived('any', f)) calib.push(`${f}: adds \`any\` (needs a validated \`any\` waiver)`);
      if (o.protectedRe.test(f) && !toolWritten(f) && !waived('config', f)) calib.push(`${f}: protected config changed (needs a validated \`config\` waiver)`);
    }
    check('anti-calibration', calib.length === 0, calib);

    const lint = siblingSkill('naming-convention', 'linter/lint.sh');
    const namable = changed.filter((f) => p.namable.test(f) && fs.existsSync(path.join(ROOT, f)));
    if (!lint) check('naming', false, [`naming-convention skill not installed (${o.cli} doctor)`]);
    else if (namable.length) {
      const r = spawnSync('bash', [lint, ...namable, '--since', task.baseline, '--no-color'], { cwd: ROOT, encoding: 'utf8' });
      check('naming', r.status === 0, r.status === 0 ? [] : (r.stdout + r.stderr).split('\n').filter((l) => /❌|✗|ERROR|error/i.test(l)).slice(0, 30));
    } else check('naming', true);

    const tree = scopeTreeHash(task);
    const step = (name, okExits) => {
      const st = s.steps[name];
      if (!st) return `${name}: never run (${o.cli} step ${name} -- …)`;
      if (st.tree !== tree) return `${name}: run on an older version of the changes — run it again`;
      if (!okExits.includes(st.exit)) return `${name}: exit ${st.exit}`;
      return null;
    };
    const stepProblems = [step('suite', [0, 3])];
    if (['bug', 'feature'].includes(task.kind)) stepProblems.push(step('test-first', [0]));
    check('steps', stepProblems.every((x) => !x), stepProblems.filter(Boolean));
    return checks;
  }

  /** Last check, report, close. `sections` = [{title, lines}] tool-specific report parts. */
  function finalize(s, task, checks, sections = []) {
    const pending = waivers().filter((w) => !w.validated);
    checks.push({ name: 'waivers', ok: pending.length === 0, detail: pending.map((w) => `${w.rule} ${w.target}: not validated by the user`) });
    const ok = checks.every((c) => c.ok);
    const suite3 = s.steps.suite?.exit === 3;
    const w = waivers();
    const lines = [
      `# ${o.tool} report`, '',
      `- result: **${ok ? 'PASS' : 'FAIL'}**`,
      `- kind: ${task.kind} · baseline: \`${task.baseline.slice(0, 12)}\` · resumes after the ${MAX_PASSES}-pass limit: ${task.resumes ?? 0}`,
      `- scope: ${task.scope.map((g) => `\`${g}\``).join(' ')}`, '',
      '## Gates', '', '| gate | result | detail |', '|---|---|---|',
      ...checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : 'FAIL'} | ${c.detail.join('<br>').replace(/\|/g, '/')} |`), '',
      '## Steps', '', '| step | exit | command |', '|---|---|---|',
      ...Object.entries(s.steps).sort().map(([n, st]) => `| ${n} | ${st.exit} | \`${st.cmd.replace(/\|/g, '/')}\` |`), '',
      '## Waivers', '',
      ...(w.length ? ['| rule | target | reason | validated |', '|---|---|---|---|', ...w.map((x) => `| ${x.rule} | ${x.target} | ${x.reason} | ${x.validated ? 'oui' : 'non'} |`)] : ['none']), '',
      ...sections.flatMap((sec) => [`## ${sec.title}`, '', ...sec.lines, '']),
    ];
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATE_DIR, 'report.md'), lines.join('\n'));
    for (const c of checks) {
      console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
      for (const d of c.detail) console.log(`    ${d}`);
    }
    if (ok) s.task.open = false;
    saveState(s);
    console.log(`finish: ${ok ? (suite3 ? 'PASS with pre-existing suite failures (exit 3)' : 'PASS') : 'FAIL'} — report: ${posix(path.relative(process.cwd(), path.join(STATE_DIR, 'report.md')))}`);
    return ok ? (suite3 ? 3 : 0) : 1;
  }

  /** Optional Claude Code hooks. `matches(file)` = files PostToolUse should verify. */
  function cmdHook(args, { script, matches }) {
    const input = readJSON('/dev/stdin', {});
    const s = loadState();
    if (!s.task?.open) return 0;
    if (args[0] === 'post-tool-use') {
      const f = input.tool_input?.file_path;
      if (!f || !matches(f) || !inScope(s.task, rel(f))) return 0;
      const r = spawnSync(process.execPath, [script, 'verify', f, '--project', ROOT], { encoding: 'utf8' });
      if (r.status !== 0) { process.stderr.write(r.stdout + r.stderr); return 2; }
      return 0;
    }
    if (args[0] === 'stop') {
      if (input.stop_hook_active) return 0; // blocked once already: let the user read report.md
      const r = spawnSync(process.execPath, [script, 'finish', '--project', ROOT], { encoding: 'utf8' });
      if (r.status !== 0 && r.status !== 3) { process.stderr.write(`${o.tool} task still open — finish fails:\n${r.stdout}`); return 2; }
      return 0;
    }
    die(2, `${o.cli} hook: post-tool-use | stop`);
  }

  return {
    ROOT, STATE_DIR, MAX_PASSES, rel, fileHash, git, inGit,
    loadState, saveState, openTask, inScope, waivers, waived,
    changedFiles, scopeTreeHash, addedLines, withBaselineWorktree, siblingSkill,
    cmdStart, cmdStep, cmdWaive, cmdHook, recordVerify, newFindings, commonChecks, finalize,
  };
}
