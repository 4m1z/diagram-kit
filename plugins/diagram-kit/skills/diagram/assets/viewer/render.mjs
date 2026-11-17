// Renders a positioned diagram model to an SVG string. Pure and DOM-free: the scripts use it for
// PNG previews (mode 'literal': resolved colours, real font names) and the viewer uses it in the
// browser (mode 'vars': CSS custom properties, so a host theme can restyle everything).
import { tokens, fonts, sizes, cssVar } from './theme.mjs';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n1 = (v) => Math.round(v * 10) / 10;

// Edge kinds: dash pattern and colour token. Add a kind here to make it available in specs.
export const EDGE_KINDS = {
  sync: { dash: null, color: 'edge' },
  async: { dash: '5 4', color: 'edge' },
  data: { dash: '2 3', color: 'edge', cap: 'round' },
  return: { dash: '4 3', color: 'faint' },
  weak: { dash: null, color: 'edge' },
};

export function createPaint({ mode = 'vars', theme = 'light', over = {}, families = {} } = {}) {
  const t = { ...tokens[theme], ...(over[theme] ?? {}) };
  const color = (name) => (mode === 'vars' ? `var(${cssVar(name)})` : (t[name] ?? name));
  // One attribute string per element. Vars mode packs everything into `style` so var() works.
  const attrs = (a) => {
    const css = [];
    const out = [];
    const put = (prop, attr, value) => {
      if (value == null) return;
      if (mode === 'vars') css.push(`${prop}:${value}`);
      else out.push(`${attr}="${esc(value)}"`);
    };
    put('fill', 'fill', a.fill === 'none' ? 'none' : a.fill && color(a.fill));
    put('stroke', 'stroke', a.stroke === 'none' ? 'none' : a.stroke && color(a.stroke));
    put('stroke-width', 'stroke-width', a.sw);
    put('stroke-dasharray', 'stroke-dasharray', a.dash);
    put('stroke-linecap', 'stroke-linecap', a.cap);
    put('opacity', 'opacity', a.opacity);
    if (a.font) {
      const [face, weight, size] = a.font;
      if (mode === 'vars') css.push(`font-family:var(--dk-${face})`, `font-weight:${weight}`, `font-size:${size}px`);
      else out.push(`font-family="${esc(families[face] ?? (face === 'mono' ? 'Geist Mono' : 'Geist'))}"`, `font-weight="${weight}"`, `font-size="${size}"`);
    }
    put('letter-spacing', 'letter-spacing', a.tracking);
    if (a.anchor) out.push(`text-anchor="${a.anchor}"`);
    if (css.length) out.push(`style="${esc(css.join(';'))}"`);
    return out.join(' ');
  };
  return { mode, theme, color, attrs, tokens: t };
}

// Orthogonal polyline with rounded corners, shortened at the end to leave room for the arrow.
export function edgePath(points, { radius = sizes.corner, trimEnd = 0, curve = false } = {}) {
  const pts = points.map(([x, y]) => [x, y]);
  if (trimEnd && pts.length >= 2) {
    const [ax, ay] = pts[pts.length - 2];
    const [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const k = Math.min(trimEnd, len - 0.5) / len;
    pts[pts.length - 1] = [bx - (bx - ax) * k, by - (by - ay) * k];
  }
  if (curve && pts.length === 2) {
    const [[x1, y1], [x2, y2]] = pts;
    const mx = (x1 + x2) / 2;
    return `M${n1(x1)},${n1(y1)} C${n1(mx)},${n1(y1)} ${n1(mx)},${n1(y2)} ${n1(x2)},${n1(y2)}`;
  }
  let d = `M${n1(pts[0][0])},${n1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const lin = Math.hypot(cx - px, cy - py);
    const lout = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (r < 0.5) { d += ` L${n1(cx)},${n1(cy)}`; continue; }
    const ax = cx - ((cx - px) / lin) * r;
    const ay = cy - ((cy - py) / lin) * r;
    const bx = cx + ((nx - cx) / lout) * r;
    const by = cy + ((ny - cy) / lout) * r;
    d += ` L${n1(ax)},${n1(ay)} Q${n1(cx)},${n1(cy)} ${n1(bx)},${n1(by)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${n1(lx)},${n1(ly)}`;
}

function arrowHead(points, size = sizes.arrow) {
  const [ax, ay] = points[points.length - 2];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const bxb = bx - ux * size;
  const byb = by - uy * size;
  const w = size * 0.55;
  return `M${n1(bx)},${n1(by)} L${n1(bxb - uy * w)},${n1(byb + ux * w)} L${n1(bxb + uy * w)},${n1(byb - ux * w)} Z`;
}

function iconSvg(model, name, x, y, size, p, colorName) {
  const nodes = model.icons?.[name];
  if (!nodes) return '';
  const s = size / 24;
  const inner = nodes
    .map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`)
    .join('');
  return `<g class="dk-icon" transform="translate(${n1(x)},${n1(y)}) scale(${n1(s * 1000) / 1000})" ${p.attrs({ fill: 'none', stroke: colorName, sw: 2 })} stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

// Baseline that visually centres a line of text (cap height ~0.71em in Geist) on cy.
const baseline = (cy, size) => cy + size * 0.355;

function textLines(lines, x, top, lineH, size, attrs) {
  return lines
    .map((line, i) => `<text x="${n1(x)}" y="${n1(baseline(top + i * lineH + lineH / 2, size))}" ${attrs}>${esc(line)}</text>`)
    .join('');
}

function nodeSvg(model, n, p) {
  const S = sizes;
  const toneColor = n.tone ? n.tone : null;
  const stroke = n.tone === 'accent' ? 'accent' : 'border';
  const parts = [];
  const lines = n.lines ?? [n.label];
  const subLines = n.subLines ?? (n.sub ? [n.sub] : []);
  const blockH = lines.length * S.lineHeight + (subLines.length ? subLines.length * S.subLineHeight + 2 : 0);
  const top = n.y + n.h / 2 - blockH / 2;
  const labelAttrs = (anchor) => p.attrs({ fill: 'text', font: ['sans', S.labelWeight, S.label], anchor });
  const subAttrs = (anchor) => p.attrs({ fill: 'muted', font: ['mono', 400, S.sub], anchor });
  const centeredText = () =>
    textLines(lines, n.x + n.w / 2, top, S.lineHeight, S.label, labelAttrs('middle')) +
    textLines(subLines, n.x + n.w / 2, top + lines.length * S.lineHeight + 2, S.subLineHeight, S.sub, subAttrs('middle'));

  switch (n.shape) {
    case 'diamond': {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      parts.push(`<path d="M${n1(cx)},${n1(n.y)} L${n1(n.x + n.w)},${n1(cy)} L${n1(cx)},${n1(n.y + n.h)} L${n1(n.x)},${n1(cy)} Z" ${p.attrs({ fill: 'surface', stroke, sw: S.stroke })} class="dk-shape" filter="url(#dk-shadow)"/>`);
      parts.push(centeredText());
      break;
    }
    case 'start':
      parts.push(`<circle cx="${n1(n.x + n.w / 2)}" cy="${n1(n.y + n.h / 2)}" r="${n1(n.w / 2)}" ${p.attrs({ fill: 'text' })} class="dk-shape"/>`);
      break;
    case 'end':
      parts.push(`<circle cx="${n1(n.x + n.w / 2)}" cy="${n1(n.y + n.h / 2)}" r="${n1(n.w / 2)}" ${p.attrs({ fill: 'surface', stroke: 'text', sw: 1.5 })} class="dk-shape"/>`);
      parts.push(`<circle cx="${n1(n.x + n.w / 2)}" cy="${n1(n.y + n.h / 2)}" r="${n1(n.w / 2 - 4)}" ${p.attrs({ fill: 'text' })}/>`);
      break;
    case 'text':
      parts.push(`<rect x="${n1(n.x)}" y="${n1(n.y)}" width="${n1(n.w)}" height="${n1(n.h)}" ${p.attrs({ fill: 'none', stroke: 'none' })} class="dk-shape"/>`);
      parts.push(centeredText());
      break;
    case 'note': {
      parts.push(`<rect x="${n1(n.x)}" y="${n1(n.y)}" width="${n1(n.w)}" height="${n1(n.h)}" rx="6" ${p.attrs({ fill: 'surface2', stroke: 'border', sw: S.stroke, dash: '3 3' })} class="dk-shape"/>`);
      parts.push(textLines(lines, n.x + 12, n.y + 8, 16, S.sub + 0.5, p.attrs({ fill: 'muted', font: ['sans', 400, S.sub + 0.5] })));
      break;
    }
    case 'table': {
      const H = S.tableHeader;
      parts.push(`<rect x="${n1(n.x)}" y="${n1(n.y)}" width="${n1(n.w)}" height="${n1(n.h)}" rx="${S.radius}" ${p.attrs({ fill: 'surface', stroke, sw: S.stroke })} class="dk-shape" filter="url(#dk-shadow)"/>`);
      parts.push(`<path d="M${n1(n.x)},${n1(n.y + H)} H${n1(n.x + n.w)}" ${p.attrs({ stroke: 'border', sw: S.stroke })}/>`);
      let tx = n.x + 12;
      if (n.icon) {
        parts.push(iconSvg(model, n.icon, n.x + 12, n.y + H / 2 - S.icon / 2, S.icon, p, toneColor ?? 'muted'));
        tx += S.icon + S.iconGap;
      }
      parts.push(`<text x="${n1(tx)}" y="${n1(baseline(n.y + H / 2, S.label))}" ${p.attrs({ fill: 'text', font: ['sans', 600, S.label] })}>${esc(n.label)}</text>`);
      (n.fields ?? []).forEach((f, i) => {
        const cy = n.y + H + i * S.tableRow + S.tableRow / 2;
        let fx = n.x + 12;
        if (f.key) {
          parts.push(`<text x="${n1(fx)}" y="${n1(baseline(cy, 9))}" ${p.attrs({ fill: f.key === 'pk' ? 'accent' : 'faint', font: ['mono', 500, 9] })}>${esc(f.key.toUpperCase())}</text>`);
        }
        fx += 22;
        parts.push(`<text x="${n1(fx)}" y="${n1(baseline(cy, S.sub))}" ${p.attrs({ fill: 'text', font: ['mono', 400, S.sub] })} data-field="${esc(f.name)}">${esc(f.name)}</text>`);
        if (f.type) parts.push(`<text x="${n1(n.x + n.w - 12)}" y="${n1(baseline(cy, S.sub))}" ${p.attrs({ fill: 'faint', font: ['mono', 400, S.sub], anchor: 'end' })}>${esc(f.type)}</text>`);
        if (i > 0) parts.push(`<path d="M${n1(n.x + 1)},${n1(cy - S.tableRow / 2)} H${n1(n.x + n.w - 1)}" ${p.attrs({ stroke: 'surface2', sw: 1 })}/>`);
      });
      break;
    }
    default: {
      const rx = n.shape === 'pill' ? n.h / 2 : S.radius;
      parts.push(`<rect x="${n1(n.x)}" y="${n1(n.y)}" width="${n1(n.w)}" height="${n1(n.h)}" rx="${n1(rx)}" ${p.attrs({ fill: 'surface', stroke, sw: S.stroke })} class="dk-shape" filter="url(#dk-shadow)"/>`);
      if (n.icon) {
        const ix = n.x + S.padX;
        parts.push(iconSvg(model, n.icon, ix, n.y + n.h / 2 - S.icon / 2, S.icon, p, toneColor ?? 'muted'));
        const tx = ix + S.icon + S.iconGap;
        parts.push(textLines(lines, tx, top, S.lineHeight, S.label, labelAttrs()));
        parts.push(textLines(subLines, tx, top + lines.length * S.lineHeight + 2, S.subLineHeight, S.sub, subAttrs()));
      } else parts.push(centeredText());
    }
  }
  return `<g class="dk-node" data-id="${esc(n.id)}" data-shape="${esc(n.shape ?? 'box')}">${parts.join('')}</g>`;
}

function groupSvg(g, p) {
  const S = sizes;
  if (g.variant === 'fragment') {
    const tagW = g.tagW ?? 34;
    return `<g class="dk-group dk-fragment" data-id="${esc(g.id)}">` +
      `<rect x="${n1(g.x)}" y="${n1(g.y)}" width="${n1(g.w)}" height="${n1(g.h)}" rx="8" ${p.attrs({ fill: 'none', stroke: 'borderStrong', sw: S.stroke })}/>` +
      `<path d="M${n1(g.x + 8)},${n1(g.y)} H${n1(g.x + tagW)} V${n1(g.y + 14)} L${n1(g.x + tagW - 6)},${n1(g.y + 20)} H${n1(g.x)} V${n1(g.y + 8)} Q${n1(g.x)},${n1(g.y)} ${n1(g.x + 8)},${n1(g.y)} Z" ${p.attrs({ fill: 'surface2', stroke: 'borderStrong', sw: S.stroke })}/>` +
      `<text x="${n1(g.x + 8)}" y="${n1(baseline(g.y + 10, 10))}" ${p.attrs({ fill: 'text', font: ['mono', 500, 10] })}>${esc(g.tag)}</text>` +
      (g.label ? `<rect x="${n1(g.x + tagW + 4)}" y="${n1(g.y + 3)}" width="${n1(g.labelW ?? 0)}" height="14" rx="3" ${p.attrs({ fill: 'bg', opacity: 0.92 })}/><text x="${n1(g.x + tagW + 8)}" y="${n1(baseline(g.y + 10, S.edge))}" ${p.attrs({ fill: 'muted', font: ['mono', 400, S.edge] })}>${esc(g.label)}</text>` : '') +
      `</g>`;
  }
  return `<g class="dk-group" data-id="${esc(g.id)}">` +
    `<rect x="${n1(g.x)}" y="${n1(g.y)}" width="${n1(g.w)}" height="${n1(g.h)}" rx="${S.groupRadius}" ${p.attrs({ fill: 'group', stroke: 'groupBorder', sw: S.stroke })}/>` +
    `</g>`;
}

// Group labels are drawn above the wires with a halo, so a wire entering the group passes behind them.
function groupLabelSvg(g, p) {
  const S = sizes;
  const label = String(g.label ?? '').toUpperCase();
  if (!label && !g.tone) return '';
  const dot = g.tone ? `<circle cx="${n1(g.x + 16)}" cy="${n1(g.y + 17)}" r="3" ${p.attrs({ fill: g.tone })}/>` : '';
  const lx = g.x + (g.tone ? 25 : 14);
  const y = n1(baseline(g.y + 17, S.group));
  const font = ['sans', 500, S.group];
  return `<g class="dk-group-label" data-id="${esc(g.id)}">${dot}` +
    (label ? `<text x="${n1(lx)}" y="${y}" ${p.attrs({ fill: 'bg', stroke: 'bg', sw: 5, font, tracking: S.groupTracking })} stroke-linejoin="round">${esc(label)}</text>` +
      `<text x="${n1(lx)}" y="${y}" ${p.attrs({ fill: 'muted', font, tracking: S.groupTracking })}>${esc(label)}</text>` : '') +
    `</g>`;
}

function edgeSvg(e, p) {
  const k = EDGE_KINDS[e.kind] ?? EDGE_KINDS.sync;
  const d = edgePath(e.points, { trimEnd: e.arrow === false ? 0 : sizes.arrow - 1, curve: e.curve });
  const head = e.arrow === false ? '' : `<path d="${arrowHead(e.points)}" class="dk-arrow" ${p.attrs({ fill: k.color })}/>`;
  return `<g class="dk-edge" data-id="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-kind="${esc(e.kind ?? 'sync')}">` +
    `<path d="${d}" class="dk-hit" fill="none" stroke="transparent" stroke-width="12"/>` +
    `<path d="${d}" class="dk-line" ${p.attrs({ fill: 'none', stroke: k.color, sw: sizes.edgeStroke, dash: k.dash, cap: k.cap })}/>` +
    head +
    `</g>`;
}

function edgeLabelSvg(e, p) {
  const out = [];
  if (e.labelBox && e.label) {
    const b = e.labelBox;
    out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" rx="4" ${p.attrs({ fill: 'bg', opacity: 0.92 })}/>`);
    out.push(`<text x="${n1(b.x + b.w / 2)}" y="${n1(baseline(b.y + b.h / 2, sizes.edge))}" ${p.attrs({ fill: 'muted', font: ['mono', 400, sizes.edge], anchor: 'middle' })}>${esc(e.label)}</text>`);
  }
  for (const s of e.badges ?? []) {
    out.push(`<g class="dk-badge" data-flow="${esc(s.flow)}" data-step="${s.step}"><circle cx="${n1(s.x)}" cy="${n1(s.y)}" r="8.5" ${p.attrs({ fill: 'accent' })}/>` +
      `<text x="${n1(s.x)}" y="${n1(baseline(s.y, 10))}" ${p.attrs({ fill: 'accentText', font: ['sans', 600, 10], anchor: 'middle' })}>${s.step}</text></g>`);
  }
  if (!out.length) return '';
  return `<g class="dk-edge-label" data-id="${esc(e.id)}">${out.join('')}</g>`;
}

export function renderSvg(model, opts = {}) {
  const p = createPaint(opts);
  const W = n1(model.width);
  const H = n1(model.height);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" class="dk-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  const shadowColor = p.mode === 'vars' ? 'var(--dk-shadow)' : p.tokens.shadow;
  o.push(`<defs><filter id="dk-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="${shadowColor}"/></filter>` +
    `<pattern id="dk-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" ${p.attrs({ fill: 'dot' })}/></pattern></defs>`);
  if (opts.background) {
    o.push(`<rect width="${W}" height="${H}" ${p.attrs({ fill: 'bg' })}/>`);
    o.push(`<rect width="${W}" height="${H}" fill="url(#dk-dots)"/>`);
  }
  if (opts.title && model.title) {
    o.push(`<text x="32" y="${n1(baseline(34, sizes.title))}" ${p.attrs({ fill: 'text', font: ['sans', 600, sizes.title] })}>${esc(model.title)}</text>`);
    const sub = [model.draft ? 'Draft: brief not approved' : null, model.subtitle].filter(Boolean).join(' · ');
    if (sub) o.push(`<text x="32" y="${n1(baseline(55, sizes.subtitle))}" ${p.attrs({ fill: 'muted', font: ['sans', 400, sizes.subtitle] })}>${esc(sub)}</text>`);
  }
  o.push('<g class="dk-world">');
  const byDepth = (a, b) => (a.depth ?? 0) - (b.depth ?? 0);
  const groups = model.groups ?? [];
  for (const g of groups.filter((x) => x.variant !== 'fragment').sort(byDepth)) o.push(groupSvg(g, p));
  for (const l of (model.lines ?? []).filter((x) => x.kind !== 'divider')) {
    o.push(`<path d="M${n1(l.x1)},${n1(l.y1)} L${n1(l.x2)},${n1(l.y2)}" class="dk-lifeline" data-id="${esc(l.id ?? '')}" ${p.attrs({ fill: 'none', stroke: 'border', sw: 1, dash: '3 4' })}/>`);
  }
  for (const b of model.bars ?? []) {
    o.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" rx="2" class="dk-bar" data-owner="${esc(b.owner ?? '')}" ${p.attrs({ fill: 'surface', stroke: 'borderStrong', sw: 1 })}/>`);
  }
  // Blocks (alt, loop, ...) sit above lifelines and bars so their labels stay readable.
  for (const g of groups.filter((x) => x.variant === 'fragment').sort(byDepth)) o.push(groupSvg(g, p));
  for (const l of (model.lines ?? []).filter((x) => x.kind === 'divider')) {
    o.push(`<path d="M${n1(l.x1)},${n1(l.y1)} L${n1(l.x2)},${n1(l.y2)}" class="dk-divider" ${p.attrs({ fill: 'none', stroke: 'borderStrong', sw: 1, dash: '4 4' })}/>`);
    if (l.label) o.push(`<rect x="${n1(l.x1 + 4)}" y="${n1(l.y1 + 4)}" width="${n1(l.labelW ?? 0)}" height="15" rx="3" ${p.attrs({ fill: 'bg', opacity: 0.92 })}/><text x="${n1(l.x1 + 8)}" y="${n1(baseline(l.y1 + 12, sizes.edge))}" ${p.attrs({ fill: 'muted', font: ['mono', 400, sizes.edge] })}>${esc(l.label)}</text>`);
  }
  for (const e of model.edges ?? []) o.push(edgeSvg(e, p));
  for (const g of groups.filter((x) => x.variant !== 'fragment')) o.push(groupLabelSvg(g, p));
  for (const n of model.nodes ?? []) o.push(nodeSvg(model, n, p));
  for (const e of model.edges ?? []) o.push(edgeLabelSvg(e, p));
  o.push('</g></svg>');
  return o.join('');
}

export { esc };
export const FONT_STACKS = fonts;
