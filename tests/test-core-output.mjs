// Conservation and bound of strict-core's compact findings output. Run: node tests/test-core-output.mjs
import assert from 'node:assert/strict';
import { printFindings, suggestOptions } from '../skills/strict-core/lib/core.mjs';

const mk = (rule, n) => Array.from({ length: n }, (_, i) => ({ rule, file: `a${i}.svelte`, line: i + 1, column: 1, message: 'm' }));
const report = { gate: [...mk('derived-with-function', 40), ...mk('kit-typed-load', 5)], waived: [], review: [] };
const run = (opts) => { const out = []; printFindings(report, { cli: 'svs', files: ['a.svelte'], ruleOf: (f) => f.rule, whereOf: (f) => `${f.file}:${f.line}`, log: (l) => out.push(l), ...opts }); return out; };

const capped = run({ fixOf: (r) => `fix-${r}` });
const findingLines = capped.filter((l) => l.startsWith('  ')).length;
assert.equal(findingLines, 20, 'cap respected');
assert.match(capped.at(-1), /^more: 25 hidden .* --rule derived-with-function$/);
assert.equal(capped.filter((l) => l.includes('fix-derived-with-function')).length, 1, 'fix once per rule');
assert.equal(findingLines + 25, report.gate.length, 'shown + hidden = total');

const full = run({ rule: 'derived-with-function' });
assert.equal(full.filter((l) => l.startsWith('  ')).length, 40, '--rule shows the rule in full');
assert.ok(!full.some((l) => l.startsWith('more:')));

assert.equal(suggestOptions('derivd-with-function', ['kit-typed-load', 'derived-with-function'])[0], 'derived-with-function');
console.log('core output: ok');

