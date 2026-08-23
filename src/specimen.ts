/**
 * Drawing the specimen.
 *
 * Everything on the sheet is painted from the same outlines the .ttf is written from, on a canvas,
 * rather than by installing the font and setting HTML. That is a deliberate trade. Installing a
 * FontFace on every frame of a slider drag means an asynchronous load in the middle of a gesture,
 * and the letters arrive a beat after the number does; drawing the paths directly costs about a
 * millisecond and lands on the same frame as the handle. On a tool whose entire pitch is that you
 * can *see* a parameter, a beat of lag is the whole product broken.
 *
 * The cost is that text on the sheet is not selectable. The character set and the download are
 * where that would have mattered, and neither wants selection.
 */

import { glyphToPath2D, setLine, setParagraph, type Face } from './font';
import { UPM, type Params } from './params';

export interface Palette {
  ink: string;
  rule: string;
  muted: string;
  verd: string;
  paper: string;
}

export function paletteOf(root: HTMLElement = document.documentElement): Palette {
  const s = getComputedStyle(root);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { ink: v('--ink'), rule: v('--rule'), muted: v('--muted'), verd: v('--verd'), paper: v('--paper') };
}

/** Size a canvas to its CSS box at device resolution, and hand back a context in CSS pixels. */
export function prepare(canvas: HTMLCanvasElement, cssHeight?: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  if (width <= 0) return null;
  if (cssHeight !== undefined) canvas.style.height = `${cssHeight}px`;
  const height = cssHeight ?? canvas.clientHeight;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function paint(ctx: CanvasRenderingContext2D, face: Face, text: string, px: number, x: number, baseline: number): number {
  const scale = px / UPM;
  const line = setLine(face, text);
  for (const g of line.glyphs) {
    if (!g.glyph.contours.length) continue;
    ctx.fill(glyphToPath2D(g.glyph, scale, x + g.x * scale, baseline), 'nonzero');
  }
  return line.width * scale;
}

/** The largest size at which a line still fits a width, never larger than the size asked for. */
function fit(face: Face, text: string, maxWidth: number, cap: number): number {
  const units = setLine(face, text).width;
  if (units <= 0) return cap;
  return Math.max(8, Math.min(cap, (maxWidth * UPM) / units));
}

// ---------------------------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------------------------

const METRIC_LABEL = '11px "DM Mono", ui-monospace, monospace';

interface Metric {
  y: number;
  /** Where the label sits, once labels have been pushed apart. */
  labelY: number;
  label: string;
  /** Which slider lighting up should light this rule up too. */
  axis: keyof Params | null;
}

/**
 * Room kept clear on the right for the metric names, so they never sit on top of a letter.
 *
 * On a phone that gutter is a fifth of the screen, and the names are the part of the drawing worth
 * least: the rules still show where the metrics are without them. Below the threshold they are
 * dropped and the letters get the width instead.
 */
const LABEL_GUTTER = 86;
const LABEL_MIN_GAP = 13;
const LABELS_FROM = 520;

export interface HeroOptions {
  text: string;
  caret: number | null;
  /** The axis currently being dragged, so its own rule can answer. */
  live: keyof Params | null;
  pad: number;
}

/**
 * The face, drawn on its own metrics.
 *
 * This is the one idea the page is built around. A type designer never looks at a letter without
 * the cap line, the x-height and the baseline drawn behind it, because those lines are what the
 * letter is *for*; drawing them here turns three of the nine sliders from abstract numbers into
 * something you can watch move. When a slider is being dragged its own rule brightens, which is the
 * only animation on the page and the only one that says anything.
 */
export function drawHero(canvas: HTMLCanvasElement, face: Face, pal: Palette, opts: HeroOptions): void {
  const ctx = prepare(canvas);
  if (!ctx) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const m = face.metrics;

  const pad = opts.pad;
  const text = opts.text.length ? opts.text : ' ';

  // The size is chosen so the tallest and deepest ink in the face fits the box, then reduced again
  // if the line is too long — so the letters never crop, whatever the extender sliders are doing.
  const vertical = Math.max(m.asc, m.cap) + m.desc + UPM * 0.06;
  const byHeight = ((height - pad * 2) * UPM) / vertical;
  const labelled = width >= LABELS_FROM;
  const column = width - pad * 2 - (labelled ? LABEL_GUTTER : 0);
  const px = Math.min(byHeight, fit(face, text, column, byHeight));
  const scale = px / UPM;
  const inkTop = (Math.max(m.asc, m.cap) + UPM * 0.03) * scale;
  const baseline = (height - vertical * scale) / 2 + inkTop;

  const metrics: Metric[] = ([
    { y: baseline - m.asc * scale, labelY: 0, label: 'ascender', axis: 'ascend' },
    { y: baseline - m.cap * scale, labelY: 0, label: 'cap height', axis: null },
    { y: baseline - m.xh * scale, labelY: 0, label: 'x-height', axis: 'xheight' },
    { y: baseline, labelY: 0, label: 'baseline', axis: null },
    { y: baseline + m.desc * scale, labelY: 0, label: 'descender', axis: 'descend' },
  ] satisfies Metric[])
    .filter((met) => met.y > 6 && met.y < height - 6)
    .sort((a, b) => a.y - b.y);

  // Two rules can land within a few pixels of each other — an ascender barely above the cap line is
  // a perfectly good design — and two names printed on top of each other read as neither. The rules
  // stay where the metrics actually are; only the names are pushed apart.
  let floor = -Infinity;
  for (const met of metrics) {
    met.labelY = Math.max(met.y, floor + LABEL_MIN_GAP);
    floor = met.labelY;
  }

  ctx.lineWidth = 1;
  for (const met of metrics) {
    const lit = met.axis !== null && met.axis === opts.live;
    ctx.save();
    ctx.globalAlpha = lit ? 1 : 0.4;
    ctx.strokeStyle = lit ? pal.verd : pal.rule;
    ctx.beginPath();
    ctx.moveTo(pad, Math.round(met.y) + 0.5);
    ctx.lineTo(width - pad, Math.round(met.y) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = pal.ink;
  const drawn = paint(ctx, face, text, px, pad, baseline);

  // Names go on last, over a hole punched through whatever is beneath them. The canvas is
  // transparent, so the hole shows the paper rather than a colour that would have to be kept in
  // step with the theme.
  if (!labelled) return caret(ctx, face, pal, scale, px, pad, baseline, text, drawn, opts.caret);
  ctx.font = METRIC_LABEL;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const met of metrics) {
    const lit = met.axis !== null && met.axis === opts.live;
    const w = ctx.measureText(met.label).width;
    ctx.clearRect(width - pad - w - 7, met.labelY - 7, w + 7, 14);
    ctx.fillStyle = lit ? pal.verd : pal.muted;
    ctx.globalAlpha = lit ? 1 : 0.85;
    ctx.fillText(met.label, width - pad, met.labelY);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  caret(ctx, face, pal, scale, px, pad, baseline, text, drawn, opts.caret);
}

/** The insertion point, drawn from the ascender to a little under the baseline. */
function caret(
  ctx: CanvasRenderingContext2D,
  face: Face,
  pal: Palette,
  scale: number,
  px: number,
  pad: number,
  baseline: number,
  text: string,
  drawn: number,
  index: number | null,
): void {
  if (index === null) return;
  const m = face.metrics;
  // Measuring the prefix through the same layout the letters were drawn with is the only way the
  // caret lands between them rather than near them.
  const x = pad + (index >= text.length ? drawn : setLine(face, text.slice(0, index)).width * scale);
  ctx.save();
  ctx.strokeStyle = pal.verd;
  ctx.lineWidth = Math.max(1.5, px * 0.012);
  ctx.beginPath();
  ctx.moveTo(x, baseline - Math.max(m.asc, m.cap) * scale);
  ctx.lineTo(x, baseline + m.desc * scale * 0.6);
  ctx.stroke();
  ctx.restore();
}

/**
 * The index in `text` nearest a click on the hero.
 *
 * It has to repeat the hero's own sizing arithmetic exactly — including whether the label gutter
 * was reserved — because a caret that lands one letter away from the click is worse than no caret.
 */
export function caretAt(canvas: HTMLCanvasElement, face: Face, text: string, clientX: number, pad: number): number {
  const rect = canvas.getBoundingClientRect();
  const height = canvas.clientHeight;
  const m = face.metrics;
  const vertical = Math.max(m.asc, m.cap) + m.desc + UPM * 0.06;
  const byHeight = ((height - pad * 2) * UPM) / vertical;
  const labelled = rect.width >= LABELS_FROM;
  const column = rect.width - pad * 2 - (labelled ? LABEL_GUTTER : 0);
  const px = Math.min(byHeight, fit(face, text, column, byHeight));
  const scale = px / UPM;
  const target = clientX - rect.left - pad;
  const line = setLine(face, text);
  const stops = [...line.glyphs.map((g) => g.x * scale), line.width * scale];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const d = Math.abs(stops[i]! - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return Math.min(best, text.length);
}

/**
 * The anatomy diagram: a word with its own parts named.
 *
 * Every type book opens with one of these, and it is the single most useful page in the book —
 * once somebody has a word for the counter, they can see counters, and the sliders that were nine
 * abstractions become nine things they can watch. What makes this one worth drawing rather than
 * copying out of a book is that it is drawn in *your* face and moves when you move it: pull the
 * ascender down and the label marked "ascender" comes down with it.
 */
export function drawAnatomy(canvas: HTMLCanvasElement, face: Face, pal: Palette, pad: number): void {
  const width = (canvas.clientWidth || canvas.parentElement?.clientWidth || 0) - pad * 2;
  if (width <= 0) return;
  const m = face.metrics;
  const word = 'shoe';
  const px = Math.min(fit(face, word, width * 0.62, 210), 210);
  const scale = px / UPM;
  const top = 46;
  const baseline = top + (Math.max(m.asc, m.cap) * px) / UPM;
  const height = baseline + (m.desc * px) / UPM + 54;
  const ctx = prepare(canvas, Math.ceil(height));
  if (!ctx) return;

  const line = setLine(face, word);
  const startX = pad + (width - line.width * scale) / 2;
  const at = (i: number): { x: number; adv: number } => {
    const g = line.glyphs[i];
    return g ? { x: startX + g.x * scale, adv: g.glyph.advance * scale } : { x: startX, adv: 0 };
  };

  const s = at(0);
  const h = at(1);
  const o = at(2);
  const e = at(3);
  const stem = m.w * m.xscale * scale;
  const y = (units: number) => baseline - units * scale;

  interface Label {
    x: number;
    y: number;
    text: string;
    /** Which rail the name is written on. */
    up: boolean;
  }
  const labels: Label[] = [
    { x: h.x + h.adv * 0.24, y: y(m.asc * 0.86), text: 'ascender', up: true },
    { x: h.x + h.adv * 0.66, y: y(m.xh * 0.96), text: 'shoulder', up: true },
    { x: s.x + s.adv * 0.74, y: y(m.xh * 0.95), text: 'terminal', up: true },
    { x: o.x + o.adv * 0.5, y: y(m.xh + m.over), text: 'bowl', up: true },
    { x: h.x + h.adv * 0.24, y: y(m.xh * 0.4), text: 'stem', up: false },
    { x: o.x + o.adv * 0.5, y: y(m.xh * 0.46), text: 'counter', up: false },
    { x: e.x + e.adv * 0.55, y: y(m.xh * 0.5), text: 'crossbar', up: false },
  ];
  if (m.serif > 0.05) {
    labels.push({ x: h.x + h.adv * 0.24 - stem * 0.9, y: 0, text: 'serif', up: false });
    labels[labels.length - 1]!.y = baseline;
  }

  ctx.fillStyle = pal.ink;
  for (const g of line.glyphs) {
    if (!g.glyph.contours.length) continue;
    ctx.fill(glyphToPath2D(g.glyph, scale, startX + g.x * scale, baseline), 'nonzero');
  }

  ctx.font = METRIC_LABEL;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  const topRail = 16;
  const botRail = height - 16;
  // Names are spread along their rail in the order their anchors appear, so two leaders never
  // cross and no two names ever sit on top of each other.
  for (const rail of [true, false]) {
    const row = labels.filter((l) => l.up === rail).sort((a, b) => a.x - b.x);
    let floor = pad;
    for (const l of row) {
      const w = ctx.measureText(l.text).width;
      const railY = rail ? topRail : botRail;
      const lx = Math.max(floor, Math.min(l.x - w / 2, pad + width - w));
      floor = lx + w + 18;
      ctx.strokeStyle = pal.verd;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, railY + (rail ? 9 : -9));
      ctx.lineTo(lx + w / 2, railY + (rail ? 9 : -9));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.verd;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.muted;
      ctx.fillText(l.text, lx, railY);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------------------------

const SIZES = [64, 44, 30, 21, 15, 11];

export function drawWaterfall(canvas: HTMLCanvasElement, face: Face, pal: Palette, text: string, pad: number): void {
  const width = (canvas.clientWidth || canvas.parentElement?.clientWidth || 0) - pad * 2;
  if (width <= 0) return;
  const m = face.metrics;
  const rows = SIZES.map((size) => {
    const px = fit(face, text, width - 34, size);
    return { size, px, height: ((Math.max(m.asc, m.cap) + m.desc) * px) / UPM + px * 0.34 };
  });
  const total = rows.reduce((a, r) => a + r.height, 0) + 8;
  const ctx = prepare(canvas, Math.ceil(total));
  if (!ctx) return;

  let y = 0;
  ctx.font = METRIC_LABEL;
  ctx.textBaseline = 'alphabetic';
  for (const r of rows) {
    const baseline = y + ((Math.max(m.asc, m.cap) + UPM * 0.02) * r.px) / UPM;
    ctx.fillStyle = pal.muted;
    ctx.fillText(String(r.size), pad, baseline);
    ctx.fillStyle = pal.ink;
    paint(ctx, face, text, r.px, pad + 34, baseline);
    y += r.height;
  }
}

// ---------------------------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------------------------

/**
 * Every character, in a grid.
 *
 * Named for the type case a compositor pulled sorts from, and laid out the same way: one
 * compartment per character, every compartment the same size, so the eye can run the rows and catch
 * the one letter that has gone wrong at this setting.
 */
/** Where each compartment of the case sits. Shared so a click lands on the letter it looks like. */
export interface CaseLayout {
  cell: number;
  cellH: number;
  cols: number;
  rows: number;
  visible: string[];
  pad: number;
}

export function caseLayout(canvas: HTMLCanvasElement, chars: string[], pad: number): CaseLayout | null {
  const width = (canvas.clientWidth || canvas.parentElement?.clientWidth || 0) - pad * 2;
  if (width <= 0) return null;
  const cell = width / Math.max(6, Math.round(width / 62));
  const cols = Math.max(1, Math.floor(width / cell + 0.001));
  const visible = chars.filter((c) => c !== ' ');
  return { cell, cellH: cell * 1.12, cols, rows: Math.ceil(visible.length / cols), visible, pad };
}

/** Which character was clicked, or null for a click in the margin. */
export function caseHit(
  canvas: HTMLCanvasElement,
  chars: string[],
  pad: number,
  clientX: number,
  clientY: number,
): string | null {
  const l = caseLayout(canvas, chars, pad);
  if (!l) return null;
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor((clientX - rect.left - pad) / l.cell);
  const row = Math.floor((clientY - rect.top) / l.cellH);
  if (col < 0 || col >= l.cols || row < 0 || row >= l.rows) return null;
  return l.visible[row * l.cols + col] ?? null;
}

export function drawCharset(
  canvas: HTMLCanvasElement,
  face: Face,
  pal: Palette,
  chars: string[],
  pad: number,
  selected: string | null = null,
  edited: (ch: string) => boolean = () => false,
): void {
  const l = caseLayout(canvas, chars, pad);
  if (!l) return;
  const { cell, cellH, cols, rows, visible } = l;
  const ctx = prepare(canvas, Math.ceil(rows * cellH) + 1);
  if (!ctx) return;

  const m = face.metrics;
  const px = (cell * 0.62 * UPM) / Math.max(m.asc, m.cap, UPM * 0.5);
  const scale = px / UPM;

  ctx.strokeStyle = pal.rule;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (let r = 0; r <= rows; r++) {
    const y = Math.round(r * cellH) + 0.5;
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + cols * cell, y);
  }
  for (let c = 0; c <= cols; c++) {
    const x = Math.round(pad + c * cell) + 0.5;
    ctx.moveTo(x, 0.5);
    ctx.lineTo(x, Math.round(rows * cellH) + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // A tuned letter is marked in the case rather than only in the panel, so the work already done on
  // a face is visible at a glance instead of having to be remembered.
  visible.forEach((ch, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = { x: pad + col * cell, y: row * cellH };
    if (ch === selected) {
      ctx.fillStyle = pal.verd;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(box.x, box.y, cell, cellH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.verd;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, cell - 1, cellH - 1);
    } else if (edited(ch)) {
      ctx.fillStyle = pal.verd;
      ctx.beginPath();
      ctx.arc(box.x + cell - 7, box.y + 7, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = pal.ink;
  visible.forEach((ch, i) => {
    const g = face.glyphs.get(ch);
    if (!g || !g.contours.length) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * cell + (cell - g.advance * scale) / 2;
    const baseline = row * cellH + cellH * 0.72;
    ctx.fill(glyphToPath2D(g, scale, x, baseline), 'nonzero');
  });
}

/**
 * One character on its own, at a size you can judge it at, with everything it is measured against.
 *
 * The sidebearings are drawn as well as the metrics, because half of what makes a face good is
 * spacing and spacing is invisible until something marks where it starts and stops. The two upright
 * rules are the advance; the gap between each and the ink is what the side controls move.
 */
export function drawGlyphStudy(
  canvas: HTMLCanvasElement,
  face: Face,
  pal: Palette,
  ch: string,
  pad: number,
): void {
  const g = face.glyphs.get(ch);
  const height = 300;
  const ctx = prepare(canvas, height);
  if (!ctx || !g) return;
  const width = canvas.clientWidth;
  const m = face.metrics;

  const vertical = Math.max(m.asc, m.cap) + m.desc + UPM * 0.12;
  const px = Math.min(((height - pad) * UPM) / vertical, ((width - pad * 2) * UPM) / Math.max(g.advance, 1) / 1.6);
  const scale = px / UPM;
  const baseline = height - m.desc * scale - pad * 0.6;
  const x0 = pad + (width - pad * 2 - g.advance * scale) / 2;

  const rules: Array<[number, string]> = [
    [baseline - m.asc * scale, 'ascender'],
    [baseline - m.cap * scale, 'cap'],
    [baseline - m.xh * scale, 'x-height'],
    [baseline, 'baseline'],
    [baseline + m.desc * scale, 'descender'],
  ];
  ctx.font = METRIC_LABEL;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (const [y, label] of rules) {
    if (y < 8 || y > height - 4) continue;
    ctx.strokeStyle = pal.rule;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad, Math.round(y) + 0.5);
    ctx.lineTo(width - pad, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pal.muted;
    ctx.fillText(label, pad, y - 7);
    ctx.globalAlpha = 1;
  }

  // The advance, drawn as two uprights, so the space either side of the letter is a thing you can
  // see rather than a number you have to imagine.
  ctx.strokeStyle = pal.verd;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([3, 3]);
  for (const x of [x0, x0 + g.advance * scale]) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 10);
    ctx.lineTo(Math.round(x) + 0.5, height - 8);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.ink;
  if (g.contours.length) ctx.fill(glyphToPath2D(g, scale, x0, baseline), 'nonzero');
}

// ---------------------------------------------------------------------------------------------
// A paragraph
// ---------------------------------------------------------------------------------------------

export function drawParagraph(
  canvas: HTMLCanvasElement,
  face: Face,
  pal: Palette,
  text: string,
  px: number,
  pad: number,
): void {
  const width = (canvas.clientWidth || canvas.parentElement?.clientWidth || 0) - pad * 2;
  if (width <= 0) return;
  const column = Math.min(width, 640);
  const lines = setParagraph(face, text, (column * UPM) / px);
  const leading = px * 1.62;
  const ctx = prepare(canvas, Math.ceil(lines.length * leading + px));
  if (!ctx) return;
  ctx.fillStyle = pal.ink;
  const scale = px / UPM;
  lines.forEach((line, i) => {
    const baseline = px * 0.82 + i * leading;
    for (const g of line.glyphs) {
      if (!g.glyph.contours.length) continue;
      ctx.fill(glyphToPath2D(g.glyph, scale, pad + g.x * scale, baseline), 'nonzero');
    }
  });
}
