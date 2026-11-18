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
    frame: '#d4d4d8', // the border around a diagram on a page
    frameBg: '#f4f4f5', // a diagram's canvas on a page: a step darker than the page, so it reads as a panel
    frameGroup: 'rgba(228, 228, 231, 0.5)', // groups on that canvas, a step darker again
    text: '#09090b',
    muted: '#71717a',
    faint: '#a1a1aa',
    edge: '#a9a9b2',
    lifeline: '#b9b9c1', // a sequence participant's dashed line: clear, a little lighter than messages
    edgeStrong: '#3f3f46',
    accent: '#5b5bd6',
    accentText: '#ffffff',
    accentSoft: 'rgba(91, 91, 214, 0.10)',
    containerTint: 'rgba(91, 91, 214, 0.13)', // a part holding smaller parts: a soft accent wash, strongest top left
    group: 'rgba(244, 244, 245, 0.55)',
    groupBorder: '#e4e4e7',
    // Sequence blocks nested inside another: a faint tint per level (outermost blocks use `group`).
    blockTint1: 'rgba(37, 99, 235, 0.07)',
    blockTint2: 'rgba(124, 58, 237, 0.07)',
    blockTint3: 'rgba(217, 119, 6, 0.08)',
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
    frame: '#27272a',
    frameBg: '#0a0a0b',
    frameGroup: 'rgba(24, 24, 27, 0.55)',
    text: '#fafafa',
    muted: '#a1a1aa',
    faint: '#71717a',
    edge: '#4b4b53',
    lifeline: '#45454c',
    edgeStrong: '#d4d4d8',
    accent: '#8b8cf7',
    accentText: '#0a0a0b',
    accentSoft: 'rgba(139, 140, 247, 0.14)',
    containerTint: 'rgba(139, 140, 247, 0.16)',
    group: 'rgba(24, 24, 27, 0.55)',
    groupBorder: '#27272a',
    blockTint1: 'rgba(96, 165, 250, 0.08)',
    blockTint2: 'rgba(167, 139, 250, 0.08)',
    blockTint3: 'rgba(251, 191, 36, 0.07)',
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
  linkIcon: 11, // the arrow in the corner of a part with a link
  linkInset: 6,
  containerHead: 40, // the name row of a group drawn as a part (a group with an icon)
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
