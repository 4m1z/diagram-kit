// Shared pieces of the layout model: node sizing, icons, the brief's facts and final placement.
import { readFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';
import { measure, wrap } from './metrics.mjs';
import { sizes as S } from '../../assets/viewer/theme.mjs';

const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url));
export const FONT = {
  label: { face: 'sans', weight: S.labelWeight, size: S.label },
  sub: { face: 'mono', weight: 400, size: S.sub },
  edge: { face: 'mono', weight: 400, size: S.edge },
  group: { face: 'sans', weight: 500, size: S.group, tracking: S.groupTracking },
  note: { face: 'sans', weight: 400, size: S.sub + 0.5 },
  header: { face: 'sans', weight: 600, size: S.label },
};
const up4 = (v) => Math.ceil(v / 4) * 4;
const widest = (lines, font) => Math.max(0, ...lines.map((l) => measure(l, font)));

export function sizeNode(n) {
  const shape = n.shape ?? 'box';
  if (shape === 'start' || shape === 'end') return { w: 18, h: 18, lines: [], subLines: [] };
  if (shape === 'diamond') {
    const lines = wrap(n.label, FONT.label, 150, 2);
    const tw = widest(lines, FONT.label);
    return { w: up4(Math.max(104, tw * 1.45 + 44)), h: up4(Math.max(64, lines.length * S.lineHeight * 1.7 + 26)), lines, subLines: [] };
  }
  if (shape === 'note') {
    const lines = wrap(n.label, FONT.note, 220, 8);
    return { w: up4(widest(lines, FONT.note) + 24), h: up4(lines.length * 16 + 16), lines, subLines: [] };
  }
  if (shape === 'text') {
    const lines = wrap(n.label, FONT.label, 200, 3);
    return { w: up4(widest(lines, FONT.label) + 8), h: up4(lines.length * S.lineHeight + 8), lines, subLines: [] };
  }
  if (shape === 'table') {
    const head = measure(n.label, FONT.header) + (n.icon ? S.icon + S.iconGap : 0);
    const rows = (n.fields ?? []).map((f) => 22 + measure(f.name, FONT.sub) + (f.type ? 24 + measure(f.type, FONT.sub) : 0));
    return { w: up4(Math.max(150, head, ...rows) + 24), h: S.tableHeader + Math.max(1, n.fields?.length ?? 0) * S.tableRow, lines: [n.label], subLines: [] };
  }
  const lines = wrap(n.label, FONT.label, S.maxLabelW, 2);
  const subLines = n.sub ? wrap(n.sub, FONT.sub, S.maxLabelW + 24, 2) : [];
  const textW = Math.max(widest(lines, FONT.label), widest(subLines, FONT.sub));
  const iconW = n.icon ? S.icon + S.iconGap : 0;
  const pad = shape === 'pill' ? S.padX + 6 : S.padX;
  const w = up4(Math.max(S.minNodeW, pad * 2 + iconW + textW + 2));
  const textH = lines.length * S.lineHeight + (subLines.length ? subLines.length * S.subLineHeight + 2 : 0);
  const h = up4(Math.max(shape === 'pill' && !subLines.length ? 36 : 40, textH + 20));
  return { w, h, lines, subLines };
}

export function edgeLabelSize(text) {
  return { w: Math.ceil(measure(text, FONT.edge) + 10), h: 16 };
}

// --- Icons (Lucide, ISC). A few role names map to the obvious icon.
const ALIASES = {
  db: 'database', postgres: 'database', mysql: 'database', sql: 'database', cache: 'zap', redis: 'zap',
  queue: 'list-end', kafka: 'waypoints', stream: 'waypoints', topic: 'waypoints', service: 'server', api: 'server',
  user: 'user', users: 'users', person: 'user', phone: 'smartphone', mobile: 'smartphone', web: 'globe', browser: 'app-window',
  cdn: 'globe', gateway: 'door-open', lb: 'split', 'load-balancer': 'split', storage: 'hard-drive', s3: 'archive', bucket: 'archive',
  worker: 'cog', job: 'cog', cron: 'clock', function: 'square-function', lambda: 'square-function', auth: 'key-round',
  search: 'search', ml: 'brain', model: 'brain', llm: 'sparkles', agent: 'bot', email: 'mail', notification: 'bell', webhook: 'webhook',
  payment: 'credit-card', ledger: 'book-open', bank: 'landmark', external: 'external-link', monitor: 'activity', logs: 'scroll-text',
};
let ICONS = null;
export function icons() {
  if (!ICONS) ICONS = JSON.parse(readFileSync(`${ASSETS}icons.json`, 'utf8'));
  return ICONS;
}
export function resolveIcon(name) {
  if (!name) return null;
  const all = icons();
  if (all[name]) return name;
  if (ALIASES[name] && all[ALIASES[name]]) return ALIASES[name];
  return null;
}
export function suggestIcons(name, max = 4) {
  const all = Object.keys(icons());
  const q = String(name).toLowerCase();
  return all.filter((k) => k.includes(q) || q.includes(k)).slice(0, max);
}
export function collectIcons(model, warnings) {
  const used = {};
  for (const n of model.nodes) {
    if (!n.icon) continue;
    const real = resolveIcon(n.icon);
    if (!real) {
      warnings.push({ level: 'warn', code: 'icon', ids: [n.id], message: `Unknown icon "${n.icon}" on ${n.id}.`, hint: `Use a Lucide name${suggestIcons(n.icon).length ? `, for example ${suggestIcons(n.icon).join(', ')}` : ''}.` });
      n.icon = null;
      continue;
    }
    n.icon = real;
    used[real] = icons()[real];
  }
  model.icons = used;
}

// --- The brief: Markdown with `status:` frontmatter and lists of facts (F), decisions (D) and
// assumptions (A). Facts need a source; decisions and assumptions explain themselves.
// - F3: Payments are idempotent per key for 24 hours. (source: https://docs.stripe.com/api/idempotent_requests)
// - D1: Only the vault sees card numbers (F7).
const ITEM_RE = /^\s*[-*]\s*\**([FDA]\d+)\**\s*[:.]\s*(.+?)\s*$/i;
const SOURCE_RE = /\s*\((?:sources?|src):\s*(.+)\)\s*$/i; // greedy: URLs may contain parentheses
const KIND = { F: 'fact', D: 'decision', A: 'assumption' };
export function parseBrief(path) {
  if (!path || !existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  // Status comes from the front matter only (a body line or a later rule never counts).
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let status = 'draft';
  try { status = String(YAML.parse(front?.[1] ?? '')?.status ?? 'draft').trim(); } catch { status = 'invalid'; }
  const facts = {};
  for (const line of text.split('\n')) {
    const m = line.match(ITEM_RE);
    if (!m || facts[m[1].toUpperCase()]) continue;
    const id = m[1].toUpperCase();
    const src = m[2].match(SOURCE_RE);
    const body = src ? m[2].slice(0, src.index).trim() : m[2];
    const parts = src ? src[1].split(/,\s+|\s*;\s*/).map((x) => x.trim()).filter(Boolean) : [];
    const checked = parts.find((x) => /^checked\s/i.test(x))?.replace(/^checked\s+/i, '');
    facts[id] = { kind: KIND[id[0]], text: body, sources: parts.filter((x) => !/^checked\s/i.test(x)), ...(checked ? { checked } : {}) };
  }
  return { path, status, facts };
}

// Badges number the primary flow's steps on the static picture.
export function placeBadges(model) {
  for (const flow of model.flows ?? []) {
    if (!flow.primary || !model.numbered) continue;
    flow.steps.forEach((s, i) => {
      const e = model.edges.find((x) => x.id === s.edge);
      if (!e) return;
      let x;
      let y;
      if (e.labelBox) {
        x = e.labelBox.x - 11;
        y = e.labelBox.y + e.labelBox.h / 2;
      } else {
        let best = 0;
        for (let k = 1; k < e.points.length; k++) {
          const [ax, ay] = e.points[k - 1];
          const [bx, by] = e.points[k];
          const len = Math.hypot(bx - ax, by - ay);
          if (len > best) { best = len; x = (ax + bx) / 2; y = (ay + by) / 2; }
        }
      }
      (e.badges ??= []).push({ flow: flow.id, step: i + 1, x, y });
    });
  }
}

// Shift everything so content starts at the margin, leaving room for the title, and size the canvas.
export function finalize(model, { margin = 32 } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const box = (x, y, w = 0, h = 0) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  for (const n of model.nodes) box(n.x, n.y, n.w, n.h);
  for (const g of model.groups ?? []) box(g.x, g.y, g.w, g.h);
  for (const e of model.edges) {
    for (const [x, y] of e.points) box(x, y);
    if (e.labelBox) box(e.labelBox.x, e.labelBox.y, e.labelBox.w, e.labelBox.h);
    for (const b of e.badges ?? []) box(b.x - 9, b.y - 9, 18, 18);
  }
  for (const l of model.lines ?? []) { box(l.x1, l.y1); box(l.x2, l.y2); }
  for (const b of model.bars ?? []) box(b.x, b.y, b.w, b.h);
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
  const top = model.title ? (model.subtitle || model.draft ? 80 : 64) : margin;
  const dx = margin - minX;
  const dy = top - minY;
  const shift = (o, keys) => { for (const [kx, ky] of keys) { if (o[kx] != null) o[kx] += dx; if (o[ky] != null) o[ky] += dy; } };
  for (const n of model.nodes) shift(n, [['x', 'y']]);
  for (const g of model.groups ?? []) shift(g, [['x', 'y']]);
  for (const e of model.edges) {
    e.points = e.points.map(([x, y]) => [x + dx, y + dy]);
    if (e.labelBox) shift(e.labelBox, [['x', 'y']]);
    for (const b of e.badges ?? []) shift(b, [['x', 'y']]);
  }
  for (const l of model.lines ?? []) shift(l, [['x1', 'y1'], ['x2', 'y2']]);
  for (const b of model.bars ?? []) shift(b, [['x', 'y']]);
  const titleW = model.title ? measure(model.title, { face: 'sans', weight: 600, size: S.title }) + 64 : 0;
  model.width = Math.ceil(Math.max(maxX - minX + margin * 2, titleW));
  model.height = Math.ceil(maxY - minY + top + margin);
  return model;
}

// Carry the explanation fields from spec elements into the model unchanged.
export function pickInfo(x) {
  const out = {};
  for (const k of ['about', 'details', 'facts', 'sources', 'tone', 'link']) if (x[k] != null) out[k] = x[k];
  return out;
}
