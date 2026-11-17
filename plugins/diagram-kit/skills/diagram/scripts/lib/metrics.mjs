// Text measurement from precomputed font metrics, so layout needs no browser.
// `buildMetrics` reads a font file with opentype.js (used by `diagram metrics` and at build time).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url));
let table = null;

export function loadMetrics(path = `${ASSETS}metrics.json`) {
  table = JSON.parse(readFileSync(path, 'utf8'));
  return table;
}

// Merge metrics for a host font (made by `diagram metrics`) over the defaults.
export function addMetrics(path) {
  if (!table) loadMetrics();
  const extra = JSON.parse(readFileSync(path, 'utf8'));
  Object.assign(table.fonts, extra.fonts);
  return table;
}

// font: { face: 'sans' | 'mono', weight: 400 | 500 | 600, size: px }
export function measure(text, font) {
  if (!table) loadMetrics();
  const key = `${font.face}-${font.weight}`;
  const m = table.fonts[key] ?? table.fonts[`${font.face}-400`];
  let units = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    units += m.widths[cp] ?? (cp > 0x2e80 ? m.unitsPerEm : m.fallback);
  }
  const tracking = (font.tracking ?? 0) * [...String(text)].length;
  return (units / m.unitsPerEm) * font.size + tracking;
}

// Greedy word wrap to a maximum width; returns lines.
export function wrap(text, font, maxWidth, maxLines = 3) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

function pickName(font, key) {
  const n = font.names ?? {};
  for (const table of [n, n.windows, n.macintosh, n.unicode]) {
    const v = table?.[key];
    if (v) return v.en ?? Object.values(v)[0];
  }
  return null;
}

export async function buildMetrics(fontPath, key) {
  const { default: opentype } = await import('opentype.js');
  const buf = readFileSync(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const widths = {};
  const ranges = [[0x20, 0x7e], [0xa0, 0x24f], [0x2010, 0x2027], [0x2190, 0x21ff], [0x2022, 0x2022], [0x2192, 0x2192], [0x2713, 0x2717]];
  let sum = 0;
  let count = 0;
  for (const [a, b] of ranges) {
    for (let cp = a; cp <= b; cp++) {
      const glyph = font.charToGlyph(String.fromCodePoint(cp));
      if (!glyph || glyph.index === 0) continue;
      widths[cp] = glyph.advanceWidth;
      if (cp >= 0x61 && cp <= 0x7a) { sum += glyph.advanceWidth; count++; }
    }
  }
  return {
    [key]: {
      family: pickName(font, 'typographicFamily') ?? pickName(font, 'fontFamily'),
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      fallback: Math.round(sum / Math.max(count, 1)),
      widths,
    },
  };
}
