// Design tokens. Every colour, font and size the renderer and viewer use comes from here.
// Override any of them per diagram (spec `theme:`) or per host project (`--tokens file.json`).

export const tokens = {
  light: {
    bg: '#fafafa',
    dot: '#e4e4e7',
    surface: '#ffffff',
    surface2: '#f4f4f5',
    border: '#e4e4e7',
    borderStrong: '#d4d4d8',
    text: '#09090b',
    muted: '#71717a',
    faint: '#a1a1aa',
    edge: '#a9a9b2',
    edgeStrong: '#3f3f46',
    accent: '#5b5bd6',
    accentText: '#ffffff',
    accentSoft: 'rgba(91, 91, 214, 0.10)',
    group: 'rgba(244, 244, 245, 0.55)',
    groupBorder: '#e4e4e7',
    shadow: 'rgba(9, 9, 11, 0.05)',
    blue: '#2563eb',
    green: '#16a34a',
    amber: '#d97706',
    red: '#dc2626',
    violet: '#7c3aed',
    pink: '#db2777',
    cyan: '#0891b2',
    slate: '#64748b',
  },
  dark: {
    bg: '#0a0a0b',
    dot: '#1f1f23',
    surface: '#111113',
    surface2: '#18181b',
    border: '#27272a',
    borderStrong: '#3f3f46',
    text: '#fafafa',
    muted: '#a1a1aa',
    faint: '#71717a',
    edge: '#4b4b53',
    edgeStrong: '#d4d4d8',
    accent: '#8b8cf7',
    accentText: '#0a0a0b',
    accentSoft: 'rgba(139, 140, 247, 0.14)',
    group: 'rgba(24, 24, 27, 0.55)',
    groupBorder: '#27272a',
    shadow: 'rgba(0, 0, 0, 0.4)',
    blue: '#60a5fa',
    green: '#4ade80',
    amber: '#fbbf24',
    red: '#f87171',
    violet: '#a78bfa',
    pink: '#f472b6',
    cyan: '#22d3ee',
    slate: '#94a3b8',
  },
};

export const TONES = ['accent', 'blue', 'green', 'amber', 'red', 'violet', 'pink', 'cyan', 'slate'];

export const fonts = {
  sans: 'Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

// Type scale and geometry, in px. Layout reads these too, so sizes and positions always agree.
export const sizes = {
  label: 13,
  labelWeight: 500,
  sub: 11,
  edge: 10.5,
  group: 10.5,
  groupTracking: 0.7,
  title: 15,
  subtitle: 12.5,
  radius: 8,
  groupRadius: 12,
  corner: 7,
  stroke: 1,
  edgeStroke: 1.25,
  icon: 16,
  arrow: 6.5,
  padX: 13,
  iconGap: 10,
  lineHeight: 17,
  subLineHeight: 14,
  minNodeW: 92,
  maxLabelW: 176,
  tableHeader: 36,
  tableRow: 25,
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const cssVar = (name) => `--dk-${kebab(name)}`;

// Token values land inside CSS: only plain colours, lengths and font stacks pass.
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;
const UNSAFE = /[<>{};\\]|\/\*/;
const clean = (t = {}) => Object.fromEntries(Object.entries(t).filter(([k, v]) => SAFE_KEY.test(k) && !UNSAFE.test(String(v))));

// CSS custom properties for both themes. Light is the default, dark follows the system unless
// data-theme forces one (the claude.ai artifact contract uses the same shape). A standalone page
// themes :root; embedded output (React) passes scope: '.dk-root' so the host page is untouched.
export function themeCss(over = {}, { scope = null } = {}) {
  const light = { ...tokens.light, ...clean(over.light) };
  const dark = { ...tokens.dark, ...clean(over.dark) };
  const f = { ...fonts, ...clean(over.fonts) };
  const decl = (t) => Object.entries(t).map(([k, v]) => `${cssVar(k)}: ${v};`).join(' ');
  const base = `${decl(light)} --dk-sans: ${f.sans}; --dk-mono: ${f.mono};`;
  if (scope) {
    return [
      `${scope} { ${base} }`,
      `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) ${scope}:not([data-theme="light"]) { ${decl(dark)} } }`,
      `:root[data-theme="dark"] ${scope}:not([data-theme="light"]), ${scope}[data-theme="dark"] { ${decl(dark)} }`,
    ].join('\n');
  }
  return [
    `:root { ${base} color-scheme: light; }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${decl(dark)} color-scheme: dark; } }`,
    `:root[data-theme="dark"] { ${decl(dark)} color-scheme: dark; }`,
  ].join('\n');
}
