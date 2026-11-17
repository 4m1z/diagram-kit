// PNG preview without a browser (works in sandboxes such as Codex's), via resvg.
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderSvg } from '../../assets/viewer/render.mjs';

const FONTS = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const FILES = ['Geist-Regular.ttf', 'Geist-Medium.ttf', 'Geist-SemiBold.ttf', 'GeistMono-Regular.ttf', 'GeistMono-Medium.ttf'];

// resvg registers static font files under their family name with numeric weights.
export function familyNames(tokens = {}) {
  return { sans: tokens.fonts?.pngSans ?? 'Geist', mono: tokens.fonts?.pngMono ?? 'Geist Mono' };
}

export function staticSvg(model, { theme = 'light', tokens = {} } = {}) {
  const over = { light: { ...(model.theme?.light ?? {}), ...(tokens.light ?? {}) }, dark: { ...(model.theme?.dark ?? {}), ...(tokens.dark ?? {}) } };
  return renderSvg(model, { mode: 'literal', theme, over, families: familyNames(tokens), background: true, title: true });
}

export function renderPng(model, { theme = 'light', scale = 2, tokens = {} } = {}) {
  tokens = { ...tokens, fonts: { ...(model.theme?.fonts ?? {}), ...(tokens.fonts ?? {}) } };
  const svg = staticSvg(model, { theme, tokens });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    // Host fonts (theme.fonts.pngSans / pngMono) come from the system; otherwise only bundled Geist.
    font: { fontFiles: FILES.map((f) => FONTS + f), loadSystemFonts: Boolean(tokens.fonts?.pngSans || tokens.fonts?.pngMono || model.theme?.fonts?.pngSans), defaultFontFamily: 'Geist' },
  });
  return { png: resvg.render().asPng(), svg };
}
