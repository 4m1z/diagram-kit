// Output writers: a self-contained HTML page, and a React-ready folder.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themeCss } from '../../assets/viewer/theme.mjs';

const VIEWER = fileURLToPath(new URL('../../assets/viewer/', import.meta.url));
const FONTS = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const MODULES = ['theme.mjs', 'render.mjs', 'viewer.mjs'];
const read = (p) => readFileSync(p, 'utf8');

// Tiny bundler for our own three modules: drop imports and `export` keywords, keep order.
export function bundleViewer({ esm = false } = {}) {
  const body = MODULES.map((m) =>
    read(VIEWER + m)
      .split('\n')
      .filter((l) => !/^import\s/.test(l) && !/^export\s*\{/.test(l))
      .map((l) => l.replace(/^export\s+(const|function|async function|class|let)\s/, '$1 '))
      .join('\n'),
  ).join('\n');
  return esm ? `${body}\nexport { mountDiagram, renderSvg, themeCss, tokens };\n` : body;
}

export function viewerCss() {
  return read(`${VIEWER}viewer.css`);
}

export const FONT_FILES = ['Geist-Regular.woff2', 'Geist-Medium.woff2', 'Geist-SemiBold.woff2', 'GeistMono-Regular.woff2', 'GeistMono-Medium.woff2'];

// Inline (data URLs) for the standalone page; `fontDir` gives relative URLs for bundlers instead.
export function fontFaceCss({ fontDir = null } = {}) {
  const src = (file) => (fontDir ? `url("${fontDir}${file}")` : `url(data:font/woff2;base64,${readFileSync(FONTS + file).toString('base64')})`);
  const face = (family, file, weight) =>
    `@font-face { font-family: "${family}"; src: ${src(file)} format("woff2"); font-weight: ${weight}; font-style: normal; font-display: block; }`;
  return [
    face('Geist', 'Geist-Regular.woff2', 400),
    face('Geist', 'Geist-Medium.woff2', 500),
    face('Geist', 'Geist-SemiBold.woff2', 600),
    face('Geist Mono', 'GeistMono-Regular.woff2', 400),
    face('Geist Mono', 'GeistMono-Medium.woff2', 500),
  ].join('\n');
}

const mergeTheme = (model, tokens = {}) => ({
  light: { ...(model.theme?.light ?? {}), ...(tokens.light ?? {}) },
  dark: { ...(model.theme?.dark ?? {}), ...(tokens.dark ?? {}) },
  fonts: { ...(model.theme?.fonts ?? {}), ...(tokens.fonts ?? {}) },
});

export function htmlPage(model, { tokens = {}, embedFonts = true, theme = null } = {}) {
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  const title = (model.title || 'Diagram').replace(/[<&]/g, '');
  return `<!doctype html>
<html lang="en"${theme ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="generator" content="diagram-kit">
<style>
${embedFonts ? fontFaceCss() : ''}
${themeCss(mergeTheme(model, tokens))}
html, body { margin: 0; height: 100%; background: var(--dk-bg); }
#diagram { position: fixed; inset: 0; }
${viewerCss()}
</style>
</head>
<body>
<div id="diagram"></div>
<script type="application/json" id="diagram-model">${json}</script>
<script type="module">
${bundleViewer()}
const model = JSON.parse(document.getElementById('diagram-model').textContent);
window.diagram = mountDiagram(document.getElementById('diagram'), model);
</script>
</body>
</html>
`;
}

// React: the same viewer as an ES module plus a thin component. Tune tokens in diagram.css.
// Tokens are scoped to .dk-root so the host page's own colour scheme is untouched.
export function reactFiles(model, { name = 'diagram', tokens = {} } = {}) {
  const css = `${fontFaceCss({ fontDir: './fonts/' })}\n${themeCss(mergeTheme(model, tokens), { scope: '.dk-root' })}\n${viewerCss()}`;
  const component = `'use client';

// Next.js Pages Router: import diagram.css from pages/_app instead of here (global CSS rule).
import { useEffect, useRef } from 'react';
import { mountDiagram } from './diagram-viewer.js';
import './diagram.css';

type Props = {
  model: unknown;
  height?: number | string;
  className?: string;
};

// Renders a diagram-kit layout model. Positions come from the model; the viewer adds pan, zoom,
// hover tracing, the inspector and flow playback. Restyle through the --dk-* variables in diagram.css.
export function Diagram({ model, height = 560, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const view = mountDiagram(ref.current, model, { themeToggle: false, keyTarget: ref.current });
    return () => view.destroy();
  }, [model]);
  return <div ref={ref} className={className} style={{ height, position: 'relative' }} />;
}
`;
  const usage = `import model from './${name}.layout.json';
import { Diagram } from './Diagram';

export default function ${name.replace(/(^|[-_ ]+)(\w)/g, (_, __, c) => c.toUpperCase()).replace(/\W/g, '') || 'Example'}Diagram() {
  return <Diagram model={model} height={600} />;
}
`;
  const dts = `export function mountDiagram(element: HTMLElement, model: unknown, options?: { themeToggle?: boolean; header?: boolean; keyTarget?: EventTarget; stepMs?: number }): { fit(): void; play(): void; step(i: number): void; destroy(): void };\n`;
  return {
    'Diagram.tsx': component,
    'diagram-viewer.js': bundleViewer({ esm: true }),
    'diagram-viewer.d.ts': dts,
    'diagram.css': css,
    [`${name}.layout.json`]: `${JSON.stringify(model, null, 2)}\n`,
    [`${name}.example.tsx`]: usage,
    ...Object.fromEntries(FONT_FILES.map((f) => [`fonts/${f}`, readFileSync(FONTS + f)])),
  };
}
