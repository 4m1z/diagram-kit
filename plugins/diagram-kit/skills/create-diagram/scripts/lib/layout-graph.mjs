// Graph and tree layout with ELK Layered (elkjs). The spec decides meaning (tiers, groups, order,
// the main path); ELK decides coordinates and orthogonal routes.
import { dep } from './deps.mjs';
import { sizes as S } from '../../assets/viewer/theme.mjs';
import { sizeNode, edgeLabelSize, pickInfo } from './model.mjs';

const ELK = dep('elkjs/lib/elk.bundled.js');
const elk = new ELK();
const ELK_DIR = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };
const OUT_SIDE = { right: 'EAST', down: 'SOUTH', left: 'WEST', up: 'NORTH' };
const IN_SIDE = { right: 'WEST', down: 'NORTH', left: 'EAST', up: 'SOUTH' };

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
const GROUP_PADDING = '[top=40,left=18,bottom=18,right=18]';

export async function layoutGraph(spec, { options = {} } = {}) {
  const dir = spec.direction;
  const tierIndex = new Map(spec.tiers.map((t, i) => [t, i]));
  const byId = new Map();
  const childrenOf = new Map([[null, []]]);
  const ensure = (id) => { if (!childrenOf.has(id)) childrenOf.set(id, []); return childrenOf.get(id); };

  // Groups first (declaration order is model order), then nodes, each under its parent.
  for (const g of spec.groups) {
    const elkGroup = { id: g.id, layoutOptions: { 'elk.padding': GROUP_PADDING, ...(g.layout ?? {}) }, children: [] };
    byId.set(g.id, { kind: 'group', spec: g, elk: elkGroup });
    ensure(g.parent ?? null).push(elkGroup);
    ensure(g.id);
  }
  for (const n of spec.nodes) {
    const size = sizeNode(n);
    const elkNode = { id: n.id, width: size.w, height: size.h, ports: [], layoutOptions: { ...(n.layout ?? {}) } };
    byId.set(n.id, { kind: 'node', spec: n, elk: elkNode, size });
    ensure(n.group ?? null).push(elkNode);
  }
  for (const [parent, kids] of childrenOf) {
    if (parent === null) continue;
    const entry = byId.get(parent);
    entry.elk.children = kids;
  }

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
      if (parent === null) continue;
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
    node.ports.push({ id, width: 0, height: 0, layoutOptions: { 'elk.port.side': side } });
    if (!node.layoutOptions['elk.portConstraints']) node.layoutOptions['elk.portConstraints'] = 'FIXED_SIDE';
    return id;
  };

  const mainEdges = new Set();
  for (const f of spec.flows) if (f.primary) for (const s of f.steps) mainEdges.add(s.edge);

  const elkEdges = spec.edges.map((e) => {
    const sideOut = e.fromField ? 'EAST' : OUT_SIDE[dir];
    const sideIn = e.toField ? 'WEST' : IN_SIDE[dir];
    const edge = {
      id: e.id,
      sources: [portFor(e.from, e.fromField, sideOut, e.id, 'out')],
      targets: [portFor(e.to, e.toField, sideIn, e.id, 'in')],
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
  });

  const graph = {
    id: 'root',
    layoutOptions: {
      ...GRAPH_OPTIONS,
      'elk.direction': ELK_DIR[dir],
      ...(partitioned ? { 'elk.partitioning.activate': true } : {}),
      ...(spec.engine === 'tree' ? { 'elk.layered.mergeEdges': true, 'elk.layered.spacing.nodeNodeBetweenLayers': 44 } : {}),
      ...(spec.layout ?? {}),
      ...options,
    },
    children: childrenOf.get(null),
    edges: elkEdges,
  };
  for (const entry of byId.values()) if (!entry.elk.ports?.length) delete entry.elk.ports;

  let out;
  try {
    out = await elk.layout(graph);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0].slice(0, 240);
    throw new Error(`The layout engine failed (${msg}). If the spec sets raw "layout:" options, remove them and retry.`);
  }

  // Read positions back (ROOT coordinates for shapes and edges).
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
    return { id: g.id, label: g.label, x: p.x, y: p.y, w: p.width, h: p.height, depth: depth.get(g.id), parent: g.parent, ...pickInfo(g) };
  });
  const edgeOut = new Map();
  const collectEdges = (container) => {
    for (const e of container.edges ?? []) edgeOut.set(e.id, e);
    for (const c of container.children ?? []) collectEdges(c);
  };
  collectEdges(out);
  const edges = spec.edges.map((e) => {
    const r = edgeOut.get(e.id);
    const sec = r.sections?.[0];
    const points = sec
      ? [[sec.startPoint.x, sec.startPoint.y], ...(sec.bendPoints ?? []).map((b) => [b.x, b.y]), [sec.endPoint.x, sec.endPoint.y]]
      : [];
    const lab = r.labels?.[0];
    return {
      id: e.id, from: e.from, to: e.to, kind: e.kind, label: e.label, points,
      ...(e.back ? { back: true } : {}),
      ...(spec.engine === 'tree' ? { arrow: false } : {}),
      labelBox: lab && e.label ? { x: lab.x, y: lab.y, w: lab.width, h: lab.height } : null,
      ...pickInfo(e),
    };
  });
  return { nodes, groups, edges, elkInput: graph };
}
