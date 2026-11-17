// Where the npm dependencies live. Plugin hosts may rewrite their plugin folder at any time
// (Codex refreshes its cache), so dependencies installed inside it do not last. `diagram setup`
// installs them once into a shared cache keyed by the lockfile, used by every host and copy:
//   $DIAGRAM_KIT_DEPS, or ${XDG_CACHE_HOME:-~/.cache}/diagram-kit/deps-<lockfile hash>
// A node_modules folder next to the scripts (a development checkout) wins when present.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = fileURLToPath(new URL('..', import.meta.url));
const lockHash = createHash('sha256').update(readFileSync(join(SCRIPTS_DIR, 'package-lock.json'))).digest('hex').slice(0, 12);

export const SHARED_DEPS_DIR =
  process.env.DIAGRAM_KIT_DEPS ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'diagram-kit', `deps-${lockHash}`);

const installed = (dir) => existsSync(join(dir, 'node_modules', 'elkjs', 'package.json'));

export function depsRoot() {
  return [SCRIPTS_DIR, SHARED_DEPS_DIR].find(installed) ?? null;
}

let requireFromDeps = null;
export function dep(name) {
  if (!requireFromDeps) {
    const root = depsRoot();
    if (!root) throw new Error(`diagram-kit dependencies are not installed. Run: node "${join(SCRIPTS_DIR, 'diagram.mjs')}" setup`);
    requireFromDeps = createRequire(join(root, 'package.json'));
  }
  return requireFromDeps(name);
}
