/**
 * The contact sheet.
 *
 * Every glyph of every family at every preset, plus the corners of the parameter space, plus each
 * face installed as a live FontFace so that what is on screen at the bottom of the page is the
 * exported file rather than a drawing of it. Looking at this is not optional: the failure mode of
 * generated type is a glyph that draws without error and reads as the wrong letter.
 */

import { buildFace, glyphToSvgPath, setLine } from './font';
import { buildTTF } from './ttf';
import { CHARSET } from './glyphs';
import { ALT_KEYS, FAMILIES, STYLES, START, type Design, type Params } from './params';

const root = document.getElementById('root')!;
const SC = 0.075;

function sheet(title: string, d: Design): string {
  const face = buildFace(d);
  const H = 1000 * SC;
  let out = `<h2>${title}</h2><div class="grid">`;
  for (const ch of CHARSET) {
    const g = face.glyphs.get(ch);
    if (!g) continue;
    const w = Math.max(g.advance, 10) * SC;
    const base = 780 * SC;
    out += `<div class="cell"><svg width="${w.toFixed(1)}" height="${H.toFixed(1)}">`;
    out += `<line class="base" x1="0" y1="${base}" x2="${w}" y2="${base}"/>`;
    out += `<path d="${glyphToSvgPath(g, SC, 0, base)}" fill="#111"/></svg></div>`;
  }
  out += `</div>`;
  for (const words of ['Hamburgefonstiv', 'quick brown fox', 'ABCDEFGHIJKLM', '0123456789 &@$%']) {
    const l = setLine(face, words);
    const s = 0.09;
    out += `<svg width="${(l.width * s + 10).toFixed(0)}" height="${(1000 * s).toFixed(0)}">`;
    for (const sg of l.glyphs) out += `<path d="${glyphToSvgPath(sg.glyph, s, sg.x * s + 4, 780 * s)}" fill="#111"/>`;
    out += `</svg>`;
  }
  return out;
}

const cases: Array<{ name: string; design: Design }> = [];
for (const f of FAMILIES) cases.push({ name: `family: ${f.name}`, design: { family: f.id, params: f.params, alts: f.alts, edits: {} } });
for (const p of STYLES) cases.push({ name: `${p.family} / ${p.name}`, design: { family: p.family, params: p.params, alts: p.alts, edits: {} } });

const corners: Array<[string, Partial<Params>]> = [
  ['round 0', { round: 0 }],
  ['heavy narrow', { weight: 170, width: 0.7 }],
  ['tiny xheight', { xheight: 0.42, weight: 50 }],
  ['huge xheight', { xheight: 0.9 }],
  ['terminal 1', { terminal: 1, weight: 110 }],
  ['slant 20', { slant: 20 }],
  ['contrast 100', { contrast: 1 }],
  ['serif + contrast heavy', { serif: 1, bracket: 0.6, contrast: 0.8, weight: 150 }],
  ['serif thin', { serif: 1, bracket: 1, contrast: 0.5, weight: 26 }],
  ['wobble 100', { wobble: 1 }],
];
for (const [name, patch] of corners) {
  cases.push({ name: `corner: ${name}`, design: { family: START.family, params: { ...START.params, ...patch }, alts: [], edits: {} } });
}
cases.push({ name: 'corner: mono heavy', design: { family: 'mono', params: { ...START.params, weight: 160, serif: 0.8 }, alts: [...ALT_KEYS], edits: {} } });
cases.push({ name: 'corner: mono thin', design: { family: 'mono', params: { ...START.params, weight: 24 }, alts: [...ALT_KEYS], edits: {} } });

/**
 * One line per case, stacked.
 *
 * The full contact sheet below is for finding *which* glyph broke; this is for noticing that one
 * did. A face that has gone wrong somewhere is obvious in a single line of text and easy to miss in
 * six rows of isolated characters.
 */
function strip(): string {
  let out = '<h2>every case, one line each</h2>';
  const px = 38;
  for (const c of cases) {
    const face = buildFace(c.design);
    const l = setLine(face, 'Hamburgefonstiv agek 013 &@$?');
    const sc = px / 1000;
    out += `<div style="display:flex;align-items:center;gap:10px;padding:1px 0">`;
    out += `<span style="width:150px;flex:none;font:9px ui-monospace;color:#999">${c.name}</span>`;
    out += `<svg width="${(l.width * sc + 8).toFixed(0)}" height="${(px * 1.35).toFixed(0)}">`;
    for (const g of l.glyphs) out += `<path d="${glyphToSvgPath(g.glyph, sc, g.x * sc + 4, px * 0.98)}" fill="#111"/>`;
    out += `</svg></div>`;
  }
  return out;
}

root.innerHTML = strip() + cases.map((c) => sheet(c.name, c.design)).join('');

// Does a real text engine accept what the writer produced? Installing each face as a live FontFace
// and setting HTML with it is the only check that exercises the same path an operating system
// would, and it fails loudly rather than producing a plausible-looking picture.
const box = document.createElement('div');
box.innerHTML = '<h2>installed as real fonts</h2>';
root.appendChild(box);
for (const c of cases) {
  const bytes = buildTTF(buildFace(c.design), c.name);
  const fam = `PC-${c.name.replace(/\W+/g, '-')}`;
  const line = document.createElement('div');
  line.style.cssText = 'font-size:30px;line-height:1.3;padding:3px 0';
  line.textContent = `${c.name} — Hamburgefonstiv 0123 (&@$?) Café Straße`;
  box.appendChild(line);
  try {
    const ff = new FontFace(fam, bytes.buffer as ArrayBuffer);
    await ff.load();
    document.fonts.add(ff);
    line.style.fontFamily = `"${fam}"`;
    console.log(`[ttf] ${c.name} ok, ${bytes.length} bytes`);
  } catch (err) {
    line.style.color = 'red';
    console.error(`[ttf] ${c.name} FAILED`, err);
  }
}
