// Rebuilds the per-kind examples into examples/kinds/ and the payments showcase in place.
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'plugins/diagram-kit/skills/diagram/scripts/diagram.mjs');
const run = (args) => {
  try { console.log(execFileSync('node', [cli, ...args], { encoding: 'utf8' })); }
  catch (err) { console.log(err.stdout); process.exitCode = 1; }
};
const kinds = join(root, 'plugins/diagram-kit/skills/diagram/examples');
const out = join(root, 'examples/kinds');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(kinds)) run(['build', join(kinds, f), '--out', out, '--dark']);
const pay = join(root, 'examples/payments');
if (existsSync(pay)) for (const f of readdirSync(pay).filter((x) => /\.ya?ml$/.test(x))) run(['build', join(pay, f), '--dark']);
