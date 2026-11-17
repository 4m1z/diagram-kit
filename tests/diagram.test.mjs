import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SKILL = fileURLToPath(new URL('../plugins/diagram-kit/skills/create-diagram/', import.meta.url));
const imp = (rel) => import(pathToFileURL(SKILL + rel).href);
const { loadSpec, normalizeSpec, parseEdge, SpecError } = await imp('scripts/lib/spec.mjs');
const { buildModel } = await imp('scripts/lib/build.mjs');
const { checkModel } = await imp('scripts/lib/check.mjs');
const { parseBrief } = await imp('scripts/lib/model.mjs');
const { htmlPage, bundleViewer, reactFiles } = await imp('scripts/lib/html.mjs');
const { staticSvg } = await imp('scripts/lib/png.mjs');
const { measure, wrap } = await imp('scripts/lib/metrics.mjs');

const EXAMPLES = `${SKILL}examples/`;

test('edge shorthand maps arrows to kinds', () => {
  assert.deepEqual(parseEdge('a -> b: call'), { from: 'a', to: 'b', kind: 'sync', label: 'call' });
  assert.equal(parseEdge('a ~> b').kind, 'async');
  assert.equal(parseEdge('a ..> b: read').kind, 'data');
  assert.equal(parseEdge('a --> b').kind, 'return');
  assert.equal(parseEdge('a -- b').kind, 'weak');
  assert.throws(() => parseEdge('a b'), SpecError);
});

test('spec errors name the problem', () => {
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a' }], edges: ['a -> ghost'] }), /unknown node "ghost"/);
  assert.throws(() => normalizeSpec({ kind: 'nope' }), /Unknown kind/);
  assert.throws(() => normalizeSpec({ tiers: ['x'], nodes: [{ id: 'a', tier: 'y' }] }), /tier "y"/);
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a' }, { id: 'b' }], edges: ['a -> b'], flows: [{ steps: ['b -> a'] }] }), /matches no edge/);
});

test('duplicate wires get distinct ids and flows can address them', () => {
  const s = normalizeSpec({ nodes: ['a', 'b'], edges: ['a -> b: one', 'a -> b: two'], flows: [{ steps: [{ edge: 'a->b#2' }] }] });
  assert.deepEqual(s.edges.map((e) => e.id), ['a->b', 'a->b#2']);
  assert.equal(s.flows[0].steps[0].text, 'two');
});

test('measurement uses Geist widths', () => {
  assert.ok(measure('Order service', { face: 'sans', weight: 500, size: 13 }) > 70);
  assert.ok(measure('iiii', { face: 'mono', weight: 400, size: 11 }) === measure('mmmm', { face: 'mono', weight: 400, size: 11 }));
  assert.equal(wrap('one two three four five six', { face: 'sans', weight: 500, size: 13 }, 60, 2).length, 2);
});

for (const file of readdirSync(EXAMPLES)) {
  test(`example ${file} lays out cleanly and deterministically`, async () => {
    const a = await buildModel(loadSpec(EXAMPLES + file));
    const b = await buildModel(loadSpec(EXAMPLES + file));
    assert.deepEqual(a.model, b.model, 'same spec, same positions');
    const result = checkModel(a.model);
    const errors = result.issues.filter((i) => i.level === 'error');
    assert.deepEqual(errors, [], `no errors in ${file}`);
    for (const n of a.model.nodes) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0, `${n.id} has a box`);
      assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= a.model.width && n.y + n.h <= a.model.height, `${n.id} is on the canvas`);
    }
    for (const e of a.model.edges) assert.ok(e.points.length >= 2, `${e.id} is routed`);
  });
}

test('check finds overlaps and wires through parts', () => {
  const model = {
    engine: 'graph', kind: 'architecture', direction: 'right', width: 400, height: 200,
    nodes: [
      { id: 'a', x: 10, y: 10, w: 80, h: 40 },
      { id: 'b', x: 60, y: 20, w: 80, h: 40 },
      { id: 'c', x: 300, y: 10, w: 80, h: 40 },
      { id: 'mid', x: 180, y: 110, w: 60, h: 40 },
    ],
    edges: [{ id: 'a->c', from: 'a', to: 'c', points: [[90, 130], [300, 130]] }],
    groups: [], flows: [],
  };
  const codes = checkModel(model).issues.map((i) => i.code);
  assert.ok(codes.includes('overlap'));
  assert.ok(codes.includes('edge-through'));
});

test('brief facts parse with sources and status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-'));
  const p = join(dir, 'brief.md');
  writeFileSync(p, '---\nstatus: approved\n---\n# X\n## Facts\n- F1: Keys expire after 24 hours. (source: https://example.com/a, src/x.ts:4)\n- F2: Unsourced claim.\n');
  const b = parseBrief(p);
  assert.equal(b.status, 'approved');
  assert.deepEqual(b.facts.F1.sources, ['https://example.com/a', 'src/x.ts:4']);
  assert.deepEqual(b.facts.F2.sources, []);
});

test('html page is self-contained and the viewer bundle has no module syntax', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}architecture.yaml`));
  const html = htmlPage(model);
  assert.match(html, /<script type="application\/json" id="diagram-model">/);
  assert.match(html, /@font-face/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/, 'no external requests');
  const bundle = bundleViewer();
  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m);
  assert.match(bundleViewer({ esm: true }), /export \{ mountDiagram/);
});

test('static SVG resolves every colour (no CSS variables for the PNG renderer)', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}sequence.yaml`));
  const svg = staticSvg(model);
  assert.doesNotMatch(svg, /var\(--/);
  assert.match(svg, /font-weight="500"/);
});

// --- Regressions from the independent review (2026-11-17)
const { themeCss } = await imp('assets/viewer/theme.mjs');
const { renderSvg } = await imp('assets/viewer/render.mjs');

test('spec text cannot inject markup: shapes, tones, kinds and theme values are checked', () => {
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a', shape: 'box"><image onerror="x"/>' }] }), /shape/);
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a', tone: 'red" onmouseover="x' }] }), /tone/);
  assert.throws(() => normalizeSpec({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b', kind: 'evil"' }] }), /kind/);
  assert.throws(() => normalizeSpec({ theme: { light: { accent: '#fff; } </style><script>x</script>' } } }), /not allowed/);
  const css = themeCss({ light: { accent: 'red}</style><script>x</script>', 'bad-key': 'red' } });
  assert.doesNotMatch(css, /<script|bad-key/);
  const svg = renderSvg({ width: 10, height: 10, nodes: [{ id: 'a"b', label: '<b>', shape: 'box"x', x: 0, y: 0, w: 5, h: 5 }], edges: [], groups: [] }, { mode: 'vars' });
  assert.doesNotMatch(svg, /data-shape="box"x/);
  assert.doesNotMatch(svg, /<b>/);
});

test('malformed sequences fail with a spec error, not a crash', () => {
  const base = { kind: 'sequence', participants: ['a', 'b'] };
  assert.throws(() => normalizeSpec({ ...base, messages: [{ note: 'hi' }] }), /over/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'loop', steps: ['a -> b'] }] }), /no messages/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'alt', messages: ['a -> b'], else: { label: 'x' } }] }), /must be a list/);
  assert.throws(() => normalizeSpec({ ...base, messages: [null] }), /empty/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'when', messages: ['a -> b'] }] }), /Block/);
});

test('duplicate edge ids are rejected', () => {
  assert.throws(() => normalizeSpec({ nodes: ['a', 'b', 'c'], edges: [{ from: 'a', to: 'b', id: 'x' }, { from: 'b', to: 'c', id: 'x' }] }), /Duplicate edge id/);
});

test('a grouped part with a different tier is warned about', () => {
  const s = normalizeSpec({ tiers: ['one', 'two'], groups: [{ id: 'g', tier: 'one' }], nodes: [{ id: 'a', group: 'g', tier: 'two' }] });
  assert.ok(s.warnings.some((w) => w.code === 'tier'));
});

test('brief status comes from the front matter only, and checked dates are not sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-'));
  const p = join(dir, 'b.md');
  writeFileSync(p, '---\nstatus: "approved"\n---\n- F1: x. (source: https://en.wikipedia.org/wiki/Saga_(pattern), checked 2026-11-17)\n');
  const b = parseBrief(p);
  assert.equal(b.status, 'approved');
  assert.deepEqual(b.facts.F1.sources, ['https://en.wikipedia.org/wiki/Saga_(pattern)']);
  assert.equal(b.facts.F1.checked, '2026-11-17');
  writeFileSync(p, '# Title\n\n---\nstatus: approved\n');
  assert.equal(parseBrief(p).status, 'draft');
});

test('in a cycle the first declared transition runs forward', async () => {
  const { model } = await buildModel(normalizeSpec({ kind: 'state', nodes: ['idle', 'busy'], edges: ['idle -> busy: start', 'busy -> idle: done'] }));
  const x = Object.fromEntries(model.nodes.map((n) => [n.id, n.x]));
  assert.ok(x.idle < x.busy);
});

test('a wire to a table without a field attaches at the header, not a corner', async () => {
  const { model } = await buildModel(normalizeSpec({ kind: 'datamodel', nodes: [{ id: 't', fields: ['id uuid pk'] }, 'audit'], edges: ['t -> audit'] }));
  const t = model.nodes.find((n) => n.id === 't');
  const [x, y] = model.edges[0].points[0];
  assert.ok(Math.abs(y - (t.y + 18)) < 2 && (Math.abs(x - t.x) < 1 || Math.abs(x - (t.x + t.w)) < 1));
});

test('crossings between wires that share a part are counted away from that part', () => {
  const model = {
    engine: 'graph', kind: 'graph', direction: 'right', width: 400, height: 400, groups: [], flows: [],
    nodes: [{ id: 'a', x: 0, y: 0, w: 40, h: 40 }, { id: 'b', x: 300, y: 300, w: 40, h: 40 }, { id: 'c', x: 300, y: 0, w: 40, h: 40 }],
    edges: [
      { id: 'a->b', from: 'a', to: 'b', points: [[40, 20], [200, 20], [200, 320], [300, 320]] },
      { id: 'a->c', from: 'a', to: 'c', points: [[20, 40], [20, 150], [320, 150], [320, 40]] },
    ],
  };
  assert.equal(checkModel(model).stats.crossings, 1);
});

test('the CLI keeps the spec path after boolean flags and contains --name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-cli-'));
  const cli = SKILL + 'scripts/diagram.mjs';
  execFileSync('node', [cli, 'build', '--dark', SKILL + 'examples/tree.yaml', '--out', dir, '--name', '../escape', '--no-html'], { encoding: 'utf8' });
  assert.deepEqual(readdirSync(dir).sort(), ['escape.dark.png', 'escape.layout.json', 'escape.png']);
});

test('React output is a client component with scoped tokens and bundled fonts', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}tree.yaml`));
  const files = reactFiles(model, { name: 'tree' });
  assert.match(files['Diagram.tsx'], /^'use client';/);
  assert.match(files['diagram.css'], /\.dk-root \{ --dk-bg/);
  assert.doesNotMatch(files['diagram.css'], /:root \{/);
  assert.ok(files['fonts/Geist-Medium.woff2'].length > 1000);
});
