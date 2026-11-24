#!/usr/bin/env bash
# A Svelte 5 project with one legacy (Svelte 4) component to migrate. Run from the
# workspace root by run-evals.py, after the skills are installed: svelte is linked
# from svelte-strict's own tooling, so nothing is downloaded.
set -eu

mkdir -p src/lib node_modules
ln -s "$(cd .claude/skills/svelte-strict/tooling/node_modules/svelte && pwd -P)" node_modules/svelte
printf '{ "name": "app", "private": true, "type": "module" }\n' > package.json
printf 'node_modules\n' > .gitignore
cat > src/lib/Legacy.svelte <<'SVELTE'
<script>
  export let label;
  export let count = 0;
  $: doubled = count * 2;
</script>
<button type="button" on:click>{label} {doubled}</button>
SVELTE

printf "import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('sanity', () => assert.equal(1 + 1, 2));\n" > sanity.test.mjs

git init -q -b main .
git config user.email eval@local
git config user.name eval
git add -A
git commit -qm init
