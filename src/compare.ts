/**
 * The falsification test.
 *
 * A parametric tool is easy to fool yourself about: everything it makes looks like a typeface, so
 * everything it makes looks like success. The only honest check is to put a real face on the line
 * above and the closest thing this tool can reach on the line below, at the same size, in the same
 * words, and look at the two together. Where they diverge is a list of what the tool cannot do yet.
 */

import { buildFace, glyphToPath2D, setLine } from './font';
import { DEFAULTS, type AltKey, type Design, type FamilyId, type Params } from './params';
import { UPM } from './params';

const SPECIMEN = 'Hamburgefonstiv agek 013';

interface Target {
  name: string;
  /** CSS font stack for the real thing. */
  css: string;
  weight: number;
  family: FamilyId;
  alts: AltKey[];
  params: Partial<Params>;
}

const TARGETS: Target[] = [
  {
    name: 'Montserrat',
    css: '"Montserrat"',
    weight: 400,
    family: 'sans',
    alts: ['a2'],
    params: { weight: 76, width: 1.1, round: 0.98, xheight: 0.78, ascend: 1.04, descend: 0.24, tracking: 2 },
  },
  {
    name: 'Avenir (system)',
    css: 'Avenir, "Avenir Next"',
    weight: 400,
    family: 'sans',
    alts: ['a2'],
    params: { weight: 66, width: 1.0, round: 0.96, xheight: 0.70, ascend: 1.18, descend: 0.28, tracking: 6 },
  },
  {
    name: 'Roboto',
    css: '"Roboto"',
    weight: 400,
    family: 'sans',
    alts: ['a2'],
    params: { weight: 76, width: 0.94, round: 0.8, xheight: 0.76, ascend: 1.06, descend: 0.26, contrast: 0.1, tracking: -4 },
  },
  {
    name: 'IBM Plex Sans',
    css: '"IBM Plex Sans"',
    weight: 400,
    family: 'sans',
    alts: ['a2', 'eangle', 'rarm'],
    params: { weight: 74, width: 0.98, round: 0.7, xheight: 0.74, ascend: 1.1, descend: 0.28, contrast: 0.14 },
  },
  {
    name: 'Source Sans 3',
    css: '"Source Sans 3"',
    weight: 400,
    family: 'sans',
    alts: ['a2', 'eangle', 'rarm', 'ycurve'],
    params: { weight: 72, width: 0.96, round: 0.78, xheight: 0.72, ascend: 1.14, descend: 0.28, contrast: 0.16 },
  },
  {
    name: 'Recursive',
    css: '"Recursive"',
    weight: 400,
    family: 'sans',
    alts: ['a2', 'eangle', 'rarm', 'ycurve'],
    params: { weight: 80, width: 1.0, round: 0.72, xheight: 0.76, ascend: 1.08, descend: 0.28, contrast: 0.12 },
  },
  {
    name: 'IBM Plex Mono',
    css: '"IBM Plex Mono"',
    weight: 400,
    family: 'mono',
    alts: ['a2', 'eangle', 'rarm', 'ycurve', 'ltail', 'ifoot', 'onefoot'],
    params: { weight: 74, width: 1.0, round: 0.72, xheight: 0.73, ascend: 1.12, descend: 0.3, serif: 0.16, bracket: 0.6, contrast: 0.12 },
  },
  {
    name: 'Monaco (system mono)',
    css: 'Monaco',
    weight: 400,
    family: 'mono',
    alts: ['a2', 'ltail', 'zeroslash', 'onefoot'],
    params: { weight: 72, width: 1.0, round: 0.62, xheight: 0.74, ascend: 1.1, descend: 0.28, serif: 0.1 },
  },
  {
    name: 'Menlo (system mono)',
    css: 'Menlo',
    weight: 400,
    family: 'mono',
    alts: ['a2', 'eangle', 'ltail', 'zeroslash', 'onefoot'],
    params: { weight: 74, width: 1.0, round: 0.7, xheight: 0.75, ascend: 1.1, descend: 0.28, serif: 0.12, contrast: 0.08 },
  },
  {
    name: 'Consolas',
    css: 'Consolas',
    weight: 400,
    family: 'mono',
    alts: ['a2', 'ltail', 'zeroslash', 'onefoot'],
    params: { weight: 70, width: 0.96, round: 0.68, xheight: 0.73, ascend: 1.12, descend: 0.3, contrast: 0.1 },
  },
  {
    name: 'Georgia (system serif)',
    css: 'Georgia',
    weight: 400,
    family: 'serif',
    alts: ['a2', 'eangle', 'ycurve', 'g2'],
    params: { weight: 74, width: 1.04, round: 0.84, xheight: 0.76, ascend: 1.08, descend: 0.28, contrast: 0.48, serif: 0.5, bracket: 0.85 },
  },
  {
    name: 'Palatino (system serif)',
    css: 'Palatino, "Palatino Linotype"',
    weight: 400,
    family: 'serif',
    alts: ['a2', 'eangle', 'ycurve', 'msplay', 'g2'],
    params: { weight: 68, width: 1.02, round: 0.8, xheight: 0.68, ascend: 1.2, descend: 0.3, contrast: 0.45, serif: 0.45, bracket: 0.95 },
  },
  {
    name: 'Newsreader',
    css: '"Newsreader"',
    weight: 400,
    family: 'serif',
    alts: ['a2', 'eangle', 'ycurve', 'msplay', 'g2'],
    params: { weight: 66, width: 1.0, round: 0.82, xheight: 0.7, ascend: 1.18, descend: 0.3, contrast: 0.62, serif: 0.5, bracket: 0.9 },
  },
  {
    name: 'Source Serif 4',
    css: '"Source Serif 4"',
    weight: 400,
    family: 'serif',
    alts: ['a2', 'ycurve', 'g2'],
    params: { weight: 70, width: 1.0, round: 0.8, xheight: 0.72, ascend: 1.14, descend: 0.3, contrast: 0.5, serif: 0.55, bracket: 0.7 },
  },
];

const PX = 54;

function drawMine(t: Target): HTMLCanvasElement {
  const design: Design = { family: t.family, params: { ...DEFAULTS, ...t.params }, alts: t.alts, edits: {} };
  const face = buildFace(design);
  const line = setLine(face, SPECIMEN);
  const scale = PX / UPM;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  const w = Math.ceil(line.width * scale) + 20;
  const h = Math.ceil(((face.ascent + face.descent) * PX) / UPM) + 10;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#111';
  const baseline = (face.ascent * PX) / UPM + 4;
  for (const g of line.glyphs) {
    if (!g.glyph.contours.length) continue;
    ctx.fill(glyphToPath2D(g.glyph, scale, 4 + g.x * scale, baseline), 'nonzero');
  }
  return canvas;
}

const root = document.getElementById('root')!;
await document.fonts.ready;

for (const t of TARGETS) {
  const box = document.createElement('div');
  box.className = 'row';
  box.innerHTML =
    `<h2>${t.name}</h2>` +
    `<div class="tag">the real one</div>` +
    `<div class="real"></div>` +
    `<div class="tag mine">punchcutter</div>`;
  // Set through the style object rather than an attribute: the family names carry double quotes,
  // which close the attribute early and leave every row rendering in the fallback.
  const real = box.querySelector<HTMLDivElement>('.real')!;
  real.style.fontFamily = t.css;
  real.style.fontWeight = String(t.weight);
  real.textContent = SPECIMEN;
  box.appendChild(drawMine(t));
  root.appendChild(box);
}

/**
 * Whether a family actually resolved.
 *
 * `document.fonts.check` lies about webfonts that have not been painted yet, so this measures
 * instead: set the text in the target family with a deliberately unlike fallback behind it, then in
 * the fallback alone. Identical widths mean the browser never found the target and the row above is
 * a comparison of the fallback with itself.
 */
function resolved(css: string): boolean {
  const probe = document.createElement('span');
  probe.textContent = 'MWiljq0123 Hamburgefonstiv';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:96px';
  document.body.appendChild(probe);
  probe.style.fontFamily = 'monospace';
  const fallback = probe.getBoundingClientRect().width;
  probe.style.fontFamily = `${css}, monospace`;
  const actual = probe.getBoundingClientRect().width;
  probe.remove();
  return Math.abs(actual - fallback) > 0.5;
}

// Webfonts can still be arriving when `fonts.ready` first settles, so give the probe a frame.
await new Promise((r) => setTimeout(r, 900));
const missing = TARGETS.filter((t) => !resolved(t.css)).map((t) => t.name);
for (const el of root.querySelectorAll<HTMLElement>('.row')) {
  const name = el.querySelector('h2')!.textContent!;
  if (missing.includes(name)) el.querySelector('.tag')!.textContent = 'NOT AVAILABLE - showing fallback';
}
console.log('[compare] not available:', missing.length ? missing.join(', ') : 'none');
