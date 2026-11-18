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

// --- Several diagrams on one page: an overview plus focused views, or a gallery.
// manifest: { title, tagline, repo, sections: [{ label, title, text, showSpec }], install: [{ label, code }], footer }
// entries: [{ section, model, specText }] in section order.
const GITHUB_MARK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.6-4.04-1.6-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.31-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0 0 12 .3"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const escPage = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Section text: escaped, with `backticks` shown as inline code; a leading slash command is coloured.
const pageText = (s) => escPage(s).replace(/`([^`]+)`/g, (_, c) => `<code>${c.replace(/^(\/[\w:-]+)/, '<span class="pg-cmd">$1</span>')}</code>`);
const safeHref = (u) => (/^https?:\/\//.test(String(u ?? '')) ? escPage(u) : '#');
// Embedded pages: a relative path inside the site, or an https URL. Nothing else.
const safeEmbed = (u) => {
  const s = String(u ?? '');
  if (/^https:\/\//.test(s)) return escPage(s);
  if (/^[\w./-]+$/.test(s) && !s.startsWith('/') && !s.includes('..')) return escPage(s);
  return null;
};

function highlightYaml(text) {
  return escPage(text)
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return `<span class="pg-c">${line}</span>`;
      return line.replace(/^(\s*(?:- )?)([A-Za-z_][\w-]*)(:)/, '$1<span class="pg-k">$2</span>$3');
    })
    .join('\n');
}

const PAGE_CSS = `
html, body { margin: 0; background: var(--dk-bg); color: var(--dk-text); font-family: var(--dk-sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.pg { max-width: 1120px; margin: 0 auto; padding: 0 24px 64px; }
.pg-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 28px 0 20px; }
.pg-head { padding: 40px 0 18px; }
.pg-head h1 { margin: 0; font-size: 44px; line-height: 1.05; font-weight: 600; letter-spacing: -0.035em; background: linear-gradient(115deg, var(--dk-text) 35%, var(--dk-accent) 110%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.pg-actions { display: flex; align-items: center; gap: 8px; }
.pg-btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--dk-border); background: var(--dk-surface); color: var(--dk-text); font: 500 13.5px/1 var(--dk-sans); text-decoration: none; cursor: pointer; }
.pg-btn:hover { border-color: var(--dk-border-strong); }
.pg-primary { background: var(--dk-text); color: var(--dk-bg); border-color: var(--dk-text); }
.pg-primary:hover { opacity: 0.88; border-color: var(--dk-text); }
.pg-icon { width: 36px; padding: 0; justify-content: center; color: var(--dk-muted); }
.pg-tagline { margin: 0 0 28px; max-width: 680px; font-size: 17px; line-height: 1.55; color: var(--dk-muted); }
.pg-tagline strong { color: var(--dk-text); font-weight: 500; }
.pg-frame { --dk-bg: var(--dk-frame-bg); --dk-group: var(--dk-frame-group); position: relative; border: 1px solid var(--dk-frame); border-radius: 14px; overflow: hidden; background: var(--dk-bg); }
.pg-frame .dk-root { min-height: 0; }
.pg-embed iframe { display: block; width: 100%; height: 100%; border: 0; }
.pg-sec { margin-top: 72px; }
/* Parts are told apart by space alone (no rules): much more than between diagrams in a part. */
.pg-part { margin-top: 144px; }
.pg-part.pg-first { margin-top: 48px; }
.pg-part h2 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -0.025em; }
.pg-part p { margin: 10px 0 0; color: var(--dk-muted); font-size: 16px; line-height: 1.55; max-width: 680px; }
.pg-cmd { color: var(--dk-accent); font-weight: 500; }
.pg-part p code, .pg-sec p code { font: 400 0.88em var(--dk-mono); color: var(--dk-text); background: var(--dk-surface); border: 1px solid var(--dk-border); border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
.pg-part .pg-install { margin-top: 22px; }
.pg-part .pg-install + p { margin-top: 18px; }
.pg-part + .pg-sec { margin-top: 32px; }
.pg-sec h2 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.015em; }
.pg-sec p { margin: 0 0 18px; color: var(--dk-muted); font-size: 15px; line-height: 1.55; max-width: 680px; }
.pg-frame + .pg-frame { margin-top: 16px; }
.pg-spec { margin-top: 10px; }
.pg-spec summary { cursor: pointer; font: 500 12px/1 var(--dk-mono); color: var(--dk-muted); padding: 6px 0; }
.pg-spec summary:hover { color: var(--dk-text); }
.pg-spec pre { margin: 8px 0 0; padding: 16px 18px; border: 1px solid var(--dk-border); border-radius: 12px; background: var(--dk-surface); overflow: auto; font: 400 12.5px/1.6 var(--dk-mono); color: var(--dk-text); }
.pg-k { color: var(--dk-accent); }
.pg-c { color: var(--dk-faint); }
.pg-install { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.pg-install div { border: 1px solid var(--dk-border); border-radius: 12px; background: var(--dk-surface); padding: 14px 18px; }
.pg-install span { font: 600 14px/1.3 var(--dk-sans); color: var(--dk-text); }
.pg-install pre { margin: 10px 0 0; font: 400 13px/1.7 var(--dk-mono); white-space: pre-wrap; word-break: break-word; }
.pg-foot { margin-top: 112px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--dk-muted); }
.pg-foot a { color: var(--dk-text); }
@media (max-width: 640px) {
  .pg { padding: 0 16px 48px; }
  .pg-head { padding-top: 24px; }
  .pg-head h1 { font-size: 30px; }
  .pg-tagline { font-size: 15.5px; }
  .pg-btn span.pg-wide { display: none; }
  .pg-sec { margin-top: 56px; }
  .pg-part { margin-top: 104px; }
}`;

export function pageHtml(manifest, entries, { tokens = {}, embedFonts = true } = {}) {
  // Only diagrams get a frame index; headings and embedded pages do not.
  const models = entries.filter((e) => e.model).map((e) => e.model);
  const json = JSON.stringify(models).replace(/</g, '\\u003c');
  // Only http(s) links are used; anything else is dropped entirely.
  const repo = /^https?:\/\//.test(String(manifest.repo ?? '')) ? safeHref(manifest.repo) : null;
  const installBlock = () =>
    `<div class="pg-install">${(manifest.install ?? []).map((b) => `<div><span>${escPage(b.label)}</span><pre>${escPage(String(b.code ?? '').trim())}</pre></div>`).join('')}</div>`;
  const placesInstall = entries.some((e) => e.section.install);
  const sections = [];
  let i = 0;
  let open = null;
  let parts = 0;
  for (const e of entries) {
    const s = e.section;
    if (s.heading) {
      // A part of the page: a big heading, the install block when asked, then an optional line
      // (with an install block, the line says what to do next, so it comes after it).
      open = null;
      sections.push(`<div class="pg-part${parts++ ? '' : ' pg-first'}"><h2>${escPage(s.heading)}</h2>${s.install && manifest.install?.length ? installBlock() : ''}${s.text ? `<p>${pageText(s.text)}</p>` : ''}</div>`);
      continue;
    }
    const embed = s.iframe ? safeEmbed(s.iframe) : null;
    if (s.iframe && !embed) throw new Error(`Page section "${s.title ?? s.label ?? s.iframe}": iframe must be a relative path in the site or an https URL.`);
    const frame = embed
      ? `<div class="pg-frame pg-embed" data-ratio="${Number(s.ratio) > 0 ? Number(s.ratio) : 1.6}"><iframe src="${embed}" title="${escPage(s.title ?? s.label ?? 'Embedded diagram')}" loading="lazy"></iframe></div>`
      : `<div class="pg-frame" data-i="${i++}"${Number(s.maxHeight) > 0 ? ` data-max="${Number(s.maxHeight)}"` : ''}></div>`;
    const spec = s.showSpec && e.specText ? `<details class="pg-spec"><summary>Spec</summary><pre><code>${highlightYaml(e.specText.trim())}</code></pre></details>` : '';
    if (s.hero) { sections.push(`<section class="pg-hero">${frame}</section>`); continue; }
    if (s.continues && open) { open.push(frame + spec); continue; }
    open = [
      // No eyebrows: a section has one heading (its title, else its label, else the diagram's title);
      // `title: false` leaves it out.
      `${s.title !== false && (s.title || s.label || e.model?.title) ? `<h2>${escPage(s.title ?? s.label ?? e.model.title)}</h2>` : ''}${s.text ? `<p>${pageText(s.text)}</p>` : ''}`,
      frame + spec,
    ];
    sections.push(open);
  }
  const body = sections.map((s) => (typeof s === 'string' ? s : `<section class="pg-sec">${s.join('')}</section>`)).join('\n');
  const install = manifest.install?.length && !placesInstall
    ? `<section class="pg-sec"><h2>${escPage(manifest.installTitle ?? 'Install the plugin')}</h2>${manifest.installText ? `<p>${escPage(manifest.installText)}</p>` : ''}${installBlock()}</section>`
    : '';
  const title = escPage(manifest.title ?? 'Diagrams');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${manifest.tagline ? `<meta name="description" content="${escPage(manifest.tagline)}">` : ''}
<meta name="generator" content="diagram-kit">
<style>
${embedFonts ? fontFaceCss() : ''}
${themeCss({ light: tokens.light ?? {}, dark: tokens.dark ?? {}, fonts: tokens.fonts ?? {} })}
${viewerCss()}
${PAGE_CSS}
</style>
</head>
<body>
<div class="pg">
<header class="pg-head">
  <h1>${title}</h1>
  <div class="pg-actions">
    <button class="pg-btn pg-icon" id="pg-theme" title="Light or dark">${SUN}</button>
    ${repo ? `<a class="pg-btn pg-primary" href="${repo}">${GITHUB_MARK}<span>View on GitHub</span></a>` : ''}
  </div>
</header>
${manifest.tagline ? `<p class="pg-tagline">${escPage(manifest.tagline)}</p>` : ''}
${body}
${install}
<footer class="pg-foot"><span>${escPage(manifest.footer ?? 'Made with diagram-kit')}</span>${repo ? `<a href="${repo}">${escPage(String(manifest.repo).replace(/^https?:\/\//, ''))}</a>` : ''}</footer>
</div>
<script type="application/json" id="diagram-models">${json}</script>
<script type="module">
${bundleViewer()}
const models = JSON.parse(document.getElementById('diagram-models').textContent);
// Size each frame to its diagram's shape, within limits, then mount it in embedded mode.
const size = (frame, m) => {
  const w = frame.clientWidth || 800;
  // Height follows the diagram's shape (plus room for the controls), so a wide one gets no empty bands.
  const h = Math.max(window.innerWidth < 640 ? 220 : 240, Math.min(Number(frame.dataset.max) || 720, (w * m.height) / m.width + 72));
  frame.style.height = Math.round(h) + 'px';
};
const frames = [...document.querySelectorAll('.pg-frame[data-i]')];
// Embedded pages keep their aspect ratio within limits.
for (const frame of document.querySelectorAll('.pg-embed')) {
  const fit = () => { frame.style.height = Math.round(Math.max(320, Math.min(760, frame.clientWidth / Number(frame.dataset.ratio)))) + 'px'; };
  let w = frame.clientWidth;
  fit();
  new ResizeObserver(() => { if (frame.clientWidth !== w) { w = frame.clientWidth; fit(); } }).observe(frame);
}
const currentTheme = () => document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const tellEmbeds = () => { for (const f of document.querySelectorAll('.pg-embed iframe')) f.contentWindow?.postMessage({ type: 'dk-theme', theme: currentTheme() }, '*'); };
for (const f of document.querySelectorAll('.pg-embed iframe')) f.addEventListener('load', tellEmbeds);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', tellEmbeds);
for (const frame of frames) {
  const m = models[Number(frame.dataset.i)];
  size(frame, m);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;inset:0';
  frame.appendChild(holder);
  mountDiagram(holder, m, { embedded: true, header: false, themeToggle: false, keyTarget: holder });
  let lastWidth = frame.clientWidth;
  new ResizeObserver(() => { if (frame.clientWidth !== lastWidth) { lastWidth = frame.clientWidth; size(frame, m); } }).observe(frame);
}
document.getElementById('pg-theme').addEventListener('click', () => {
  const t = document.documentElement;
  const dark = t.dataset.theme ? t.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  t.dataset.theme = dark ? 'light' : 'dark';
  tellEmbeds();
});
</script>
</body>
</html>
`;
}
