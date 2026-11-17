// Geometry and fact checks on a positioned model. Measured, not eyeballed: vision models miscount
// crossings, so the agent reads these numbers and then looks at the preview for composition.
import { sizes as S } from '../../assets/viewer/theme.mjs';

const EPS = 1.5;
const inter = (a, b, pad = 0) =>
  a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

function segRect([x1, y1], [x2, y2], r) {
  // Axis-aligned segments (orthogonal routes) against a rectangle shrunk by EPS.
  const L = r.x + EPS;
  const R = r.x + r.w - EPS;
  const T = r.y + EPS;
  const B = r.y + r.h - EPS;
  if (Math.abs(y1 - y2) < 0.01) return y1 > T && y1 < B && Math.max(x1, x2) > L && Math.min(x1, x2) < R;
  if (Math.abs(x1 - x2) < 0.01) return x1 > L && x1 < R && Math.max(y1, y2) > T && Math.min(y1, y2) < B;
  // Diagonal (curves are approximated by their chord): sample.
  for (let t = 0.05; t < 1; t += 0.05) {
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x > L && x < R && y > T && y < B) return true;
  }
  return false;
}

// Intersection point of two segments, or null.
function crossPoint([a1, b1], [a2, b2]) {
  const dx1 = b1[0] - a1[0];
  const dy1 = b1[1] - a1[1];
  const dx2 = b2[0] - a2[0];
  const dy2 = b2[1] - a2[1];
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a2[0] - a1[0]) * dy2 - (a2[1] - a1[1]) * dx2) / den;
  const u = ((a2[0] - a1[0]) * dy1 - (a2[1] - a1[1]) * dx1) / den;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return [a1[0] + t * dx1, a1[1] + t * dy1];
}

function segCross([a1, b1], [a2, b2]) {
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = d(a2, b2, a1);
  const d2 = d(a2, b2, b1);
  const d3 = d(a1, b1, a2);
  const d4 = d(a1, b1, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const segments = (e) => e.points.slice(1).map((p, i) => [e.points[i], p]);
const center = (n) => [n.x + n.w / 2, n.y + n.h / 2];

export function checkModel(model, { phoneWidth = 390, maxNodes = 16, strict = false } = {}) {
  const issues = [];
  const add = (level, code, message, hint, ids = []) => issues.push({ level, code, message, hint, ids });

  // Broken geometry stops everything else: renderers cannot draw NaN or Infinity.
  const finite = (...v) => v.every((x) => Number.isFinite(x));
  const bad = [
    ...(finite(model.width, model.height) ? [] : ['canvas']),
    ...model.nodes.filter((n) => !finite(n.x, n.y, n.w, n.h)).map((n) => n.id),
    ...(model.groups ?? []).filter((g) => !finite(g.x, g.y, g.w, g.h)).map((g) => g.id),
    ...model.edges.filter((e) => !e.points?.length || e.points.some((p) => !finite(...p))).map((e) => e.id),
  ];
  if (bad.length) {
    add('error', 'geometry', `Layout produced invalid positions for ${bad.slice(0, 6).join(', ')}.`, 'Check the spec for empty blocks or notes without "over"; if it persists, report it.');
    return { issues, stats: { nodes: model.nodes.length, edges: model.edges.length, crossings: 0, width: model.width, height: model.height }, ok: false };
  }
  const nodes = model.nodes.filter((n) => n.role !== 'note');
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const real = model.engine !== 'sequence';

  // Overlaps
  for (let i = 0; i < model.nodes.length; i++)
    for (let j = i + 1; j < model.nodes.length; j++)
      if (inter(model.nodes[i], model.nodes[j], 1)) add('error', 'overlap', `${model.nodes[i].id} overlaps ${model.nodes[j].id}.`, 'Report this layout bug, or move one part to another group or tier.', [model.nodes[i].id, model.nodes[j].id]);

  // Edges through parts they do not connect
  if (real) {
    for (const e of model.edges) {
      for (const n of model.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        if (segments(e).some(([a, b]) => segRect(a, b, n))) {
          add('error', 'edge-through', `Wire ${e.id} runs through ${n.id}.`, 'Change the declaration order of the parts, put them in a tier, or move the part into another group.', [e.id, n.id]);
          break;
        }
      }
    }
  }

  // Labels colliding with parts or other labels
  const labels = model.edges.filter((e) => e.labelBox).map((e) => ({ id: e.id, ...e.labelBox }));
  for (const l of labels) {
    for (const n of model.nodes) if (inter(l, n, 1)) add('warn', 'label-overlap', `Label of ${l.id} sits on ${n.id}.`, 'Shorten the label to a verb or protocol.', [l.id, n.id]);
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (inter(labels[i], labels[j], 1)) add('warn', 'label-overlap', `Labels of ${labels[i].id} and ${labels[j].id} overlap.`, 'Shorten one label or drop a label that only repeats the obvious.', [labels[i].id, labels[j].id]);

  // Crossings between wires that share no part
  let crossings = 0;
  const pairs = [];
  for (let i = 0; i < model.edges.length; i++) {
    for (let j = i + 1; j < model.edges.length; j++) {
      const a = model.edges[i];
      const b = model.edges[j];
      // Wires that share a part may meet near it; only crossings away from shared parts count.
      const shared = [a.from, a.to].filter((id) => id === b.from || id === b.to).map((id) => byId.get(id)).filter(Boolean);
      const nearShared = ([x, y]) => shared.some((n) => x > n.x - 20 && x < n.x + n.w + 20 && y > n.y - 20 && y < n.y + n.h + 20);
      let c = 0;
      for (const sa of segments(a)) {
        for (const sb of segments(b)) {
          if (!shared.length) { if (segCross(sa, sb)) c++; continue; }
          const pt = crossPoint(sa, sb);
          if (pt && !nearShared(pt)) c++;
        }
      }
      if (c) { crossings += c; pairs.push(`${a.id} × ${b.id}`); }
    }
  }
  if (crossings > Math.max(2, Math.round(model.edges.length * 0.2)))
    add('warn', 'crossings', `${crossings} wire crossings (${pairs.slice(0, 4).join(', ')}${pairs.length > 4 ? ', …' : ''}).`, 'Reorder parts inside a tier (declaration order is kept), group parts that talk to each other, or split the view.');
  else if (crossings) add('info', 'crossings', `${crossings} wire crossing${crossings > 1 ? 's' : ''}.`, '');

  // Backwards flow
  if (real && model.direction) {
    const axis = model.direction === 'right' || model.direction === 'left' ? 0 : 1;
    const sign = model.direction === 'right' || model.direction === 'down' ? 1 : -1;
    const back = model.edges.filter((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return a && b && !e.back && e.kind !== 'return' && (center(b)[axis] - center(a)[axis]) * sign < -4;
    });
    const mainBack = back.filter((e) => model.flows?.some((f) => f.primary && f.steps.some((s) => s.edge === e.id)));
    if (mainBack.length)
      add('warn', 'main-backwards', `The main flow runs backwards on ${mainBack.map((e) => e.id).join(', ')}.`, 'Give the parts tiers in reading order, or declare them in flow order.', mainBack.map((e) => e.id));
    if (back.length > Math.max(2, model.edges.length * 0.25))
      add('info', 'backwards', `${back.length} wires run against the flow direction.`, 'Expected for replies and callbacks; otherwise check tiers and declaration order.');
  }

  // Size and legibility
  if (nodes.length > maxNodes)
    add('warn', 'crowded', `${nodes.length} parts in one view (aim for ${maxNodes} or fewer).`, 'Split into an overview plus focused views, or collapse detail into one part per group.');
  const ratio = model.width / model.height;
  // Small pictures may be long; only large, lopsided ones hurt on screens and phones.
  if ((ratio > 3.2 && model.width > 1200) || (ratio < 0.33 && model.height > 1400))
    add('warn', 'aspect', `The picture is ${ratio > 1 ? 'very wide' : 'very tall'} (${ratio.toFixed(1)}:1).`, ratio > 1 ? 'Try direction: down, fewer tiers, or splitting the view.' : 'Try direction: right or splitting the view.');
  const scale = Math.min(1, phoneWidth / model.width);
  const px = S.label * scale;
  if (px < 5)
    add('info', 'phone', `On a ${phoneWidth}px phone the whole picture shows labels at ${px.toFixed(1)}px; readers will need to zoom.`, 'Fine for the interactive page; for a static image consider splitting the view.');

  // Unlabeled wires (C4: label every relationship), only where wires carry meaning.
  if (['architecture', 'system', 'dataflow', 'graph'].includes(model.kind)) {
    const bare = model.edges.filter((e) => !e.label && !model.nodes.find((n) => n.id === e.from)?.shape?.match(/start|diamond/));
    if (bare.length > Math.max(2, model.edges.length / 2))
      add('info', 'labels', `${bare.length} of ${model.edges.length} wires have no label.`, 'Label wires with a verb or protocol where it adds meaning; leave obvious ones bare.');
  }

  // Facts and approval
  if (model.brief && model.brief.status !== 'approved')
    add(strict ? 'error' : 'warn', 'approval', `The brief is "${model.brief.status}", not approved.`, 'Show the brief to the user and set status: approved once they agree.');
  const factIds = new Set(Object.keys(model.facts ?? {}));
  const elements = [...model.nodes.filter((n) => !n.role || n.role === 'participant'), ...model.edges, ...(model.groups ?? []).filter((g) => g.variant !== 'fragment')];
  const unknown = [];
  for (const el of elements) for (const f of el.facts ?? []) if (!factIds.has(f)) unknown.push(`${el.id}: ${f}`);
  if (unknown.length) add('error', 'facts', `Unknown fact ids: ${unknown.join(', ')}.`, 'Every fact id must exist in the brief.');
  const noSource = Object.entries(model.facts ?? {}).filter(([, f]) => (f.kind ?? 'fact') === 'fact' && !f.sources?.length).map(([k]) => k);
  if (noSource.length) add('warn', 'sources', `Facts without a source: ${noSource.join(', ')}.`, 'Add "(source: file:line or URL)" to each fact, or mark it as an assumption in the brief.');
  if (model.requireSources) {
    const groupIds = new Set((model.groups ?? []).map((g) => g.id));
    const bare = elements.filter((el) => !groupIds.has(el.id) && !el.facts?.length && !el.sources?.length).map((el) => el.id);
    if (bare.length) add('info', 'unsourced', `${bare.length} elements cite no fact: ${bare.slice(0, 6).join(', ')}${bare.length > 6 ? ', …' : ''}.`, 'Link parts and wires to brief facts or decisions (facts: [F1, D2]) so the page can show where they come from.');
  }

  const stats = { nodes: nodes.length, edges: model.edges.length, crossings, width: model.width, height: model.height };
  return { issues, stats, ok: !issues.some((i) => i.level === 'error') };
}

export function formatIssues({ issues, stats }) {
  const icon = { error: '✗', warn: '!', info: '·' };
  const head = `${stats.nodes} parts, ${stats.edges} wires, ${stats.crossings} crossings, ${stats.width}×${stats.height}px`;
  if (!issues.length) return `${head}\n✓ no issues`;
  return [head, ...issues.map((i) => `${icon[i.level]} ${i.message}${i.hint ? `\n    → ${i.hint}` : ''}`)].join('\n');
}
