// Sequence diagrams: a deterministic layout (no solver needed). Columns are spaced so every
// message label fits between its lifelines; rows follow message order; blocks wrap their rows.
import { sizes as S } from '../../assets/viewer/theme.mjs';
import { measure, wrap } from './metrics.mjs';
import { sizeNode, edgeLabelSize, pickInfo, FONT } from './model.mjs';

const GAP = 56; // minimum space between participant boxes
const ROW = 42; // message row height (label above the arrow)
const SELF_ROW = 58;
const BLOCK_HEAD = 32;
const BLOCK_FOOT = 12;
const BAR_W = 10;

export function layoutSequence(spec) {
  const parts = spec.participants.map((p) => ({ ...p, size: sizeNode(p) }));
  const index = new Map(parts.map((p, i) => [p.id, i]));
  const headH = Math.max(...parts.map((p) => p.size.h));

  // 1. Column centres: start from box widths, then widen for message labels.
  const x = [];
  parts.forEach((p, i) => {
    x[i] = i === 0 ? p.size.w / 2 : x[i - 1] + parts[i - 1].size.w / 2 + GAP + p.size.w / 2;
  });
  const needs = [];
  const visitNeeds = (items) => {
    for (const it of items) {
      if (it.type === 'block') { visitNeeds(it.items); for (const b of it.else) visitNeeds(b.items); continue; }
      if (it.type === 'note') {
        const w = Math.min(240, measure(it.text, FONT.note) + 24);
        if (it.over.length === 1) {
          const i = index.get(it.over[0]);
          if (i < parts.length - 1) needs.push([i, i + 1, w / 2 + 28]);
        }
        continue;
      }
      const a = index.get(it.from);
      const b = index.get(it.to);
      const lw = it.label ? edgeLabelSize(it.label).w + (spec.numbered ? 26 : 0) : 0;
      if (a === b) { if (a < parts.length - 1) needs.push([a, a + 1, lw + 64]); }
      else needs.push([Math.min(a, b), Math.max(a, b), lw + 36]);
    }
  };
  visitNeeds(spec.items);
  needs.sort((p, q) => (p[1] - p[0]) - (q[1] - q[0]));
  for (const [lo, hi, need] of needs) {
    const have = x[hi] - x[lo];
    if (have < need) for (let k = hi; k < x.length; k++) x[k] += need - have;
  }

  // 2. Rows, activations, blocks and notes, in order.
  const nodes = parts.map((p, i) => ({
    id: p.id, label: p.label, sub: p.sub, icon: p.icon, shape: 'box', role: 'participant',
    x: x[i] - p.size.w / 2, y: 0, w: p.size.w, h: headH, lines: p.size.lines, subLines: p.size.subLines, ...pickInfo(p),
  }));
  const edges = [];
  const groups = [];
  const lines = [];
  const bars = [];
  const open = new Map(parts.map((p) => [p.id, []])); // stacks of activation start y
  let y = headH + 30;
  let stepNo = 0;
  const steps = [];

  const barEdge = (id, towardX) => {
    const depth = open.get(id).length;
    const cx = x[index.get(id)];
    if (!depth) return cx;
    const off = (depth - 1) * 5;
    return towardX > cx ? cx + off + BAR_W / 2 : cx + off - BAR_W / 2;
  };
  const closeBar = (id, at) => {
    const stack = open.get(id);
    const start = stack.pop();
    if (start == null) return;
    const depth = stack.length;
    bars.push({ owner: id, x: x[index.get(id)] - BAR_W / 2 + depth * 5, y: start, w: BAR_W, h: Math.max(14, at - start) });
  };

  const involved = (items, set = new Set()) => {
    for (const it of items) {
      if (it.type === 'block') { involved(it.items, set); for (const b of it.else) involved(b.items, set); }
      else if (it.type === 'note') it.over.forEach((o) => set.add(index.get(o)));
      else { set.add(index.get(it.from)); set.add(index.get(it.to)); }
    }
    return set;
  };

  const place = (items, depth) => {
    for (const it of items) {
      if (it.type === 'block') {
        const cols = [...involved([it])];
        const top = y;
        y += BLOCK_HEAD;
        // Each branch starts from the activations that were open when the block began.
        const snapshot = new Map([...open].map(([k, v]) => [k, [...v]]));
        place(it.items, depth + 1);
        const after = new Map([...open].map(([k, v]) => [k, [...v]]));
        const dividers = [];
        for (const b of it.else) {
          const label = b.label ? `[${b.label}]` : '';
          dividers.push({ y: y + 4, label, labelW: label ? measure(label, FONT.edge) + 8 : 0 });
          y += 28;
          for (const [k, v] of snapshot) open.set(k, [...v]);
          place(b.items, depth + 1);
        }
        if (it.else.length) for (const [k, v] of after) open.set(k, v);
        y += BLOCK_FOOT;
        const tagW = Math.ceil(measure(it.block, { face: 'mono', weight: 500, size: 10 }) + 22);
        const inset = depth * 10;
        const left = Math.min(...cols.map((c) => x[c])) - Math.max(tagW + 16, 52) + inset;
        const right = Math.max(...cols.map((c) => x[c])) + 40 - inset;
        const labelW = it.label ? measure(it.label, FONT.edge) + 16 : 0;
        const w = Math.max(right - left, tagW + labelW + 16);
        groups.push({ id: `block-${groups.length + 1}`, variant: 'fragment', tag: it.block, tagW, label: it.label, labelW: it.label ? measure(it.label, FONT.edge) + 8 : 0, x: left, y: top, w, h: y - top - 4, depth });
        for (const d of dividers) lines.push({ kind: 'divider', x1: left, y1: d.y, x2: left + w, y2: d.y, label: d.label, labelW: d.labelW });
        y += 6;
        continue;
      }
      if (it.type === 'note') {
        const cols = it.over.map((o) => x[index.get(o)]);
        const textLines = wrap(it.text, FONT.note, 220, 6);
        const w = Math.max(...textLines.map((l) => measure(l, FONT.note))) + 24;
        const h = textLines.length * 16 + 16;
        const cx = (Math.min(...cols) + Math.max(...cols)) / 2;
        const width = Math.max(w, Math.max(...cols) - Math.min(...cols) + 40);
        nodes.push({ id: `note-${nodes.length}`, label: it.text, lines: textLines, shape: 'note', role: 'note', x: cx - width / 2, y: y + 4, w: width, h });
        y += h + 18;
        continue;
      }
      // Message
      stepNo += 1;
      const self = it.from === it.to;
      const xa = x[index.get(it.from)];
      const xb = x[index.get(it.to)];
      const rowH = self ? SELF_ROW : ROW;
      const ay = y + 26;
      if (it.kind === 'return') {
        // A reply ends the callee's activation before the arrow leaves it.
        const sx = barEdge(it.from, xb);
        closeBar(it.from, ay);
        it._sx = sx;
      }
      const sx = it._sx ?? barEdge(it.from, xb);
      let points;
      if (self) {
        const ex = barEdge(it.to, xa + 1) + (open.get(it.to).length ? 0 : 0);
        points = [[sx, ay - 8], [sx + 34, ay - 8], [sx + 34, ay + 10], [ex, ay + 10]];
      } else {
        // A call activates the callee until its reply; async messages do not block anyone.
        if (it.kind === 'sync') open.get(it.to).push(ay);
        const ex = barEdge(it.to, xa);
        points = [[sx, ay], [ex, ay]];
      }
      let labelBox = null;
      if (it.label) {
        const { w, h } = edgeLabelSize(it.label);
        const lx = self ? sx + (spec.numbered ? 62 : 42) : (sx + points[points.length - 1][0]) / 2 - w / 2 + (spec.numbered ? 9 : 0);
        labelBox = { x: lx, y: self ? ay - 9 - h / 2 + 9 : ay - h - 5, w, h };
      }
      const edge = { id: it.id, from: it.from, to: it.to, kind: it.kind, label: it.label, points, labelBox, ...pickInfo(it) };
      if (spec.numbered) {
        const bx = labelBox ? labelBox.x - 11 : (points[0][0] + points[1][0]) / 2;
        const by = labelBox ? labelBox.y + labelBox.h / 2 : ay - 12;
        edge.badges = [{ flow: 'sequence', step: stepNo, x: bx, y: by }];
      }
      edges.push(edge);
      steps.push({ edge: it.id, text: it.label ?? '' });
      y += rowH;
    }
  };
  place(spec.items, 0);

  // Close anything still active at the end.
  const end = y + 12;
  for (const p of parts) while (open.get(p.id).length) closeBar(p.id, end - 6);
  parts.forEach((p, i) => lines.unshift({ id: p.id, kind: 'lifeline', x1: x[i], y1: headH, x2: x[i], y2: end }));

  const flows = [{ id: 'sequence', label: spec.title || 'Sequence', primary: true, steps }];
  return { nodes, edges, groups, lines, bars, flows };
}
