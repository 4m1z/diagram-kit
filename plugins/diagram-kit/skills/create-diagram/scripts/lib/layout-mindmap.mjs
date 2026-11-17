// Mind maps: the root in the middle, branches split left and right by size, each side a tidy tree.
// Deterministic and stable: adding a leaf only moves its own branch.
import { sizeNode, pickInfo } from './model.mjs';

const GAP_X = 56;
const GAP_Y = 12;
const BRANCH_GAP = 22;

export async function layoutMindmap(spec) {
  const byId = new Map(spec.nodes.map((n) => [n.id, { ...n, size: sizeNode(n), kids: [] }]));
  for (const e of spec.edges) byId.get(e.from).kids.push(byId.get(e.to));
  const root = byId.get(spec.nodes[0].id);
  root.shape = root.shape ?? 'pill';
  root.tone = root.tone ?? 'accent';
  root.size = sizeNode(root);

  const leaves = (n) => (n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1);
  const left = [];
  const right = [];
  let lw = 0;
  let rw = 0;
  for (const k of root.kids) {
    // Fill the right side first, then balance by leaf count.
    if (rw <= lw) { right.push(k); rw += leaves(k); } else { left.push(k); lw += leaves(k); }
  }

  const height = (n) => {
    if (n._h != null) return n._h;
    const kidsH = n.kids.reduce((s, k) => s + height(k), 0) + Math.max(0, n.kids.length - 1) * GAP_Y;
    n._h = Math.max(n.size.h, kidsH);
    return n._h;
  };
  const colWidths = (list, depth = 1, acc = []) => {
    for (const n of list) {
      acc[depth] = Math.max(acc[depth] ?? 0, n.size.w);
      colWidths(n.kids, depth + 1, acc);
    }
    return acc;
  };

  const nodes = [];
  const edges = [];
  const place = (n, side, depth, top, colX) => {
    const h = height(n);
    const cy = top + h / 2;
    const w = n.size.w;
    const x = side > 0 ? colX[depth] : colX[depth] - w;
    nodes.push(out(n, x, cy - n.size.h / 2, depth));
    let y = top + (h - (n.kids.reduce((s, k) => s + height(k), 0) + Math.max(0, n.kids.length - 1) * GAP_Y)) / 2;
    for (const k of n.kids) {
      const kh = height(k);
      const kcy = y + kh / 2;
      const px = side > 0 ? x + w : x;
      const kx = side > 0 ? colX[depth + 1] : colX[depth + 1];
      edges.push({ id: `${n.id}->${k.id}`, from: n.id, to: k.id, kind: 'weak', curve: true, arrow: false, points: [[px, cy], [kx, kcy]] });
      place(k, side, depth + 1, y, colX);
      y += kh + GAP_Y;
    }
  };
  const out = (n, x, y, depth) => ({
    id: n.id, label: n.label, sub: n.sub, icon: n.icon, shape: n.shape ?? 'box', tone: n.tone,
    x, y, w: n.size.w, h: n.size.h, lines: n.size.lines, subLines: n.size.subLines, depth, ...pickInfo(n),
  });

  const rootX = 0;
  const rootW = root.size.w;
  nodes.push(out(root, rootX - rootW / 2, -root.size.h / 2, 0));
  for (const [list, side] of [[right, 1], [left, -1]]) {
    if (!list.length) continue;
    const widths = colWidths(list);
    const colX = [];
    colX[1] = side > 0 ? rootW / 2 + GAP_X : -rootW / 2 - GAP_X;
    for (let d = 2; d < widths.length + 1; d++) colX[d] = colX[d - 1] + side * ((widths[d - 1] ?? 0) + GAP_X);
    const total = list.reduce((s, k) => s + height(k), 0) + (list.length - 1) * BRANCH_GAP;
    let y = -total / 2;
    for (const k of list) {
      const kh = height(k);
      const px = side > 0 ? rootX + rootW / 2 : rootX - rootW / 2;
      edges.push({ id: `${root.id}->${k.id}`, from: root.id, to: k.id, kind: 'weak', curve: true, arrow: false, points: [[px, 0], [colX[1], y + kh / 2]] });
      place(k, side, 1, y, colX);
      y += kh + BRANCH_GAP;
    }
  }
  return { nodes, edges, groups: [] };
}
