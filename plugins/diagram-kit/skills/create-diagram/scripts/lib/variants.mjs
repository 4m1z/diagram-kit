// Explore: lay one spec out several ways at once, measure each, and draw them side by side so the
// agent can compare them by eye and keep the one that gets the message across best. Graph and tree
// kinds only; sequences and mind maps have one deterministic layout.
import { buildModel } from './build.mjs';
import { checkModel } from './check.mjs';

// What a variant may change. Everything here is a layout choice, never meaning.
const ORDER = [
  { label: 'order kept', layout: {} },
  { label: 'order free', layout: { 'elk.layered.considerModelOrder.strategy': 'NONE', 'elk.layered.cycleBreaking.strategy': 'GREEDY' } },
];
const PLACEMENT = [
  { label: 'balanced', layout: {} },
  { label: 'compact', layout: { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' } },
  { label: 'straight', layout: { 'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS' } },
];
// A long chain can wrap into rows, like a line of text (ELK fails on some mixes; those are skipped).
const WRAP = [
  { label: '', layout: {} },
  { label: 'wrapped', layout: { 'elk.layered.wrapping.strategy': 'SINGLE_EDGE', 'elk.aspectRatio': 3 } },
  { label: 'wrapped tight', layout: { 'elk.layered.wrapping.strategy': 'SINGLE_EDGE', 'elk.aspectRatio': 1.6 } },
];
// Spacing is not varied (it rarely changes the picture, only its size): use `layout: { spacing: 1.5 }`.
const VARIED = new Set([...ORDER, ...PLACEMENT, ...WRAP].flatMap((v) => Object.keys(v.layout)));

const otherAxis = (dir) => (dir === 'down' || dir === 'up' ? 'right' : 'down');

function measure(model, aspect) {
  const c = checkModel(model);
  const count = (level) => c.issues.filter((i) => i.level === level).length;
  const bends = model.edges.reduce((s, e) => s + Math.max(0, (e.points?.length ?? 2) - 2), 0);
  const ratio = model.width / model.height;
  const aspectOff = aspect ? Math.abs(Math.log(ratio / aspect)) : 0;
  return {
    errors: count('error'),
    warnings: count('warn'),
    crossings: c.stats.crossings,
    bends,
    width: Math.round(model.width),
    height: Math.round(model.height),
    // Lower is better. Errors and warnings dominate; the rest only orders similar layouts.
    score: count('error') * 1000 + count('warn') * 60 + c.stats.crossings * 12 + bends + aspectOff * 40 + (model.width * model.height) / 60000,
  };
}

const signature = (model) => model.nodes.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join('|') + `|${Math.round(model.width)}x${Math.round(model.height)}`;

// How different two layouts look: mean distance between each part's centre, as a share of the size.
function difference(a, b) {
  const at = new Map(a.nodes.map((n) => [n.id, [(n.x + n.w / 2) / a.width, (n.y + n.h / 2) / a.height]]));
  let sum = 0;
  for (const n of b.nodes) {
    const p = at.get(n.id);
    if (p) sum += Math.abs(p[0] - (n.x + n.w / 2) / b.width) + Math.abs(p[1] - (n.y + n.h / 2) / b.height);
  }
  return sum / (2 * Math.max(1, b.nodes.length));
}
const LOOKS_THE_SAME = 0.02;

/**
 * Lay out a spec several ways. Returns the best `count` distinct layouts, best first:
 * [{ name, label, settings: { direction, layout }, model, stats }]. `settings` is exactly what to
 * put in the spec to keep that layout.
 */
export async function layoutVariants(spec, { count = 6, aspect } = {}) {
  if (spec.engine !== 'graph' && spec.engine !== 'tree') {
    throw new Error(`A ${spec.kind} has one layout; build it directly.`);
  }
  const base = Object.fromEntries(Object.entries(spec.layout ?? {}).filter(([k]) => !VARIED.has(k)));
  const directions = [spec.direction, otherAxis(spec.direction)];
  const tried = [];
  const seen = new Set();
  for (const direction of directions)
    for (const order of ORDER)
      for (const place of PLACEMENT)
        for (const wrap of WRAP) {
        const layout = { ...order.layout, ...place.layout, ...wrap.layout };
        let built;
        try {
          built = await buildModel({ ...spec, direction, layout: { ...base, ...layout } });
        } catch {
          continue; // an option mix the engine rejects is simply not a candidate
        }
        const sig = signature(built.model);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const label = [direction, order.label, place.label, wrap.label].filter(Boolean).join(' · ');
        tried.push({ label, settings: { direction, layout }, model: built.model, stats: measure(built.model, aspect) });
        }
  tried.sort((a, b) => a.stats.score - b.stats.score);
  // Keep layouts that look different from each other, best first; near copies teach nothing.
  const picked = [];
  for (const v of tried) {
    if (picked.length >= count) break;
    if (picked.some((p) => difference(p.model, v.model) < LOOKS_THE_SAME)) continue;
    picked.push(v);
  }
  // Always show the other reading direction too, when it has no errors.
  const otherDir = otherAxis(spec.direction);
  const other = tried.find((v) => v.settings.direction === otherDir && v.stats.errors === 0);
  if (other && count > 1 && !picked.some((v) => v.settings.direction === otherDir)) {
    if (picked.length >= count) picked.pop();
    picked.push(other);
  }
  return { variants: picked.map((v, i) => ({ name: `v${i + 1}`, ...v })), distinct: tried.length, combinations: directions.length * ORDER.length * PLACEMENT.length * WRAP.length };
}

/** The spec lines that keep a variant, as YAML. */
export function settingsYaml(settings) {
  const keys = Object.entries(settings.layout);
  const lines = [`direction: ${settings.direction}`];
  if (keys.length) lines.push('layout:', ...keys.map(([k, v]) => `  ${k}: ${v}`));
  return lines.join('\n');
}

const escText = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * One SVG with every variant, each captioned with its name, settings and numbers. Wide layouts
 * get a full-width row; the rest share rows. `svgOf(model, idPrefix)` returns one model's SVG.
 */
export function contactSheet(variants, svgOf) {
  const pad = 24;
  const cap = 46;
  const cols = Math.min(3, Math.max(1, variants.filter((v) => v.model.width / v.model.height <= 1.8).length));
  const cellW = 560;
  const fullW = cols * cellW + (cols - 1) * pad;
  const W = Math.max(fullW, 1180) + 2 * pad;
  const rows = [];
  let row = null;
  for (const v of variants) {
    if (v.model.width / v.model.height > 1.8) { rows.push({ wide: true, items: [v] }); row = null; continue; }
    if (!row || row.items.length >= cols) { row = { wide: false, items: [] }; rows.push(row); }
    row.items.push(v);
  }
  const out = [];
  let y = pad;
  for (const r of rows) {
    const w = r.wide ? W - 2 * pad : cellW;
    const h = Math.round(Math.min(r.wide ? 640 : 860, Math.max(r.wide ? 160 : 300, ...r.items.map((v) => (w * v.model.height) / v.model.width))));
    r.items.forEach((v, i) => {
      const x = pad + i * (cellW + pad);
      const s = v.stats;
      const numbers = `${s.crossings} crossings · ${s.errors + s.warnings} issues · ${s.bends} bends · ${s.width}×${s.height}`;
      out.push(`<text x="${x}" y="${y + 16}" font-family="Geist" font-weight="600" font-size="16" fill="#111113">${escText(`${v.name}  ${v.label}`)}</text>`);
      out.push(`<text x="${x}" y="${y + 36}" font-family="Geist Mono" font-weight="400" font-size="12" fill="#6b6b76">${escText(numbers)}</text>`);
      out.push(`<rect x="${x}" y="${y + cap}" width="${w}" height="${h}" rx="10" fill="#f7f7f8" stroke="#e4e4e7"/>`);
      out.push(svgOf(v.model, v.name).replace(/^<svg\b[^>]*>/, `<svg x="${x + 8}" y="${y + cap + 8}" width="${w - 16}" height="${h - 16}" viewBox="0 0 ${v.model.width} ${v.model.height}" preserveAspectRatio="xMidYMid meet">`));
    });
    y += cap + h + pad;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#ffffff"/>${out.join('')}</svg>`;
}
