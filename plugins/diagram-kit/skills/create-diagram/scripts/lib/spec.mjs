// Loads a diagram spec (YAML or JSON) and normalizes it into one shape per engine.
// Specs carry meaning only: parts, tiers, groups, flows. Never coordinates.
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { dep } from './deps.mjs';
import { TONES } from '../../assets/viewer/theme.mjs';
import { EDGE_KINDS } from '../../assets/viewer/render.mjs';

const YAML = dep('yaml');

export class SpecError extends Error {}

// Friendly names map onto three engines and their defaults.
const KINDS = {
  graph: { engine: 'graph', direction: 'right' },
  architecture: { engine: 'graph', direction: 'right' },
  system: { engine: 'graph', direction: 'right' },
  dataflow: { engine: 'graph', direction: 'right' },
  dependencies: { engine: 'graph', direction: 'right' },
  flowchart: { engine: 'graph', direction: 'down' },
  process: { engine: 'graph', direction: 'down' },
  state: { engine: 'graph', direction: 'right' },
  datamodel: { engine: 'graph', direction: 'right' },
  er: { engine: 'graph', direction: 'right' },
  sequence: { engine: 'sequence' },
  tree: { engine: 'tree', direction: 'right' },
  hierarchy: { engine: 'tree', direction: 'down' },
  mindmap: { engine: 'mindmap' },
};
export const KIND_NAMES = Object.keys(KINDS);
const DIRECTIONS = ['right', 'down', 'left', 'up'];
const ARROWS = { '->': 'sync', '~>': 'async', '..>': 'data', '-->': 'return', '--': 'weak' };
const EDGE_RE = /^\s*([^\s:]+)\s*(-->|->|~>|\.\.>|--)\s*([^\s:]+)\s*(?::\s*(.+))?$/;

export const SHAPES = ['box', 'pill', 'diamond', 'note', 'text', 'start', 'end', 'table'];
export const BLOCKS = ['alt', 'opt', 'loop', 'par', 'critical', 'break', 'group'];
const TOKEN_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;
const UNSAFE_VALUE = /[<>{};\\]|\/\*/;

function oneOf(value, list, what) {
  if (value == null) return;
  if (!list.includes(value)) throw new SpecError(`${what} "${value}" is not one of: ${list.join(', ')}.`);
}

// Theme values end up inside CSS; allow plain colours, lengths and font stacks only.
export function checkTheme(theme, where = 'theme') {
  if (theme == null) return {};
  if (typeof theme !== 'object') throw new SpecError(`${where} must be a mapping.`);
  for (const mode of Object.keys(theme)) {
    if (!['light', 'dark', 'fonts'].includes(mode)) throw new SpecError(`${where}.${mode}: use light, dark or fonts.`);
    for (const [k, v] of Object.entries(theme[mode] ?? {})) {
      if (!TOKEN_KEY.test(k)) throw new SpecError(`${where}.${mode}.${k}: token names are letters and digits.`);
      if (typeof v !== 'string' && typeof v !== 'number') throw new SpecError(`${where}.${mode}.${k} must be a string.`);
      if (UNSAFE_VALUE.test(String(v))) throw new SpecError(`${where}.${mode}.${k} contains characters that are not allowed in a token value.`);
    }
  }
  return theme;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';

export function loadSpec(path) {
  const text = readFileSync(path, 'utf8');
  let raw;
  try {
    raw = extname(path).toLowerCase() === '.json' ? JSON.parse(text) : YAML.parse(text);
  } catch (err) {
    throw new SpecError(`Cannot parse ${path}: ${err.message}`);
  }
  return normalizeSpec(raw, { dir: dirname(resolve(path)), file: resolve(path) });
}

export function parseEdge(value) {
  if (typeof value !== 'string') return { ...value };
  const m = value.match(EDGE_RE);
  if (!m) throw new SpecError(`Edge "${value}" should look like "a -> b: label" (arrows: -> sync, ~> async, ..> data, --> return, -- plain).`);
  return { from: m[1], to: m[3], kind: ARROWS[m[2]], label: m[4]?.trim() };
}

export function normalizeSpec(raw, where = {}) {
  if (!raw || typeof raw !== 'object') throw new SpecError('The spec is empty.');
  const kindName = raw.kind ?? (raw.participants ? 'sequence' : raw.root ? 'tree' : 'graph');
  const kind = KINDS[kindName];
  if (!kind) throw new SpecError(`Unknown kind "${kindName}". Use one of: ${KIND_NAMES.join(', ')}.`);
  const base = {
    kind: kindName,
    engine: kind.engine,
    title: raw.title ?? '',
    subtitle: raw.subtitle ?? '',
    theme: checkTheme(raw.theme),
    brief: raw.brief ? resolve(where.dir ?? '.', raw.brief) : null,
    requireSources: raw.requireSources ?? Boolean(raw.brief),
    dir: where.dir ?? process.cwd(),
    file: where.file ?? null,
    warnings: [],
  };
  if (kind.engine === 'sequence') return normalizeSequence(raw, base);
  if (kind.engine === 'tree' || kind.engine === 'mindmap') return normalizeTree(raw, base, kind);
  return normalizeGraph(raw, base, kind);
}

function asList(value, what) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.entries(value).map(([id, v]) => (typeof v === 'string' ? { id, label: v } : { id, ...v }));
  throw new SpecError(`"${what}" should be a list.`);
}

function element(item, i, what) {
  const o = typeof item === 'string' ? { label: item } : { ...item };
  if (!o.id) o.id = o.label ? slug(o.label) : `${what}-${i + 1}`;
  o.id = String(o.id);
  if (o.label == null) o.label = o.id;
  if (o.facts && !Array.isArray(o.facts)) o.facts = [o.facts];
  oneOf(o.shape, SHAPES, `${what} "${o.id}" shape`);
  oneOf(o.tone, TONES, `${what} "${o.id}" tone`);
  return o;
}

function normalizeGraph(raw, base, kind) {
  const direction = raw.direction ?? kind.direction;
  if (!DIRECTIONS.includes(direction)) throw new SpecError(`direction must be one of ${DIRECTIONS.join(', ')}.`);
  const tiers = (raw.tiers ?? []).map(String);
  const groups = asList(raw.groups, 'groups').map((g, i) => element(g, i, 'group'));
  const nodes = asList(raw.nodes, 'nodes').map((n, i) => element(n, i, 'node'));
  const ids = new Map();
  for (const x of [...groups, ...nodes]) {
    if (ids.has(x.id)) throw new SpecError(`Duplicate id "${x.id}". Every node and group needs its own id.`);
    ids.set(x.id, x);
  }
  const groupIds = new Set(groups.map((g) => g.id));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupTier = (id) => { const g = groupById.get(id); return g ? (g.tier ?? (g.parent ? groupTier(g.parent) : null)) : null; };
  for (const g of groups) {
    if (g.parent && !groupIds.has(g.parent)) throw new SpecError(`Group "${g.id}" has unknown parent "${g.parent}".`);
    if (g.tier && !tiers.includes(String(g.tier))) throw new SpecError(`Group "${g.id}" uses tier "${g.tier}", which is not in tiers: [${tiers.join(', ')}].`);
  }
  for (const n of nodes) {
    if (n.group && !groupIds.has(n.group)) throw new SpecError(`Node "${n.id}" is in unknown group "${n.group}".`);
    if (n.tier && !tiers.includes(String(n.tier))) throw new SpecError(`Node "${n.id}" uses tier "${n.tier}", which is not in tiers: [${tiers.join(', ')}].`);
    if (n.group && n.tier && groupTier(n.group) && String(groupTier(n.group)) !== String(n.tier))
      base.warnings.push({ level: 'warn', code: 'tier', ids: [n.id], message: `${n.id} has tier "${n.tier}" but sits in group "${n.group}" (tier "${groupTier(n.group)}").`, hint: 'A group occupies one column; move the part out of the group or give the group that tier.' });
    if (n.fields) n.shape = 'table';
    if (n.fields) n.fields = n.fields.map((f) => (typeof f === 'string' ? parseField(f) : f));
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Map();
  const edgeIds = new Set();
  const edges = (raw.edges ?? []).map((e, i) => {
    if (!e || (typeof e !== 'string' && typeof e !== 'object')) throw new SpecError(`Edge ${i + 1} is empty.`);
    const edge = parseEdge(e);
    for (const end of ['from', 'to']) {
      const [nodeId, field] = String(edge[end]).split('.');
      if (!nodeIds.has(nodeId)) throw new SpecError(`Edge ${i + 1} (${edge.from} -> ${edge.to}) points at unknown node "${nodeId}".`);
      if (field) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node.fields?.some((f) => f.name === field)) throw new SpecError(`Edge ${i + 1} points at field "${field}", which table "${nodeId}" does not have.`);
        edge[`${end}Field`] = field;
      }
      edge[end] = nodeId;
    }
    const key = `${edge.from}->${edge.to}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    edge.id = String(edge.id ?? (count === 1 ? key : `${key}#${count}`));
    if (edgeIds.has(edge.id)) throw new SpecError(`Duplicate edge id "${edge.id}".`);
    edgeIds.add(edge.id);
    edge.kind = edge.kind ?? 'sync';
    oneOf(edge.kind, Object.keys(EDGE_KINDS), `Edge ${edge.id} kind`);
    if (edge.facts && !Array.isArray(edge.facts)) edge.facts = [edge.facts];
    return edge;
  });
  const flows = normalizeFlows(raw.flows, edges);
  return { ...base, direction, tiers, groups, nodes, edges, flows, numbered: raw.numbered ?? true, layout: raw.layout ?? {} };
}

function parseField(s) {
  // "id uuid pk", "customer_id uuid fk", "amount bigint"
  const parts = s.trim().split(/\s+/);
  const key = ['pk', 'fk'].includes(parts[parts.length - 1]?.toLowerCase()) ? parts.pop().toLowerCase() : null;
  return { name: parts[0], type: parts.slice(1).join(' ') || null, key };
}

function normalizeFlows(rawFlows, edges) {
  return asList(rawFlows, 'flows').map((f, i) => {
    const flow = { id: String(f.id ?? slug(f.label ?? `flow-${i + 1}`)), label: f.label ?? `Flow ${i + 1}`, primary: Boolean(f.primary ?? i === 0), steps: [] };
    for (const s of f.steps ?? []) {
      const step = typeof s === 'string' ? { edge: s } : { ...s };
      let edge = edges.find((e) => e.id === step.edge);
      if (!edge) {
        const ref = step.edge ? parseEdge(step.edge) : step;
        edge = edges.find((e) => e.from === ref.from && e.to === ref.to);
      }
      if (!edge) throw new SpecError(`Flow "${flow.label}" step "${step.edge ?? `${step.from} -> ${step.to}`}" matches no edge. Add the edge or fix the step.`);
      flow.steps.push({ edge: edge.id, text: step.text ?? edge.label ?? '' });
    }
    return flow;
  });
}

function normalizeSequence(raw, base) {
  const participants = asList(raw.participants, 'participants').map((p, i) => element(p, i, 'participant'));
  const ids = new Set(participants.map((p) => p.id));
  if (ids.size !== participants.length) throw new SpecError('Participant ids must be unique.');
  if (!participants.length) throw new SpecError('A sequence needs participants.');
  const msgIds = new Set();
  let n = 0;
  const list = (items, where) => {
    if (items == null) return [];
    if (!Array.isArray(items)) throw new SpecError(`${where} must be a list.`);
    return items;
  };
  const walk = (items, where) =>
    list(items, where).map((item, i) => {
      if (item == null || (typeof item !== 'string' && typeof item !== 'object')) throw new SpecError(`${where} item ${i + 1} is empty.`);
      if (typeof item === 'object' && item.block) {
        oneOf(String(item.block), BLOCKS, 'Block');
        const inner = walk(item.messages ?? item.items, `Block "${item.block}"`);
        if (!inner.length) throw new SpecError(`Block "${item.block}${item.label ? ` ${item.label}` : ''}" has no messages (put them under "messages:").`);
        return {
          type: 'block',
          block: String(item.block),
          label: item.label ?? '',
          items: inner,
          else: list(item.else, `Block "${item.block}" else`).map((b) => {
            const branch = walk(b?.messages ?? b?.items, `Else branch "${b?.label ?? ''}"`);
            if (!branch.length) throw new SpecError(`Else branch "${b?.label ?? ''}" has no messages.`);
            return { label: b.label ?? '', items: branch };
          }),
        };
      }
      if (typeof item === 'object' && item.note != null) {
        const over = [].concat(item.over ?? []);
        if (over.length < 1 || over.length > 2) throw new SpecError(`Note "${item.note}" needs "over:" with one or two participants.`);
        for (const id of over) if (!ids.has(id)) throw new SpecError(`Note "${item.note}" is over unknown participant "${id}".`);
        return { type: 'note', text: String(item.note), over };
      }
      const m = parseEdge(item);
      for (const end of ['from', 'to']) if (!ids.has(m[end])) throw new SpecError(`Message "${m.label ?? ''}" uses unknown participant "${m[end]}". Participants: ${[...ids].join(', ')}.`);
      n += 1;
      if (m.facts && !Array.isArray(m.facts)) m.facts = [m.facts];
      const id = String(m.id ?? `m${n}`);
      if (msgIds.has(id)) throw new SpecError(`Duplicate message id "${id}".`);
      msgIds.add(id);
      const kind = m.kind ?? 'sync';
      oneOf(kind, Object.keys(EDGE_KINDS), `Message ${id} kind`);
      return { type: 'message', ...m, id, n, kind };
    });
  const items = walk(raw.messages, 'messages');
  return { ...base, participants, items, numbered: raw.numbered ?? true };
}

function normalizeTree(raw, base, kind) {
  const nodes = [];
  const edges = [];
  const used = new Set();
  const visit = (item, parent, depth) => {
    const node = element(item, nodes.length, 'node');
    let id = node.id;
    for (let k = 2; used.has(id); k++) id = `${node.id}-${k}`;
    node.id = id;
    used.add(id);
    node.depth = depth;
    nodes.push(node);
    if (parent) edges.push({ id: `${parent}->${id}`, from: parent, to: id, kind: 'weak' });
    for (const child of item.children ?? []) visit(child, id, depth + 1);
  };
  if (!raw.root) throw new SpecError('A tree or mindmap needs a "root" with nested "children".');
  visit(raw.root, null, 0);
  for (const n of nodes) delete n.children;
  const direction = kind.engine === 'mindmap' ? null : raw.direction ?? kind.direction ?? 'right';
  return { ...base, direction, nodes, edges, groups: [], tiers: [], flows: [] };
}
