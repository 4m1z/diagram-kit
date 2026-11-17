// Graph and tree layout with ELK Layered (elkjs). The spec decides meaning (tiers, groups, order,
// the main path); ELK decides coordinates and orthogonal routes.
import { dep } from './deps.mjs';
import { sizes as S } from '../../assets/viewer/theme.mjs';
import { sizeNode, edgeLabelSize, pickInfo, FONT } from './model.mjs';
import { measure } from './metrics.mjs';

const ELK = dep('elkjs/lib/elk.bundled.js');
const elk = new ELK();
const ELK_DIR = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };
const OUT_SIDE = { right: 'EAST', down: 'SOUTH', left: 'WEST', up: 'NORTH' };
const IN_SIDE = { right: 'WEST', down: 'NORTH', left: 'EAST', up: 'SOUTH' };
// An intended back wire (`back: true`) inside one group (a loop, such as a retry) leaves and
// arrives on this side, so the main line keeps the flow sides to itself and stays straight. A
// back wire across groups (a callback to another area) keeps the flow sides.
const BACK_SIDE = { right: 'SOUTH', down: 'EAST', left: 'SOUTH', up: 'EAST' };

// Defaults chosen from the layout bench (2026-11-17): model order + partitions + ports read best.
export const GRAPH_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // In a cycle, the edge declared first runs forward (bench: no extra crossings; MODEL_ORDER crashed).
  'elk.layered.cycleBreaking.strategy': 'GREEDY_MODEL_ORDER',
  'elk.layered.thoroughness': 40,
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.spacing.nodeNode': 26,
  'elk.layered.spacing.nodeNodeBetweenLayers': 60,
  'elk.spacing.edgeNode': 16,
  'elk.spacing.edgeEdge': 12,
  'elk.layered.spacing.edgeNodeBetweenLayers': 18,
  'elk.layered.spacing.edgeEdgeBetweenLayers': 12,
  'elk.spacing.edgeLabel': 4,
  'elk.spacing.labelNode': 6,
  'elk.spacing.componentComponent': 48,
  'elk.edgeLabels.inline': false,
};
const GROUP_SIDE = 18;
const GROUP_PADDING = `[top=40,left=${GROUP_SIDE},bottom=${GROUP_SIDE},right=${GROUP_SIDE}]`;
// How far outside its group a loop's return line runs.
const LOOP_GAP = 20;
// With `layout: { sameSize: ... }` a label may run this much wider than usual before it wraps.
const EVEN_TEXT = 1.4;

// More room between parts, rows and wires, with parts kept at their size. For media that need
// space (a 3D world, a wall screen); positions stay in the same reading order.
export const SPACING_KEYS = [
  'elk.spacing.nodeNode', 'elk.layered.spacing.nodeNodeBetweenLayers', 'elk.spacing.edgeNode', 'elk.spacing.edgeEdge',
  'elk.layered.spacing.edgeNodeBetweenLayers', 'elk.layered.spacing.edgeEdgeBetweenLayers', 'elk.spacing.componentComponent',
];
export function spacingOptions(factor) {
  const f = Number(factor);
  if (!(f > 0)) throw new Error('--spacing needs a positive number, for example 2 or 4.');
  return Object.fromEntries(SPACING_KEYS.map((k) => [k, Math.round(GRAPH_OPTIONS[k] * f)]));
}

// The spec's `layout:` may say `spacing: 1.5` instead of the seven raw ELK spacing keys.
function specLayout(spec) {
  const { spacing, sameSize, ...rest } = spec.layout ?? {};
  return spacing == null ? rest : { ...spacingOptions(spacing), ...rest };
}

export async function layoutGraph(spec, { options = {} } = {}) {
  const dir = spec.direction;
  const fromSpec = specLayout(spec);
  const tierIndex = new Map(spec.tiers.map((t, i) => [t, i]));
  const byId = new Map();
  const childrenOf = new Map([[null, []]]);
  const ensure = (id) => { if (!childrenOf.has(id)) childrenOf.set(id, []); return childrenOf.get(id); };

  // Groups first (declaration order is model order), then nodes, each under its parent.
  for (const g of spec.groups) {
    // A group with an icon is a part holding smaller parts: its name row on top and snug padding.
    const container = g.icon ? {
      'elk.padding': `[top=${S.containerHead},left=12,bottom=12,right=12]`,
      'elk.spacing.nodeNode': 12,
      // Its parts are often unconnected (a set of options); keep them in one row, not packed apart.
      'elk.separateConnectedComponents': false,
    } : { 'elk.padding': GROUP_PADDING };
    const elkGroup = { id: g.id, layoutOptions: { ...container, ...(g.layout ?? {}) }, children: [] };
    // At least as wide as its name (applied after its own layout: ELK swaps a minimum size's sides
    // in a top-to-bottom layout with INCLUDE_CHILDREN).
    const minW = g.icon ? Math.ceil(2 * S.padX + S.icon + S.iconGap + measure(g.label ?? '', FONT.label)) : 0;
    byId.set(g.id, { kind: 'group', spec: g, elk: elkGroup, minW });
    ensure(g.parent ?? null).push(elkGroup);
    ensure(g.id);
  }
  // `sameSize`: parts in a set share one width and one height (the largest). `true` is one set of
  // every box and pill; a list of part ids is one set; a list of lists is several sets. Labels wrap
  // later than usual, so short and long labels can share a size.
  const sameSize = spec.layout?.sameSize;
  const sets = sameSize === true ? [spec.nodes.filter((n) => ['box', 'pill'].includes(n.shape ?? 'box')).map((n) => n.id)]
    : Array.isArray(sameSize) ? (sameSize.every(Array.isArray) ? sameSize : [sameSize]) : [];
  const textW = Math.round(S.maxLabelW * EVEN_TEXT);
  const evenSize = new Map();
  for (const set of sets) {
    const members = spec.nodes.filter((n) => set.map(String).includes(n.id));
    const w = Math.max(0, ...members.map((n) => sizeNode(n, { textW }).w));
    const h = Math.max(0, ...members.map((n) => sizeNode(n, { textW, minW: w }).h));
    for (const n of members) evenSize.set(n.id, { ...sizeNode(n, { textW, minW: w }), h });
  }
  for (const n of spec.nodes) {
    const size = evenSize.get(n.id) ?? sizeNode(n);
    const elkNode = { id: n.id, width: size.w, height: size.h, ports: [], layoutOptions: { ...(n.layout ?? {}) } };
    byId.set(n.id, { kind: 'node', spec: n, elk: elkNode, size });
    ensure(n.group ?? null).push(elkNode);
  }
  for (const [parent, kids] of childrenOf) {
    if (parent === null) continue;
    const entry = byId.get(parent);
    entry.elk.children = kids;
  }

  // A group with its own direction (a pipeline across a top-to-bottom story) is a block: ELK lays
  // its parts out on their own, then places the block as one box. ELK cannot mix directions in one
  // pass, and a wire into a block is drawn on to the part it reaches.
  // A group with an icon (a part holding smaller parts) is a block too, so wires stop at its border.
  const blocks = new Map(spec.groups.filter((g) => (g.direction && g.direction !== dir) || g.icon).map((g) => [g.id, { spec: g }]));
  const blockOf = (id) => { const e = byId.get(id); return e?.kind === 'node' && blocks.has(e.spec.group) ? e.spec.group : null; };

  // Tiers become ELK partitions on the top-level elements (columns in the flow direction).
  const tierOf = (id) => {
    const e = byId.get(id);
    if (e.spec.tier != null) return tierIndex.get(String(e.spec.tier));
    if (e.kind === 'group') {
      const kids = (childrenOf.get(id) ?? []).map((k) => tierOf(k.id)).filter((t) => t != null);
      return kids.length ? Math.min(...kids) : null;
    }
    return null;
  };
  const partitioned = spec.tiers.length > 0;
  if (partitioned) {
    for (const top of childrenOf.get(null)) {
      const t = tierOf(top.id);
      if (t != null) top.layoutOptions = { ...(top.layoutOptions ?? {}), 'elk.partitioning.partition': t };
    }
    for (const [parent, kids] of childrenOf) {
      if (parent === null || blocks.has(parent)) continue;
      for (const k of kids) {
        const t = byId.get(k.id).spec.tier;
        if (t != null) k.layoutOptions = { ...(k.layoutOptions ?? {}), 'elk.partitioning.partition': tierIndex.get(String(t)) };
      }
    }
  }

  // Ports: wires leave on the flow side and arrive on the opposite side. Table fields get fixed
  // ports at their row so relationships land on the exact column.
  const portFor = (nodeId, field, side, edgeId, role) => {
    const entry = byId.get(nodeId);
    const node = entry.elk;
    if (entry.spec.shape === 'table') {
      // Fields get a port at their row; a wire to the table itself attaches at the header.
      const idx = field ? entry.spec.fields.findIndex((f) => f.name === field) : -1;
      const y = idx >= 0 ? S.tableHeader + idx * S.tableRow + S.tableRow / 2 : S.tableHeader / 2;
      const east = side === 'EAST' || side === 'SOUTH';
      const id = `${nodeId}.${field ?? '_'}.${east ? 'e' : 'w'}`;
      if (!node.ports.some((p) => p.id === id)) {
        node.ports.push({ id, width: 0, height: 0, x: east ? node.width : 0, y, layoutOptions: { 'elk.port.side': east ? 'EAST' : 'WEST' } });
      }
      node.layoutOptions['elk.portConstraints'] = 'FIXED_POS';
      return id;
    }
    const id = `${edgeId}.${role}`;
    (node.ports ??= []).push({ id, width: 0, height: 0, layoutOptions: { 'elk.port.side': side } });
    if (!node.layoutOptions['elk.portConstraints']) node.layoutOptions['elk.portConstraints'] = 'FIXED_SIDE';
    return id;
  };

  const mainEdges = new Set();
  for (const f of spec.flows) if (f.primary) for (const s of f.steps) mainEdges.add(s.edge);

  // Back wires into the same part share one port; after layout they share one return line too.
  const loops = new Map();
  const loopIn = (nodeId, side) => {
    const node = byId.get(nodeId).elk;
    const id = `${nodeId}.loop.in`;
    if (!(node.ports ??= []).some((p) => p.id === id)) node.ports.push({ id, width: 0, height: 0, layoutOptions: { 'elk.port.side': side } });
    if (!node.layoutOptions['elk.portConstraints']) node.layoutOptions['elk.portConstraints'] = 'FIXED_SIDE';
    return id;
  };

  const makeEdge = (e, d, source, target) => {
    const [a, b] = [byId.get(e.from), byId.get(e.to)];
    const local = a?.kind === 'node' && b?.kind === 'node' && a.spec.group === b.spec.group;
    const loop = e.back && local && !e.fromField && !e.toField && !source && !target ? BACK_SIDE[d] : null;
    if (loop) loops.set(e.id, loop);
    const edge = {
      id: e.id,
      sources: [source ?? portFor(e.from, e.fromField, e.fromField ? 'EAST' : loop ?? OUT_SIDE[d], e.id, 'out')],
      targets: [target ?? (loop ? loopIn(e.to, loop) : portFor(e.to, e.toField, e.toField ? 'WEST' : IN_SIDE[d], e.id, 'in'))],
      layoutOptions: {},
    };
    if (e.label) {
      const { w, h } = edgeLabelSize(e.label);
      edge.labels = [{ id: `${e.id}.label`, text: e.label, width: w, height: h }];
    }
    if (mainEdges.has(e.id) || e.main) {
      edge.layoutOptions['elk.layered.priority.straightness'] = 10;
      edge.layoutOptions['elk.layered.priority.direction'] = 10;
    }
    if (e.kind === 'return' || e.back) edge.layoutOptions['elk.layered.priority.direction'] = 0;
    return edge;
  };

  const spacingOf = (opts) => Object.fromEntries(Object.entries(opts).filter(([k]) => k.includes('spacing')));
  const rootOptions = { ...GRAPH_OPTIONS, ...fromSpec, ...options };

  // Lay each block out on its own first: its size and inner positions decide where wires attach.
  for (const [id, b] of blocks) {
    const g = b.spec;
    const kids = childrenOf.get(id);
    for (const k of kids) delete k.layoutOptions['elk.partitioning.partition'];
    const { 'elk.partitioning.partition': _, ...own } = byId.get(id).elk.layoutOptions;
    const inner = spec.edges.filter((e) => blockOf(e.from) === id && blockOf(e.to) === id);
    const sub = {
      id,
      layoutOptions: { ...GRAPH_OPTIONS, ...spacingOf(rootOptions), 'elk.direction': ELK_DIR[g.direction ?? dir], ...own },
      children: kids,
      edges: inner.map((e) => makeEdge(e, g.direction ?? dir)),
    };
    try {
      b.out = await elk.layout(sub);
    } catch (err) {
      throw new Error(`The layout engine failed on group "${id}" (${String(err?.message ?? err).split('\n')[0].slice(0, 200)}).`);
    }
    b.inner = new Set(inner.map((e) => e.id));
    b.at = new Map(b.out.children.map((c) => [c.id, c]));
    // In the main layout the block is one box with ports fixed where its wires attach.
    const box = byId.get(id).elk;
    box.width = Math.max(b.out.width, byId.get(id).minW);
    box.height = b.out.height;
    box.children = [];
    box.ports = [];
    box.layoutOptions = { ...(box.layoutOptions['elk.partitioning.partition'] != null ? { 'elk.partitioning.partition': box.layoutOptions['elk.partitioning.partition'] } : {}), 'elk.portConstraints': 'FIXED_POS' };
  }
  // A port on a block's border, in line with the part the wire reaches (or centred for the block).
  const blockPort = (id, part, side, edgeId, role) => {
    const b = blocks.get(id);
    const box = byId.get(id).elk;
    const c = part ? b.at.get(part) : null;
    const cx = c ? c.x + c.width / 2 : box.width / 2;
    const cy = c ? c.y + c.height / 2 : box.height / 2;
    const [x, y] = { NORTH: [cx, 0], SOUTH: [cx, box.height], WEST: [0, cy], EAST: [box.width, cy] }[side];
    const portId = `${edgeId}.${role}`;
    box.ports.push({ id: portId, width: 0, height: 0, x, y, layoutOptions: { 'elk.port.side': side } });
    return portId;
  };
  const end = (e, which) => {
    const id = which === 'from' ? e.from : e.to;
    const side = which === 'from' ? OUT_SIDE[dir] : IN_SIDE[dir];
    const role = which === 'from' ? 'out' : 'in';
    if (blocks.has(id)) return blockPort(id, null, side, e.id, role);
    const b = blockOf(id);
    return b ? blockPort(b, id, side, e.id, role) : null;
  };
  const elkEdges = spec.edges
    .filter((e) => !(blockOf(e.from) && blockOf(e.from) === blockOf(e.to)))
    .map((e) => makeEdge(e, dir, end(e, 'from'), end(e, 'to')));

  const graph = {
    id: 'root',
    layoutOptions: {
      ...GRAPH_OPTIONS,
      'elk.direction': ELK_DIR[dir],
      ...(partitioned ? { 'elk.partitioning.activate': true } : {}),
      ...(spec.engine === 'tree' ? { 'elk.layered.mergeEdges': true, 'elk.layered.spacing.nodeNodeBetweenLayers': 44 } : {}),
      ...fromSpec,
      ...options,
    },
    children: childrenOf.get(null),
    edges: elkEdges,
  };
  for (const entry of byId.values()) if (!entry.elk.ports?.length) delete entry.elk.ports;
  // ELK reads spacing from each group's own options and otherwise falls back to its own defaults
  // (20 between rows), so every group gets the same spacing as the root: one rhythm everywhere.
  const rootSpacing = Object.fromEntries(Object.entries(graph.layoutOptions).filter(([k]) => k.includes('spacing')));
  for (const entry of byId.values()) if (entry.kind === 'group') entry.elk.layoutOptions = { ...rootSpacing, ...entry.elk.layoutOptions };

  let out;
  try {
    out = await elk.layout(graph);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0].slice(0, 240);
    throw new Error(`The layout engine failed (${msg}). If the spec sets raw "layout:" options, remove them and retry.`);
  }

  // Read positions back (ROOT coordinates for shapes and edges). A block's parts move with it.
  const pos = new Map();
  const depth = new Map();
  const walk = (list, d) => {
    for (const c of list ?? []) {
      pos.set(c.id, c);
      depth.set(c.id, d);
      walk(c.children, d + 1);
    }
  };
  walk(out.children, 0);
  for (const [id, b] of blocks) {
    const p = pos.get(id);
    for (const c of b.out.children) {
      pos.set(c.id, { ...c, x: p.x + c.x, y: p.y + c.y });
      depth.set(c.id, depth.get(id) + 1);
    }
  }

  const nodes = spec.nodes.map((n) => {
    const p = pos.get(n.id);
    const { size } = byId.get(n.id);
    return {
      id: n.id, label: n.label, sub: n.sub, icon: n.icon, shape: n.shape ?? 'box',
      x: p.x, y: p.y, w: p.width, h: p.height, lines: size.lines, subLines: size.subLines,
      group: n.group, fields: n.fields, ...pickInfo(n),
    };
  });
  const groups = spec.groups.map((g) => {
    const p = pos.get(g.id);
    return { id: g.id, label: g.label, ...(g.icon ? { icon: g.icon } : {}), x: p.x, y: p.y, w: p.width, h: p.height, depth: depth.get(g.id), parent: g.parent, ...(blocks.has(g.id) && g.direction ? { direction: g.direction } : {}), ...pickInfo(g) };
  });
  const edgeOut = new Map();
  const collectEdges = (container, dx = 0, dy = 0) => {
    for (const e of container.edges ?? []) edgeOut.set(e.id, { e, dx, dy });
    for (const c of container.children ?? []) collectEdges(c, dx, dy);
  };
  collectEdges(out);
  for (const [id, b] of blocks) collectEdges(b.out, pos.get(id).x, pos.get(id).y);
  // A wire into or out of a block ends on its border; carry it on, straight, to the part's side.
  const sideOf = (rect, side, [x, y]) => ({ NORTH: [x, rect.y], SOUTH: [x, rect.y + rect.height], WEST: [rect.x, y], EAST: [rect.x + rect.width, y] })[side];
  const edges = spec.edges.map((e) => {
    const { e: r, dx, dy } = edgeOut.get(e.id);
    const sec = r.sections?.[0];
    let points = sec
      ? [[sec.startPoint.x, sec.startPoint.y], ...(sec.bendPoints ?? []).map((b) => [b.x, b.y]), [sec.endPoint.x, sec.endPoint.y]].map(([x, y]) => [x + dx, y + dy])
      : [];
    const into = blockOf(e.to) && blockOf(e.to) !== blockOf(e.from);
    const outOf = blockOf(e.from) && blockOf(e.from) !== blockOf(e.to);
    if (points.length && into) points.push(sideOf(pos.get(e.to), IN_SIDE[dir], points.at(-1)));
    if (points.length && outOf) points.unshift(sideOf(pos.get(e.from), OUT_SIDE[dir], points[0]));
    if (into || outOf) points = points.filter((p, i, a) => i === 0 || i === a.length - 1 || !((a[i - 1][0] === p[0] && p[0] === a[i + 1][0]) || (a[i - 1][1] === p[1] && p[1] === a[i + 1][1])));
    const lab = r.labels?.[0];
    const labelBox = lab && e.label ? { x: lab.x + dx, y: lab.y + dy, w: lab.width, h: lab.height } : null;
    return {
      id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label, points,
      ...(e.back ? { back: true } : {}),
      ...(spec.engine === 'tree' ? { arrow: false } : {}),
      labelBox,
      ...pickInfo(e),
    };
  });
  // ELK routes each loop on its own line beside the parts, inside their group, and may cross them.
  // Loops into the same part share one return line instead. In a group, the group shrinks back to
  // its contents on that side and the line runs just outside it, so the group stays clean.
  const intoSame = new Map();
  for (const e of edges) if (loops.has(e.id) && e.points.length >= 2) intoSame.set(e.to, [...(intoSame.get(e.to) ?? []), e]);
  const inGroup = (id, gid) => {
    for (let e = byId.get(id); e; e = byId.get(e.kind === 'node' ? e.spec.group : e.spec.parent)) if ((e.kind === 'node' ? e.spec.group : e.spec.parent) === gid) return true;
    return false;
  };
  for (const list of intoSame.values()) {
    const side = loops.get(list[0].id);
    const axis = side === 'EAST' || side === 'WEST' ? 0 : 1;
    const sign = side === 'EAST' || side === 'SOUTH' ? 1 : -1;
    const far = (r) => (axis === 0 ? (sign > 0 ? r.x + r.w : r.x) : (sign > 0 ? r.y + r.h : r.y));
    const gid = byId.get(list[0].to).spec.group;
    const g = gid ? groups.find((x) => x.id === gid) : null;
    let line;
    if (g) {
      const loopIds = new Set(list.map((e) => e.id));
      const extents = [
        ...nodes.filter((n) => inGroup(n.id, gid)).map(far),
        ...groups.filter((x) => x.id !== gid && inGroup(x.id, gid)).map(far),
        ...edges.filter((e) => !loopIds.has(e.id) && inGroup(e.from, gid) && inGroup(e.to, gid)).flatMap((e) => [
          ...e.points.map((p) => p[axis]),
          ...(e.labelBox ? [far(e.labelBox)] : []),
        ]),
      ];
      const edge = (sign > 0 ? Math.max : Math.min)(...extents) + sign * GROUP_SIDE;
      if (axis === 0 && sign > 0) g.w = Math.min(g.w, edge - g.x);
      else if (axis === 0) { g.w = Math.min(g.w, g.x + g.w - edge); g.x = Math.max(g.x, edge); }
      else if (sign > 0) g.h = Math.min(g.h, edge - g.y);
      else { g.h = Math.min(g.h, g.y + g.h - edge); g.y = Math.max(g.y, edge); }
      line = far(g) + sign * LOOP_GAP;
    } else {
      if (list.length < 2) continue;
      const outward = sign > 0 ? Math.max : Math.min;
      line = (sign > 0 ? Math.min : Math.max)(...list.map((e) => outward(...e.points.map((p) => p[axis]))));
    }
    for (const e of list) {
      const [a, b] = [e.points[0], e.points.at(-1)];
      e.points = axis === 0 ? [a, [line, a[1]], [line, b[1]], b] : [a, [a[0], line], [b[0], line], b];
    }
    // The label sits beside the return line, on its outer side, halfway along it.
    const span = list.flatMap((e) => e.points.map((p) => p[1 - axis]));
    const mid = (Math.min(...span) + Math.max(...span)) / 2;
    for (const e of list) {
      if (!e.labelBox) continue;
      const L = e.labelBox;
      if (axis === 0) { L.x = sign > 0 ? line + 6 : line - 6 - L.w; L.y = mid - L.h / 2; }
      else { L.y = sign > 0 ? line + 4 : line - 4 - L.h; L.x = mid - L.w / 2; }
    }
    // The shared stretch is drawn once (two dashed lines on top of each other look solid): the wire
    // that starts furthest away draws the whole return line and the arrow; the others stop where
    // they join it, without an arrowhead.
    const reach = (e) => Math.abs(e.points[0][1 - axis] - e.points.at(-1)[1 - axis]);
    const [, ...joining] = [...list].sort((x, y) => reach(y) - reach(x));
    for (const e of joining) {
      e.points = e.points.slice(0, 2);
      e.arrow = false;
    }
  }
  return { nodes, groups, edges, elkInput: graph };
}
