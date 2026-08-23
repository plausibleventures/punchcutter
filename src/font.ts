/**
 * From parameters to a set of drawn glyphs, and from glyphs to something you can put on a screen.
 *
 * This is the layer that both the canvas and the .ttf writer sit on, which is deliberate: if the
 * specimen were drawn from one description of the letters and the downloaded file from another,
 * they would drift, and the whole promise of the tool — that what you are looking at is the font —
 * would quietly stop being true.
 */

import {
  boundsOf,
  piecesToContours,
  scaleContoursX,
  shearContours,
  wobbleContours,
  translateContours,
  type Contour,
  type Pen,
} from './geom';
import { buildGlyph, CHARSET, monoSlot } from './glyphs';
import { Kerning } from './kern';
import {
  CAP,
  designKey,
  type AltKey,
  familyOf,
  metricsFor,
  metricsOf,
  UPM,
  type Design,
  type GlyphEdit,
  type Metrics,
} from './params';

export interface DrawnGlyph {
  ch: string;
  contours: Contour[];
  /** Total advance, including tracking. */
  advance: number;
  /** Where the ink starts, relative to the pen position. */
  lsb: number;
}

export interface Face {
  key: string;
  design: Design;
  metrics: Metrics;
  glyphs: Map<string, DrawnGlyph>;
  ascent: number;
  descent: number;
  lineGap: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Measured lazily off the outlines; see `kern.ts`. */
  kerning: Kerning;
}

/**
 * The height a shear pivots around.
 *
 * Shearing about the baseline throws every tall letter to the right of its own sidebearings, so an
 * oblique set solid would drift out of its column. Pivoting near the optical centre of the lowercase
 * keeps the ink roughly where it was and means the slant slider does not have to be paid for with
 * the tracking one.
 */
const SHEAR_PIVOT = CAP * 0.34;

/**
 * Sidebearings scale with the stroke, not with the em.
 *
 * A fixed sidebearing is right at exactly one weight. Everywhere else it is either airless or
 * gappy, and the tracking slider ends up being spent undoing the weight slider instead of doing
 * anything of its own.
 */
const SIDEBEARING = 0.32;

/**
 * The order of operations here is the whole contrast mechanism, and none of it commutes.
 *
 * The glyph is built and stroked in a horizontally squashed space, where the pen is still round and
 * every offset is still exact. Only then is it stretched back out, which is what turns that round
 * pen into an elliptical one. Sidebearings are worked out *after* the stretch, against the stem
 * width the letter actually ends up with, and the shear comes last of all, because shearing before
 * stretching would change the angle of the slant.
 */
function drawGlyph(ch: string, base: Metrics, alts: readonly AltKey[], edit?: GlyphEdit): DrawnGlyph | null {
  // Everything below reads `m`, so folding the character's own adjustments in here is enough to
  // make them reach the frame, the pen, the serifs and the spacing without any of those knowing
  // that per-character adjustments exist at all.
  const m = metricsFor(base, edit);
  const g = buildGlyph(ch, m, alts);
  if (!g) return null;
  const pen: Pen = {
    weight: m.w,
    terminal: m.terminal,
    round: m.round,
    serifLen: m.serif * m.w * 0.82,
    // A slab's serifs are as thick as its stems; a high-contrast face's are hairlines. Tying the
    // two together is what lets one slider run from Rockwell to something Didone.
    serifThick: m.w * (1 - 0.62 * m.contrast),
    bracket: m.bracket,
    modulation: m.modulation,
    cut: m.cut,
    ball: m.ball,
    xscale: m.xscale,
  };
  let contours = piecesToContours(g.pieces, pen);
  if (m.xscale !== 1) contours = scaleContoursX(contours, m.xscale);
  if (m.wobble > 0.001) {
    // Seeded from the character, so the hand is steady across a word and across a reload.
    contours = wobbleContours(contours, hashChar(ch), m.wobble, m.w * 0.55 + CAP * 0.035, CAP * 0.85);
  }
  const outer = g.outer * m.xscale;

  // In a monospaced face the advance is decided first and the letter is centred in it; everywhere
  // else the letter is drawn and the advance follows from it. That is the whole difference.
  let side = m.w * m.xscale * g.sb * SIDEBEARING + m.track / 2;
  let left = side + (edit?.lsb ?? 0);
  let advance = outer + side * 2 + (edit?.lsb ?? 0) + (edit?.rsb ?? 0);
  if (m.mono) {
    // A monospaced face keeps its slot whatever a character asks for; hand tuning there moves the
    // letter within its slot rather than changing how much room it takes, or the columns stop
    // lining up and the face stops being monospaced.
    advance = monoSlot(m);
    left = (advance - outer) / 2 + (edit?.lsb ?? 0) - (edit?.rsb ?? 0);
  }
  contours = translateContours(contours, left, 0);
  if (Math.abs(m.tan) > 1e-9) {
    contours = shearContours(translateContours(contours, 0, -SHEAR_PIVOT), m.tan);
    contours = translateContours(contours, 0, SHEAR_PIVOT);
  }
  const b = boundsOf(contours);
  return { ch, contours, advance: Math.max(0, Math.round(advance)), lsb: contours.length ? b.x0 : 0 };
}

/** FNV-1a over a character, so each letter gets its own stable handwriting. */
function hashChar(ch: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ch.length; i++) {
    h ^= ch.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

let cached: Face | null = null;

/** The whole face, drawn. Repeated calls with the same design return the same object. */
export function buildFace(design: Design): Face {
  const key = designKey(design);
  if (cached && cached.key === key) return cached;

  const m = metricsOf(design.params, familyOf(design.family).mono ?? false);
  const glyphs = new Map<string, DrawnGlyph>();
  for (const ch of CHARSET) {
    const g = drawGlyph(ch, m, design.alts, design.edits[ch]);
    if (g) glyphs.set(ch, g);
  }

  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  for (const g of glyphs.values()) {
    if (!g.contours.length) continue;
    const b = boundsOf(g.contours);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }

  // Line metrics are taken from the drawing rather than from a table of constants, so a face with a
  // long descender gets the leading it needs instead of colliding with the line beneath it.
  const ascent = Math.max(m.asc, m.cap, y1) + Math.round(UPM * 0.04);
  const descent = Math.max(m.desc, -y0) + Math.round(UPM * 0.03);

  const face: Face = {
    key,
    design,
    metrics: m,
    glyphs,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    lineGap: 0,
    bbox: { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) },
    kerning: null as unknown as Kerning,
  };
  face.kerning = new Kerning(face);
  cached = face;
  return face;
}

// ---------------------------------------------------------------------------------------------
// Contours as paths
// ---------------------------------------------------------------------------------------------

interface PathSink {
  move(x: number, y: number): void;
  line(x: number, y: number): void;
  quad(cx: number, cy: number, x: number, y: number): void;
  close(): void;
}

/**
 * Walk a quadratic contour in TrueType's terms.
 *
 * Two off-curve points in a row imply an on-curve point exactly between them. Nothing this file
 * generates leans on that shorthand, but a contour that has been through a rounding pass can end up
 * using it, and a reader that does not handle it draws corners where there should be curves.
 */
function emitContour(c: Contour, sink: PathSink): void {
  if (c.length === 0) return;
  const n = c.length;
  let start = c.findIndex((p) => p.on);
  let sx: number;
  let sy: number;
  if (start < 0) {
    // Every point is a control point: the contour opens on an implied midpoint.
    start = 0;
    sx = (c[0]!.x + c[n - 1]!.x) / 2;
    sy = (c[0]!.y + c[n - 1]!.y) / 2;
  } else {
    sx = c[start]!.x;
    sy = c[start]!.y;
    start += 1;
  }
  sink.move(sx, sy);
  let i = 0;
  while (i < n) {
    const p = c[(start + i) % n]!;
    if (p.on) {
      sink.line(p.x, p.y);
      i += 1;
      continue;
    }
    const q = c[(start + i + 1) % n]!;
    if (q.on) {
      sink.quad(p.x, p.y, q.x, q.y);
      i += 2;
    } else {
      sink.quad(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      i += 1;
    }
  }
  sink.close();
}

/**
 * An SVG path for a glyph, with y flipped.
 *
 * Font space runs upward from the baseline and screen space runs downward; doing the flip here once
 * means no caller has to remember which way up it is holding a letter.
 */
export function glyphToSvgPath(g: DrawnGlyph, scale = 1, dx = 0, dy = 0): string {
  const parts: string[] = [];
  const X = (x: number) => (dx + x * scale).toFixed(2);
  const Y = (y: number) => (dy - y * scale).toFixed(2);
  const sink: PathSink = {
    move: (x, y) => parts.push(`M${X(x)} ${Y(y)}`),
    line: (x, y) => parts.push(`L${X(x)} ${Y(y)}`),
    quad: (cx, cy, x, y) => parts.push(`Q${X(cx)} ${Y(cy)} ${X(x)} ${Y(y)}`),
    close: () => parts.push('Z'),
  };
  for (const c of g.contours) emitContour(c, sink);
  return parts.join('');
}

/** The same walk, into a Path2D. Used by the specimen, which redraws on every frame of a drag. */
export function glyphToPath2D(g: DrawnGlyph, scale: number, dx: number, dy: number, into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  const X = (x: number) => dx + x * scale;
  const Y = (y: number) => dy - y * scale;
  const sink: PathSink = {
    move: (x, y) => p.moveTo(X(x), Y(y)),
    line: (x, y) => p.lineTo(X(x), Y(y)),
    quad: (cx, cy, x, y) => p.quadraticCurveTo(X(cx), Y(cy), X(x), Y(y)),
    close: () => p.closePath(),
  };
  for (const c of g.contours) emitContour(c, sink);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Setting text
// ---------------------------------------------------------------------------------------------

export interface SetGlyph {
  glyph: DrawnGlyph;
  x: number;
}

export interface SetLine {
  glyphs: SetGlyph[];
  width: number;
}

/**
 * Lay a string out along a line, in font units. Unknown characters are dropped, not boxed.
 *
 * Kerning is applied here as well as written into the font, so the specimen on screen is spaced the
 * way the downloaded file will be. A tool that showed one spacing and shipped another would be
 * lying about the thing it exists to show you.
 */
export function setLine(face: Face, text: string): SetLine {
  const glyphs: SetGlyph[] = [];
  let x = 0;
  let prev = '';
  for (const ch of text) {
    const g = face.glyphs.get(ch) ?? face.glyphs.get(ch.toUpperCase()) ?? face.glyphs.get(' ');
    if (!g) continue;
    if (prev) x += face.kerning.between(prev, g.ch);
    glyphs.push({ glyph: g, x });
    x += g.advance;
    prev = g.ch;
  }
  return { glyphs, width: x };
}

/** Break a string into lines that fit a width, in font units. Breaks on spaces; splits nothing. */
export function setParagraph(face: Face, text: string, maxWidth: number): SetLine[] {
  const out: SetLine[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (current && setLine(face, trial).width > maxWidth) {
        out.push(setLine(face, current));
        current = word;
      } else {
        current = trial;
      }
    }
    out.push(setLine(face, current));
  }
  return out;
}
