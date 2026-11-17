#!/usr/bin/env node
// diagram-kit CLI. Spec (meaning) -> layout model (positions) -> HTML / PNG / React.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
if (!existsSync(join(HERE, 'node_modules', 'elkjs'))) {
  console.error(`diagram-kit needs its dependencies once:\n  npm ci --ignore-scripts --prefix "${HERE}"`);
  process.exit(2);
}

const { loadSpec, SpecError, KIND_NAMES, checkTheme } = await import('./lib/spec.mjs');
const { buildModel } = await import('./lib/build.mjs');
const { checkModel, formatIssues } = await import('./lib/check.mjs');
const { htmlPage, reactFiles } = await import('./lib/html.mjs');
const { renderPng } = await import('./lib/png.mjs');
const { addMetrics, buildMetrics } = await import('./lib/metrics.mjs');

const HELP = `diagram <command> [options]

  build <spec>       layout, check, and write <name>.layout.json, <name>.html, <name>.png
      --out <dir>        output folder (default: next to the spec)
      --name <name>      file name stem (default: spec file name)
      --tokens <file>    host theme tokens JSON ({ light: {...}, dark: {...}, fonts: {...} })
      --metrics <file>   extra font metrics from \`diagram metrics\` (host fonts)
      --dark             also write <name>.dark.png
      --react [dir]      also write a React component folder
      --strict           treat an unapproved brief as an error
      --no-png --no-html --no-fonts
  check <spec|layout.json>   report geometry and fact issues (exit 1 on errors)
  png <spec|layout.json>     write a PNG preview (--theme dark, --out file, --scale 2)
  react <spec> --out <dir>   write Diagram.tsx, the viewer module, CSS and the layout JSON
  metrics <font.ttf|otf|woff> --as sans-500   measure a host font (keys: sans-400/500/600, mono-400/500)
  example [kind]     print an example spec (kinds: ${KIND_NAMES.join(', ')})
`;

const BOOLEAN = new Set(['dark', 'strict', 'help']);
const looksLikeSpec = (s) => /\.(ya?ml|json)$/i.test(s);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--no-')) args[a.slice(5)] = false;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      // Flags never swallow the spec path, and boolean flags never take a value.
      if (BOOLEAN.has(key) || next == null || next.startsWith('--') || (key === 'react' && looksLikeSpec(next))) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

// A file name stem, never a path: --name cannot escape --out.
const safeName = (s) => basename(String(s)).replace(/[^\w.-]+/g, '-').replace(/^\.+/, '') || 'diagram';
const METRIC_KEYS = ['sans-400', 'sans-500', 'sans-600', 'mono-400', 'mono-500'];

const stem = (file) => basename(file).replace(/\.(ya?ml|json)$/i, '').replace(/\.(spec|layout)$/i, '');

async function modelFrom(file, args) {
  if (args.metrics) addMetrics(resolve(args.metrics));
  if (/\.layout\.json$/i.test(file)) return { model: JSON.parse(readFileSync(file, 'utf8')), warnings: [] };
  const spec = loadSpec(file);
  return buildModel(spec);
}

const tokensFrom = (args) => (args.tokens ? checkTheme(JSON.parse(readFileSync(resolve(args.tokens), 'utf8')), '--tokens') : {});

function report(model, warnings, args = {}) {
  const result = checkModel(model, { strict: Boolean(args.strict) });
  result.issues.unshift(...warnings);
  if (warnings.some((w) => w.level === 'error')) result.ok = false;
  console.log(formatIssues(result));
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, target] = args._;
  if (!cmd || cmd === 'help' || args.help) { console.log(HELP); return 0; }

  if (cmd === 'example') {
    const dir = join(HERE, '..', 'examples');
    const kind = target ?? 'architecture';
    const file = readdirSync(dir).find((f) => f.startsWith(`${kind}.`));
    if (!file) { console.error(`No example for "${kind}". Available: ${readdirSync(dir).map(stem).join(', ')}`); return 1; }
    process.stdout.write(readFileSync(join(dir, file), 'utf8'));
    return 0;
  }

  if (cmd === 'metrics') {
    if (!target || !METRIC_KEYS.includes(args.as)) { console.error(`Usage: diagram metrics <font.ttf|otf|woff> --as <${METRIC_KEYS.join('|')}> [--out metrics.json]`); return 1; }
    if (!['.ttf', '.otf', '.woff'].includes(extname(target).toLowerCase())) { console.error('Use a .ttf, .otf or .woff file (woff2 is not readable here).'); return 1; }
    const out = resolve(args.out ?? 'diagram-metrics.json');
    const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { fonts: {} };
    Object.assign(prev.fonts, await buildMetrics(resolve(target), args.as));
    writeFileSync(out, JSON.stringify(prev));
    console.log(`Wrote ${out} (${Object.keys(prev.fonts).join(', ')}). Use it with --metrics.`);
    return 0;
  }

  if (!target) { console.error(HELP); return 1; }
  const file = resolve(target);
  const { model, warnings } = await modelFrom(file, args);

  if (cmd === 'check') return report(model, warnings, args).ok ? 0 : 1;

  if (cmd === 'png') {
    const out = resolve(args.out ?? join(dirname(file), `${stem(file)}${args.theme === 'dark' ? '.dark' : ''}.png`));
    writeFileSync(out, renderPng(model, { theme: args.theme ?? 'light', scale: Number(args.scale ?? 2), tokens: tokensFrom(args) }).png);
    console.log(out);
    return 0;
  }

  if (cmd === 'react') {
    const dir = resolve(args.out ?? join(dirname(file), `${stem(file)}-react`));
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(reactFiles(model, { name: safeName(args.name ?? stem(file)), tokens: tokensFrom(args) }))) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    console.log(dir);
    return 0;
  }

  if (cmd === 'build') {
    const outDir = resolve(args.out ?? dirname(file));
    mkdirSync(outDir, { recursive: true });
    const name = safeName(args.name ?? stem(file));
    const tokens = tokensFrom(args);
    // Check first: never hand broken geometry to the renderers.
    const result = report(model, warnings, args);
    if (result.issues.some((i) => i.code === 'geometry')) return 1;
    const written = [];
    const put = (fname, content) => { const p = join(outDir, fname); writeFileSync(p, content); written.push(p); };
    put(`${name}.layout.json`, `${JSON.stringify(model, null, 1)}\n`);
    if (args.html !== false) put(`${name}.html`, htmlPage(model, { tokens, embedFonts: args.fonts !== false }));
    if (args.png !== false) put(`${name}.png`, renderPng(model, { theme: 'light', tokens }).png);
    if (args.dark) put(`${name}.dark.png`, renderPng(model, { theme: 'dark', tokens }).png);
    if (args.react) {
      const dir = resolve(args.react === true ? join(outDir, `${name}-react`) : args.react);
      mkdirSync(dir, { recursive: true });
      for (const [fname, content] of Object.entries(reactFiles(model, { name, tokens }))) {
        mkdirSync(dirname(join(dir, fname)), { recursive: true });
        writeFileSync(join(dir, fname), content);
      }
      written.push(dir);
    }
    console.log(written.map((p) => `→ ${p}`).join('\n'));
    return result.ok ? 0 : 1;
  }

  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  return 1;
}

try {
  process.exitCode = await main();
} catch (err) {
  // Short, actionable messages only: a stack trace or minified engine source helps no one.
  const msg = String(err?.message ?? err).split('\n')[0].slice(0, 300);
  if (err instanceof SpecError) { console.error(`Spec error: ${msg}`); process.exitCode = 1; }
  else { console.error(`Error: ${msg}`); process.exitCode = 2; }
}
