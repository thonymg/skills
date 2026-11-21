// RuleTester suite: every svelte-strict rule has >= 1 valid (good) and >= 1
// invalid (bad) case — enforced by the last test. Run: node --test tooling/plugin
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';
import { rules } from './index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// Fake shadcn ui folder on disk (barrel shape is read from it).
const UI = fs.mkdtempSync(path.join(os.tmpdir(), 'svs-ui-'));
for (const [folder, index] of Object.entries({
  dialog: "export { Root, Content, Title } from './x';", button: "export { Button, buttonVariants } from './x';",
  sidebar: "export { Root, useSidebar } from './x';",
})) { fs.mkdirSync(path.join(UI, folder)); fs.writeFileSync(path.join(UI, folder, 'index.ts'), index); }

const KIT = { svelteStrict: { kit: '2.50.0', kitMajor: 2 } };
const SHADCN = { svelteStrict: { kit: '2.50.0', kitMajor: 2, shadcn: { uiAlias: '$lib/components/ui', uiDir: UI, iconLibrary: 'lucide' } } };
const C = '/p/src/routes/C.svelte';
const sv = (code, extra = {}) => ({ code, filename: C, ...extra });
const tsf = (code, filename, extra = {}) => ({ code, filename, languageOptions: { parser: tseslint.parser }, ...extra });
const err = (n = 1) => ({ errors: n });
const imp = `<script>import * as Dialog from '$lib/components/ui/dialog'; import * as Select from '$lib/components/ui/select'; import { Button } from '$lib/components/ui/button'; import * as Tabs from '$lib/components/ui/tabs'; import * as Avatar from '$lib/components/ui/avatar'; import * as Field from '$lib/components/ui/field'; import * as InputGroup from '$lib/components/ui/input-group'; import { Input } from '$lib/components/ui/input'; import { Skeleton } from '$lib/components/ui/skeleton'; import SearchIcon from '@lucide/svelte/icons/search';</script>`;
const ui = (markup, extra = {}) => sv(imp + markup, { settings: SHADCN, ...extra });

const cases = {
  'derived-with-function': {
    valid: [sv('<script>let a = $state(1); let b = $derived(a * 2); let c = $derived.by(() => a);</script>')],
    invalid: [{ ...sv('<script>let a = $state(1); let b = $derived(() => a * 2);</script>'), ...err() }],
  },
  'no-destructure-reactive': {
    valid: [sv('<script>let s = $state({ a: 1 }); function f() { const { a } = s; return a; } let { x } = $props();</script>')],
    invalid: [
      { ...sv('<script>let s = $state({ a: 1 }); const { a } = s;</script>'), ...err() },
      { ...sv('<script>let props = $props(); const { a } = props;</script>'), ...err() },
    ],
  },
  'no-export-primitive-state': {
    valid: [tsf('export const store = $state({ count: 0 });', '/p/src/lib/s.svelte.ts'), tsf('export const n = $state(0);', '/p/src/lib/plain.ts')],
    invalid: [{ ...tsf('export const count = $state(0);', '/p/src/lib/s.svelte.ts'), ...err() }],
  },
  'prop-derived-without-derived': {
    valid: [sv("<script>let { type } = $props(); let color = $derived(type === 'x' ? 'a' : 'b'); const f = () => type; let init = $state(type);</script>")],
    invalid: [{ ...sv("<script>let { type } = $props(); let color = type === 'x' ? 'a' : 'b';</script>"), ...err() }],
  },
  'no-prop-mutation': {
    valid: [sv('<script>let { item = $bindable() } = $props(); function f() { item.count++; }</script>'), sv('<script>let { item } = $props(); let local = $state({ n: 0 }); function f() { local.n++; }</script>')],
    invalid: [{ ...sv('<script>let { item } = $props(); function f() { item.count += 1; }</script>'), ...err() }],
  },
  'no-bind-non-bindable-prop': {
    valid: [sv('<script>let { value = $bindable() } = $props();</script><input bind:value={value} />'), sv('<script>let v = $state(1);</script><input bind:value={v} />')],
    invalid: [{ ...sv('<script>let { value } = $props();</script><input bind:value={value} />'), ...err() }],
  },
  'effect-needs-cleanup': {
    valid: [sv('<script>$effect(() => { const id = setInterval(() => {}, 1); return () => clearInterval(id); });</script>')],
    invalid: [
      { ...sv('<script>$effect(() => { setInterval(() => {}, 1); });</script>'), ...err() },
      { ...sv('<script>$effect(() => { const o = new ResizeObserver(() => {}); o.observe(document.body); });</script>'), ...err() },
    ],
  },
  'effect-fetch-needs-abort': {
    valid: [sv('<script>$effect(() => { const c = new AbortController(); fetch("/a", { signal: c.signal }); return () => c.abort(); });</script>')],
    invalid: [{ ...sv('<script>let d = $state(); $effect(() => { fetch("/a").then((r) => (d = r)); });</script>'), ...err() }],
  },
  'no-browser-guard-in-effect': {
    valid: [sv('<script>$effect(() => { document.title = "x"; });</script>')],
    invalid: [
      { ...sv('<script>import { browser } from "$app/environment"; $effect(() => { if (browser) { document.title = "x"; } });</script>'), ...err() },
      { ...sv('<script>if (typeof window !== "undefined") { $effect(() => {}); }</script>'), ...err() },
    ],
  },
  'effect-root-dispose': {
    valid: [sv('<script>const dispose = $effect.root(() => {});</script>')],
    invalid: [{ ...sv('<script>$effect.root(() => {});</script>'), ...err() }],
  },
  'snapshot-before-clone': {
    valid: [sv('<script>let s = $state({ a: 1 }); structuredClone($state.snapshot(s)); let r = $state.raw({}); structuredClone(r);</script>')],
    invalid: [{ ...sv('<script>let s = $state({ a: 1 }); structuredClone(s); worker.postMessage(s.a);</script>'), ...err(2) }],
  },
  'no-imported-runes': {
    valid: [sv("<script>import { tick } from 'svelte';</script>")],
    invalid: [{ ...sv("<script>import { $state } from 'svelte';</script>"), ...err() }],
  },
  'no-store-as-state': {
    valid: [tsf("import { readable } from 'svelte/store';", '/p/src/lib/a.ts')],
    invalid: [{ ...tsf("import { writable } from 'svelte/store';", '/p/src/lib/a.ts'), ...err() }],
  },
  'store-usage': {
    valid: [tsf("import { writable } from 'svelte/store';", '/p/src/lib/a.ts')],
    invalid: [{ ...tsf("import { readable, get } from 'svelte/store';", '/p/src/lib/a.ts'), ...err(2) }],
  },
  'ssr-shared-state': {
    valid: [tsf('export const s = $state({ a: 1 });', '/p/src/lib/client.svelte.ts', { settings: KIT }), tsf('export function f() { const s = $state(0); }', '/p/src/lib/server/x.svelte.ts', { settings: KIT })],
    invalid: [
      { ...tsf('export const s = $state({ a: 1 });', '/p/src/lib/server/x.svelte.ts', { settings: KIT }), ...err() },
      { ...tsf('export const s = $state({ a: 1 });', '/p/src/lib/shared.svelte.ts', { settings: { svelteStrict: { ...KIT.svelteStrict, serverReachable: ['/p/src/lib/shared.svelte.ts'] } } }), ...err() },
    ],
  },
  'ssr-module-state': {
    valid: [tsf('let n = 0; export const get = () => n;', '/p/src/lib/a.ts', { settings: KIT }), sv('<script>let n = $state(0);</script>', { settings: KIT })],
    invalid: [
      { ...tsf('let n = 0; export const inc = () => { n++; };', '/p/src/lib/a.ts', { settings: KIT }), ...err() },
      { ...sv('<script module>let n = $state(0);</script>', { settings: KIT }), ...err() },
    ],
  },
  'load-use-event-fetch': {
    valid: [tsf('export async function load({ fetch }) { return fetch("/a"); }', '/p/src/routes/+page.ts', { settings: KIT })],
    invalid: [{ ...tsf('export const load = async () => { const r = await fetch("/a"); return {}; };', '/p/src/routes/+page.ts', { settings: KIT }), ...err() }],
  },
  'no-swallowed-redirect': {
    valid: [tsf("import { redirect } from '@sveltejs/kit'; export function load() { try { x(); } catch (e) { throw e; } redirect(303, '/'); }", '/p/src/routes/+page.server.ts', { settings: KIT })],
    invalid: [{ ...tsf("import { redirect } from '@sveltejs/kit'; export function load() { try { redirect(303, '/'); } catch (e) { console.log(e); } }", '/p/src/routes/+page.server.ts', { settings: KIT }), ...err() }],
  },
  'form-post-enhance': {
    valid: [sv('<script>import { enhance } from "$app/forms";</script><form method="POST" use:enhance></form><form method="GET"></form>', { settings: KIT })],
    invalid: [{ ...sv('<form method="post"></form>', { settings: KIT }), ...err() }],
  },
  'remote-needs-schema': {
    valid: [tsf("import { query } from '$app/server'; import * as v from 'valibot'; export const q = query(v.string(), async (id) => id); export const all = query(async () => []);", '/p/src/lib/a.remote.ts', { settings: KIT })],
    invalid: [{ ...tsf("import { query } from '$app/server'; export const q = query(async (id) => id);", '/p/src/lib/a.remote.ts', { settings: KIT }), ...err() }],
  },
  'locals-only-in-handle': {
    valid: [tsf('export const handle = async ({ event, resolve }) => { event.locals.user = 1; return resolve(event); };', '/p/src/hooks.server.ts', { settings: KIT })],
    invalid: [{ ...tsf('export async function load({ locals }) { locals.user = 1; }', '/p/src/routes/+page.server.ts', { settings: KIT }), ...err() }],
  },
  'handle-calls-resolve': {
    valid: [tsf('export const handle = async ({ event, resolve }) => resolve(event);', '/p/src/hooks.server.ts', { settings: KIT })],
    invalid: [{ ...tsf('export async function handle({ event, resolve }) { return new Response("x"); }', '/p/src/hooks.server.ts', { settings: KIT }), ...err() }],
  },
  'csrf-safe': {
    valid: [tsf("export default { kit: { csrf: { trustedOrigins: ['https://a.com'] } } };", '/p/svelte.config.js', { settings: KIT })],
    invalid: [{ ...tsf("export default { kit: { csrf: { checkOrigin: false, trustedOrigins: ['*'] } } };", '/p/svelte.config.js', { settings: KIT }), ...err(2) }],
  },
  'typed-props': {
    valid: [sv('<script lang="ts">interface Props { a: number } let { a }: Props = $props();</script>'), sv('<script>let { a } = $props();</script>')],
    invalid: [{ ...sv('<script lang="ts">let { a } = $props();</script>'), ...err() }],
  },
  'kit-typed-page-props': {
    valid: [sv("<script lang=\"ts\">import type { PageProps } from './$types'; let { data }: PageProps = $props();</script>", { filename: '/p/src/routes/+page.svelte', settings: KIT })],
    invalid: [{ ...sv('<script lang="ts">let { data }: { data: any } = $props();</script>', { filename: '/p/src/routes/+page.svelte', settings: KIT }), ...err() }],
  },
  'kit-typed-load': {
    valid: [tsf("import type { PageLoad } from './$types'; export const load: PageLoad = async () => ({});", '/p/src/routes/+page.ts', { settings: KIT })],
    invalid: [{ ...tsf('export async function load() { return {}; }', '/p/src/routes/+page.ts', { settings: KIT }), ...err() }],
  },
  'test-no-sleep': {
    valid: [tsf('import { flushSync } from "svelte"; flushSync();', '/p/src/a.test.ts')],
    invalid: [{ ...tsf('await new Promise((r) => setTimeout(r, 50));', '/p/src/a.test.ts'), ...err() }],
  },
  'shadcn-no-space-utils': {
    valid: [ui('<div class="flex flex-col gap-4"></div>'), sv('<div class="space-y-2"></div>')],
    invalid: [{ ...ui('<div class="md:space-y-4 space-x-2"></div>'), ...err(2) }],
  },
  'shadcn-size-truncate': {
    valid: [ui('<div class="size-10 w-4 h-6 truncate"></div>')],
    invalid: [{ ...ui('<div class="w-10 h-10 overflow-hidden text-ellipsis whitespace-nowrap"></div>'), ...err(2) }],
  },
  'shadcn-semantic-colors': {
    valid: [ui('<div class="bg-primary text-muted-foreground border-border text-sm text-[13px]"></div>')],
    invalid: [{ ...ui('<div class="bg-blue-500 text-[#fff] dark:bg-background hover:text-white/80"></div>'), ...err(4) }],
  },
  'shadcn-no-overlay-z': {
    valid: [ui('<Dialog.Root><Dialog.Content class="max-w-md"><Dialog.Title>t</Dialog.Title></Dialog.Content></Dialog.Root><div class="z-10"></div>')],
    invalid: [{ ...ui('<Dialog.Root><Dialog.Content class="z-50"><Dialog.Title>t</Dialog.Title></Dialog.Content></Dialog.Root>'), ...err() }],
  },
  'shadcn-class-cn': {
    valid: [ui("<div class={cn('a', active && 'b')}></div><div class={['a', active && 'b']}></div><div class=\"a {b}\"></div>")],
    invalid: [{ ...ui("<div class=\"a {active ? 'b' : ''}\"></div><div class={`a ${active ? 'b' : ''}`}></div>"), ...err(2) }],
  },
  'shadcn-item-in-group': {
    valid: [ui('<Select.Root><Select.Content><Select.Group><Select.Item value="a">A</Select.Item></Select.Group></Select.Content></Select.Root>')],
    invalid: [{ ...ui('<Select.Root><Select.Content><Select.Item value="a">A</Select.Item></Select.Content></Select.Root>'), ...err() }],
  },
  'shadcn-overlay-title': {
    valid: [ui('<Dialog.Content>{#if x}<Dialog.Title class="sr-only">t</Dialog.Title>{/if}</Dialog.Content>')],
    invalid: [{ ...ui('<Dialog.Content><p>body</p></Dialog.Content>'), ...err() }],
  },
  'shadcn-tabs-trigger-in-list': {
    valid: [ui('<Tabs.Root><Tabs.List><Tabs.Trigger value="a">A</Tabs.Trigger></Tabs.List></Tabs.Root>')],
    invalid: [{ ...ui('<Tabs.Root><Tabs.Trigger value="a">A</Tabs.Trigger></Tabs.Root>'), ...err() }],
  },
  'shadcn-avatar-fallback': {
    valid: [ui('<Avatar.Root><Avatar.Image src="/u.png" alt="u" /><Avatar.Fallback>U</Avatar.Fallback></Avatar.Root>')],
    invalid: [{ ...ui('<Avatar.Root><Avatar.Image src="/u.png" alt="u" /></Avatar.Root>'), ...err() }],
  },
  'shadcn-button-no-loading-prop': {
    valid: [ui('<Button disabled={p}>Save</Button>')],
    invalid: [{ ...ui('<Button isLoading={p}>Save</Button>'), ...err() }],
  },
  'shadcn-inputgroup-controls': {
    valid: [ui('<InputGroup.Root><InputGroup.Input /></InputGroup.Root><Input />')],
    invalid: [{ ...ui('<InputGroup.Root><Input /></InputGroup.Root>'), ...err() }],
  },
  'shadcn-field-state-pair': {
    valid: [ui('<Field.Field data-invalid={bad}><Input aria-invalid={bad} /></Field.Field>')],
    invalid: [
      { ...ui('<Field.Field data-invalid><Input /></Field.Field>'), ...err() },
      { ...ui('<Field.Field><Input aria-invalid /></Field.Field>'), ...err() },
    ],
  },
  'shadcn-button-icon': {
    valid: [ui('<Button><SearchIcon data-icon="inline-start" />Search</Button><Button size="icon"><SearchIcon /></Button>')],
    invalid: [{ ...ui('<Button><SearchIcon class="size-4" />Search</Button>'), ...err(2) }],
  },
  'shadcn-icon-library': {
    valid: [ui('')],
    invalid: [{ ...sv("<script>import { Search } from '@tabler/icons-svelte';</script>", { settings: SHADCN }), ...err() }],
  },
  'shadcn-imports': {
    valid: [ui(''), sv("<script>import { useSidebar } from '$lib/components/ui/sidebar'; import { Button } from '$lib/components/ui/button';</script>", { settings: SHADCN })],
    invalid: [
      { ...sv("<script>import { Button } from '../components/ui/button';</script>", { settings: SHADCN }), ...err() },
      { ...sv("<script>import * as Button from '$lib/components/ui/button'; import { Content } from '$lib/components/ui/dialog';</script>", { settings: SHADCN }), ...err(2) },
    ],
  },
  'shadcn-toast-sonner': {
    valid: [sv("<script>import { toast } from 'svelte-sonner';</script>", { settings: SHADCN })],
    invalid: [{ ...sv("<script>import toast from 'svelte-french-toast';</script>", { settings: SHADCN }), ...err() }],
  },
  'shadcn-skeleton': {
    valid: [ui('<Skeleton class="h-4 animate-pulse" />')],
    invalid: [{ ...ui('<div class="h-4 animate-pulse bg-muted"></div>'), ...err() }],
  },
};

const tester = new RuleTester({
  languageOptions: { parser: svelteParser, parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] } },
});
for (const [name, { valid, invalid }] of Object.entries(cases)) tester.run(name, rules[name], { valid, invalid });

test('every rule has at least one valid and one invalid case', () => {
  const missing = Object.keys(rules).filter((n) => !cases[n]?.valid?.length || !cases[n]?.invalid?.length);
  assert.deepEqual(missing, []);
});

test('every rule declares class, area and fix', () => {
  const bad = Object.entries(rules).filter(([, r]) => !['gate', 'review'].includes(r.meta.docs.class) || !r.meta.docs.area || !r.meta.docs.fix).map(([n]) => n);
  assert.deepEqual(bad, []);
});
