/**
 * The alphabet.
 *
 * Every letter here is written as the path a pen walks, in terms of the nine numbers in `params.ts`
 * — never as fixed coordinates. That constraint is the entire tool. A letter that hard-codes so
 * much as one y value stops moving when a slider does, and one frozen letter in a word is more
 * obvious than a badly drawn one.
 *
 * The construction is geometric-monoline throughout: bowls are rounded boxes, stems are straight,
 * and the roundness slider trades the corner arcs against the straight runs so that the same code
 * draws a circle at one end of the axis and a rectangle at the other. That is a real historical
 * family — Bauhaus lettering, Futura, Avant Garde, and every technical face descended from them —
 * and it is the family that survives being generated rather than drawn, because its rules really
 * are rules rather than a designer's accumulated judgement.
 *
 * Widths are stated as counter widths, not total widths, and the stroke weight is added afterwards.
 * That is the difference between a face that gets heavier and a face that gets heavier *and*
 * strangles itself: real type widens as it gains weight, because the hole in the middle of an 'o'
 * has to survive.
 */

import {
  arc,
  bar,
  ellipse,
  dot,
  line,
  pt,
  poly,
  reverseSegs,
  ringClosed,
  ringSlice,
  segEnd,
  segLength,
  segStart,
  stroke,
  type Piece,
  type Pt,
  type Seg,
  type Stroke,
} from './geom';
import { CAP, type AltKey, type Metrics } from './params';

const PI = Math.PI;

// ---------------------------------------------------------------------------------------------
// The frame a glyph is drawn in
// ---------------------------------------------------------------------------------------------

export interface Geo {
  m: Metrics;
  w: number;
  h: number;
  round: number;
  /** The horizontal stretch the finished drawing gets. Marks have to be squashed against it. */
  k: number;
  /** Ink extents, and the skeleton lines that put ink exactly on them. */
  cap: number;
  xh: number;
  asc: number;
  desc: number;
  /** Skeleton verticals for flat-ended strokes. */
  t: number;
  b: number;
  xt: number;
  at: number;
  db: number;
  /** Skeleton verticals for round shapes, carrying the optical overshoot. */
  T: number;
  B: number;
  XT: number;
  DB: number;
  /** Horizontal skeleton extents and the middle. */
  x0: number;
  x1: number;
  xm: number;
  outer: number;
  /** Vertical middles. */
  cm: number;
  ym: number;
}

/**
 * Counter-width units.
 *
 * The number stated for each letter is the width of the hole in the middle of it, and the two stems
 * around that hole are added afterwards. Sizing the whole letter instead — which is what this did
 * first — looks identical at a book weight and falls apart at a heavy one: at a stroke of 170 units
 * a 353-unit 'o' has a counter thirteen units wide, and the specimen fills with blobs. Widening
 * with weight is not a nicety, it is the only way the letter survives.
 *
 * Caps are measured against a cap-height circle and lowercase against an x-height one, so a face
 * with a tall x-height gets a correspondingly wide 'o' without anybody re-tuning a table.
 */
function units(m: Metrics): { uc: number; ul: number } {
  // The stems are subtracted at the width they will *finish* at, not the width they are drawn at.
  // Contrast thickens them after the fact, and a counter sized against the drawn width leaves the
  // letter to grow by the difference — which at full contrast is most of a stem on either side, and
  // turns a text face into a fairground sign. Charging the counter for the final stem instead keeps
  // an O exactly cap-height wide at every setting, and lets the hole in it narrow, which is what a
  // high-contrast face actually does.
  const stems = m.w * 2 * m.xscale;
  return {
    uc: Math.max(CAP * 0.16, CAP - stems) * m.width,
    ul: Math.max(CAP * 0.1, m.xh - stems) * m.width,
  };
}

function geo(m: Metrics, counter: number, lower: boolean): Geo {
  const u = units(m);
  // A counter of zero is a letter that has none — an I, a full stop, a bar. Its ink is one stem.
  const outer = counter <= 0 ? m.w : (lower ? u.ul : u.uc) * counter + m.w * 2;
  const h = m.h;
  return {
    m,
    w: m.w,
    h,
    round: m.round,
    k: m.xscale,
    cap: m.cap,
    xh: m.xh,
    asc: m.asc,
    desc: m.desc,
    t: m.cap - h,
    b: h,
    xt: m.xh - h,
    at: m.asc - h,
    db: -m.desc + h,
    T: m.cap - h + m.over,
    B: h - m.over,
    XT: m.xh - h + m.over,
    DB: -m.desc + h - m.over,
    x0: h,
    x1: outer - h,
    xm: outer / 2,
    outer,
    cm: m.cap / 2,
    ym: m.xh / 2,
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------------------------

/**
 * A solid mark, pre-squashed so the horizontal stretch leaves it the shape it was asked for.
 *
 * Every full stop, tittle and dieresis goes through here rather than calling `dot` directly. A mark
 * drawn round in the squashed space comes out an oval two and a half times too wide at full
 * contrast, which is not a stylistic choice anybody made.
 */
function mark(g: Geo, x: number, y: number, size: number): Piece {
  return dot(x, y, size / g.k, size);
}

/**
 * The radius of a quarter-turn hook — a J's bowl, a t's foot, a g's tail.
 *
 * Rings, bowls and arches take a *roundness* and work out their own radii from their own box. These
 * hooks are drawn as bare arcs and need the radius itself, in units. Conflating the two is a silent
 * disaster: a roundness of 1 passed where a radius was wanted turns a hundred-unit curve into a
 * one-unit one, which draws a square corner and throws no error at all.
 */
function hook(g: Geo, across: number, down: number): number {
  return g.round * Math.max(0, Math.min(across, down)) * 0.5;
}

/** Join runs of segments into one pen-down, bridging any gap with a straight line. */
function chain(...runs: Seg[][]): Stroke {
  const segs: Seg[] = [];
  for (const run of runs) {
    if (run.length === 0) continue;
    const last = segs[segs.length - 1];
    if (last) {
      const a = segEnd(last);
      const c = segStart(run[0]!);
      if (Math.hypot(c.x - a.x, c.y - a.y) > 0.5) segs.push(line(a.x, a.y, c.x, c.y));
    }
    segs.push(...run);
  }
  return stroke(segs);
}

/**
 * A diagonal whose flat ends are pulled back along their own line.
 *
 * A stroke is cut square across its own direction, so a diagonal stopped exactly on the baseline
 * hangs one corner below it and lifts the other above. Flushing moves the skeleton point back until
 * the lower corner of that cut lands on the line the letter is measured to — which is why the
 * coordinates passed in for a flushed end are where the *ink* should reach, not where the pen goes.
 */
function diag(ax: number, ay: number, bx: number, by: number, h: number, flushA = true, flushB = true): Seg {
  const ux = bx - ax;
  const uy = by - ay;
  const len = Math.hypot(ux, uy);
  if (len < 1e-6) return line(ax, ay, bx, by);
  const nx = ux / len;
  const ny = uy / len;
  const spread = h * Math.abs(nx);
  let a = pt(ax, ay);
  let b = pt(bx, by);
  if (flushA && Math.abs(ny) > 1e-6) {
    const shift = ay < by ? spread : -spread;
    a = pt(ax + nx * (shift / ny), ay + shift);
  }
  if (flushB && Math.abs(ny) > 1e-6) {
    const shift = by < ay ? spread : -spread;
    b = pt(bx + nx * (shift / ny), by + shift);
  }
  return { k: 'L', a, b };
}

/**
 * The right-hand half of a rounded box: from (xa, yTop) around the right to (xa, yBot).
 *
 * The corners are quarter *ellipses*, not quarter circles, so at full roundness a D is a half
 * ellipse rather than a stadium — the difference between a bowl and a running track.
 */
function bowlRSegs(xa: number, xb: number, yBot: number, yTop: number, round: number): Seg[] {
  const k = Math.max(0, Math.min(1, round));
  const rx = (xb - xa) * k;
  const ry = ((yTop - yBot) / 2) * k;
  const out: Seg[] = [];
  out.push(line(xa, yTop, xb - rx, yTop));
  out.push(ellipse(xb - rx, yTop - ry, rx, ry, PI / 2, 0));
  out.push(line(xb, yTop - ry, xb, yBot + ry));
  out.push(ellipse(xb - rx, yBot + ry, rx, ry, 0, -PI / 2));
  out.push(line(xb - rx, yBot, xa, yBot));
  return out.filter(nonEmpty);
}

/** The top half of a rounded box: from (xa, yFrom) up over the top and down to (xb, yTo). */
function archSegs(xa: number, xb: number, yTop: number, yFrom: number, yTo: number, round: number): Seg[] {
  const k = Math.max(0, Math.min(1, round));
  const rx = ((xb - xa) / 2) * k;
  const ry = Math.max(0, yTop - Math.max(yFrom, yTo)) * k;
  const out: Seg[] = [];
  out.push(line(xa, yFrom, xa, yTop - ry));
  out.push(ellipse(xa + rx, yTop - ry, rx, ry, PI, PI / 2));
  out.push(line(xa + rx, yTop, xb - rx, yTop));
  out.push(ellipse(xb - rx, yTop - ry, rx, ry, PI / 2, 0));
  out.push(line(xb, yTop - ry, xb, yTo));
  return out.filter(nonEmpty);
}

/** The bottom half of a rounded box: from (xa, yFrom) down under and up to (xb, yTo). */
function scoopSegs(xa: number, xb: number, yBot: number, yFrom: number, yTo: number, round: number): Seg[] {
  const k = Math.max(0, Math.min(1, round));
  const rx = ((xb - xa) / 2) * k;
  const ry = Math.max(0, Math.min(yFrom, yTo) - yBot) * k;
  const out: Seg[] = [];
  out.push(line(xa, yFrom, xa, yBot + ry));
  out.push(ellipse(xa + rx, yBot + ry, rx, ry, PI, PI * 1.5));
  out.push(line(xa + rx, yBot, xb - rx, yBot));
  out.push(ellipse(xb - rx, yBot + ry, rx, ry, PI * 1.5, PI * 2));
  out.push(line(xb, yBot + ry, xb, yTo));
  return out.filter(nonEmpty);
}

function nonEmpty(s: Seg): boolean {
  return segLength(s) > 0.01;
}

const DEG = PI / 180;

/** Where a run of segments finishes. Letters that hand off from a curve to a straight start here. */
function tipOf(segs: Seg[]): Pt {
  const last = segs[segs.length - 1];
  return last ? segEnd(last) : pt(0, 0);
}

/**
 * A ring of the given box, opened between two clock positions.
 *
 * Angles are degrees anticlockwise from three o'clock, which is the same language the comments on
 * each letter use. `cw` reverses the walk without moving the cut, for the letters — S, 2, 3, 5 —
 * whose bowls are entered from the other side.
 */
function cut(g: Geo, x0: number, y0: number, x1: number, y1: number, a0: number, a1: number, cw = false): Seg[] {
  const segs = ringSlice(x0, y0, x1, y1, g.round, a0 * DEG, a1 * DEG);
  return cw ? reverseSegs(segs) : segs;
}

// ---------------------------------------------------------------------------------------------
// Shared letter shapes
// ---------------------------------------------------------------------------------------------

/**
 * The two-bowl spine of S and s, and of 5 and the tail of 3.
 *
 * The upper bowl is walked anticlockwise from about two o'clock and abandoned at eight, heading
 * right. The lower bowl is walked the other way, entered near eleven — also heading right — and
 * left at about seven. Both hand-off points sit on the waist, so `chain` bridges them with the
 * short diagonal that is the spine of the letter.
 */
function esseShapes(g: Geo, yBot: number, yTop: number): Piece[] {
  const mid = (yBot + yTop) / 2;
  return [
    chain(
      cut(g, g.x0, mid, g.x1, yTop, 62, 250),
      cut(g, g.x0, yBot, g.x1, mid, -160, 105, true),
    ),
  ];
}

/** The bowl-and-stem of a, and of the same shape wherever it recurs. */
function bowlStem(g: Geo, yBot: number, yTop: number, stemTop: number, stemBot: number): Piece[] {
  return [ringClosed(g.x0, yBot, g.x1, yTop, g.round), bar(g.x1, stemBot, g.x1, stemTop)];
}

// ---------------------------------------------------------------------------------------------
// Accents
// ---------------------------------------------------------------------------------------------

export type MarkName =
  | 'acute'
  | 'grave'
  | 'circumflex'
  | 'caron'
  | 'tilde'
  | 'dieresis'
  | 'ring'
  | 'cedilla'
  | 'slash';

/**
 * The marks, drawn with the same pen as the letters.
 *
 * An accent borrowed from another face is the fastest way to make a generated typeface look
 * generated, so these are built out of the same primitives and scale with the same weight: an acute
 * is one stroke of the pen, a dieresis is two of the same dots the full stop is made of. They also
 * have a floor in stroke widths as well as a share of the cap height, because at a hairline weight
 * an accent sized only against the cap height disappears, and at a heavy one it turns into a slab.
 */
function markPieces(g: Geo, name: MarkName, cx: number, foot: number, lower: boolean): Piece[] {
  const wide = Math.max(g.w * 2, g.cap * 0.2);
  const tall = Math.max(g.w * 0.75, g.cap * 0.085);
  const half = wide / 2;
  const mid = foot + g.h;
  switch (name) {
    case 'acute':
      return [stroke([diag(cx - half * 0.7, mid, cx + half * 0.7, mid + tall, g.h, false, false)])];
    case 'grave':
      return [stroke([diag(cx - half * 0.7, mid + tall, cx + half * 0.7, mid, g.h, false, false)])];
    case 'circumflex':
      return [stroke([line(cx - half, mid, cx, mid + tall), line(cx, mid + tall, cx + half, mid)])];
    case 'caron':
      return [stroke([line(cx - half, mid + tall, cx, mid), line(cx, mid, cx + half, mid + tall)])];
    case 'tilde': {
      const a = tall * 0.5;
      const y = mid + tall * 0.5;
      return [
        stroke([
          line(cx - half, y - a, cx - half * 0.2, y + a),
          line(cx - half * 0.2, y + a, cx + half * 0.2, y - a),
          line(cx + half * 0.2, y - a, cx + half, y + a),
        ]),
      ];
    }
    case 'dieresis': {
      const d = Math.max(g.w * 1.5, wide * 0.62);
      return [mark(g, cx - d / 2, mid, g.w), mark(g, cx + d / 2, mid, g.w)];
    }
    case 'ring': {
      const r = Math.max(g.w * 0.85, g.cap * 0.075);
      return [ringClosed(cx - r, foot, cx + r, foot + r * 2, g.round * r)];
    }
    case 'cedilla': {
      // Hangs from the baseline rather than sitting on it, and curls the way the roundness slider
      // curls everything else.
      const drop = Math.max(g.w * 1.5, g.cap * 0.14);
      const r = Math.max(0.3, g.round) * drop * 0.5;
      return [
        chain([line(cx, -g.h, cx, -drop + r)], r > 0 ? [arc(cx - r, -drop + r, r, 0, -PI / 2)] : [], [
          line(cx - r, -drop, cx - r - Math.max(g.w * 0.3, r * 0.5), -drop),
        ]),
      ];
    }
    case 'slash': {
      const h = lower ? g.xh : g.cap;
      return [stroke([diag(cx - g.outer * 0.44, -h * 0.1, cx + g.outer * 0.44, h * 1.1, g.h)])];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------

export interface Glyph {
  /** Width of the ink itself, in the squashed space it was drawn in. */
  outer: number;
  /** Sidebearing class. The space itself is worked out after the horizontal stretch. */
  sb: number;
  pieces: Piece[];
}

interface Entry {
  /**
   * Counter width, in units of a cap-height (or x-height) circle's counter. Zero means none.
   * Composites take theirs from the letter underneath, so they leave it out.
   */
  c?: number;
  lower?: boolean;
  /**
   * Sidebearing class.
   *
   * A round letter set with the same air as a flat-sided one looks loose, because its flanks only
   * touch the sidebearing at a single point. Rounds get about two thirds of the space, open letters
   * — the diagonals and the T — about three quarters, and everything else the full amount.
   */
  sb?: number;
  /** Digits share one advance so that figures set in columns line up. */
  tabular?: boolean;
  /** An accented letter: the same drawing as `base`, with a mark added over (or under) it. */
  of?: { base: string; mark: MarkName };
  draw?: (g: Geo) => Piece[];
}



const TABULAR = 0.6;

const TABLE: Record<string, Entry> = {
  ' ': { c: 0.222, draw: () => [] },

  // -- Capitals -------------------------------------------------------------------------------

  A: {
    c: 0.656, sb: 0.74,
    draw: (g) => [
      stroke([diag(g.x0, 0, g.xm, g.t, g.h, true, false), diag(g.xm, g.t, g.x1, 0, g.h, false, true)]),
      bar(g.x0 + (g.xm - g.x0) * 0.32, g.cap * 0.29, g.x1 - (g.x1 - g.xm) * 0.32, g.cap * 0.29),
    ],
  },
  B: {
    c: 0.566,
    draw: (g) => {
      const waist = g.cap * 0.52;
      return [
        bar(g.x0, g.b, g.x0, g.t),
        stroke(bowlRSegs(g.x0, g.x1 - g.w * 0.06, waist, g.t, g.round)),
        stroke(bowlRSegs(g.x0, g.x1, g.b, waist, g.round)),
      ];
    },
  },
  C: { c: 0.634, sb: 0.66, draw: (g) => [stroke(cut(g, g.x0, g.B, g.x1, g.T, 55, 305))] },
  D: {
    c: 0.634,
    draw: (g) => [bar(g.x0, g.b, g.x0, g.t), stroke(bowlRSegs(g.x0, g.x1, g.b, g.t, g.round))],
  },
  E: {
    c: 0.45,
    draw: (g) => [
      bar(g.x0, g.b, g.x0, g.t),
      bar(g.x0, g.t, g.x1, g.t),
      bar(g.x0, g.cm, g.x1 - g.w * 0.16, g.cm),
      bar(g.x0, g.b, g.x1, g.b),
    ],
  },
  F: {
    c: 0.428,
    draw: (g) => [bar(g.x0, g.b, g.x0, g.t), bar(g.x0, g.t, g.x1, g.t), bar(g.x0, g.cm, g.x1 - g.w * 0.16, g.cm)],
  },
  G: {
    c: 0.656, sb: 0.66,
    draw: (g) => [
      stroke(cut(g, g.x0, g.B, g.x1, g.T, 58, 360)),
      bar(g.x1 - Math.max(g.w, (g.x1 - g.x0) * 0.44), g.cm, g.x1, g.cm),
    ],
  },
  H: { c: 0.612, draw: (g) => [bar(g.x0, g.b, g.x0, g.t), bar(g.x1, g.b, g.x1, g.t), bar(g.x0, g.cm, g.x1, g.cm)] },
  I: { c: 0, draw: (g) => [bar(g.xm, g.b, g.xm, g.t)] },
  J: {
    c: 0.36, sb: 0.74,
    draw: (g) => {
      const r = hook(g, (g.x1 - g.x0) * 2, g.cap * 0.5);
      return [chain([line(g.x1, g.t, g.x1, g.b + r)], [arc(g.x1 - r, g.b + r, r, 0, -PI / 2)], [line(g.x1 - r, g.b, g.x0, g.b)])];
    },
  },
  K: {
    c: 0.577,
    draw: (g) => {
      const j = g.cap * 0.42;
      return [
        bar(g.x0, g.b, g.x0, g.t),
        stroke([diag(g.x1, g.cap, g.x0, j, g.h, true, false)]),
        stroke([diag(g.x0, j, g.x1, 0, g.h, false, true)]),
      ];
    },
  },
  L: { c: 0.428, sb: 0.74, draw: (g) => [bar(g.x0, g.b, g.x0, g.t), bar(g.x0, g.b, g.x1, g.b)] },
  M: {
    c: 0.818,
    draw: (g) => [
      bar(g.x0, g.b, g.x0, g.t),
      stroke([diag(g.x0, g.t, g.xm, g.cap * 0.1, g.h, false, false), diag(g.xm, g.cap * 0.1, g.x1, g.t, g.h, false, false)]),
      bar(g.x1, g.b, g.x1, g.t),
    ],
  },
  N: {
    c: 0.634,
    draw: (g) => [
      bar(g.x0, g.b, g.x0, g.t),
      stroke([diag(g.x0, g.t, g.x1, g.b, g.h, false, false)]),
      bar(g.x1, g.b, g.x1, g.t),
    ],
  },
  O: { c: 0.68, sb: 0.66, draw: (g) => [ringClosed(g.x0, g.B, g.x1, g.T, g.round)] },
  P: {
    c: 0.52,
    draw: (g) => {
      const waist = g.cap * 0.46;
      return [bar(g.x0, g.b, g.x0, g.t), stroke(bowlRSegs(g.x0, g.x1, waist, g.t, g.round))];
    },
  },
  Q: {
    c: 0.68, sb: 0.66,
    draw: (g) => {
      const k = Math.min((g.x1 - g.x0) * 0.42, g.cap * 0.3);
      return [
        ringClosed(g.x0, g.B, g.x1, g.T, g.round),
        stroke([diag(g.xm + k * 0.35, g.cap * 0.24, g.x1 + g.w * 0.16, -g.cap * 0.05, g.h, false, true)]),
      ];
    },
  },
  R: {
    c: 0.566,
    draw: (g) => {
      const waist = g.cap * 0.48;
      return [
        bar(g.x0, g.b, g.x0, g.t),
        stroke(bowlRSegs(g.x0, g.x1 - g.w * 0.08, waist, g.t, g.round)),
        stroke([diag(g.x0 + (g.x1 - g.x0) * 0.34, waist, g.x1, 0, g.h, false, true)]),
      ];
    },
  },
  S: { c: 0.496, sb: 0.66, draw: (g) => esseShapes(g, g.B, g.T) },
  T: { c: 0.542, sb: 0.74, draw: (g) => [bar(g.x0, g.t, g.x1, g.t), bar(g.xm, g.b, g.xm, g.t)] },
  U: { c: 0.612, draw: (g) => [stroke(scoopSegs(g.x0, g.x1, g.B, g.t, g.t, g.round))] },
  V: {
    c: 0.634, sb: 0.74,
    draw: (g) => [
      stroke([diag(g.x0, g.cap, g.xm, g.b, g.h, true, false), diag(g.xm, g.b, g.x1, g.cap, g.h, false, true)]),
    ],
  },
  W: {
    c: 1.092, sb: 0.74,
    draw: (g) => {
      const a = g.x0 + (g.x1 - g.x0) * 0.29;
      const b = g.x1 - (g.x1 - g.x0) * 0.29;
      const peak = g.cap * 0.66;
      return [
        stroke([
          diag(g.x0, g.cap, a, g.b, g.h, true, false),
          diag(a, g.b, g.xm, peak, g.h, false, false),
          diag(g.xm, peak, b, g.b, g.h, false, false),
          diag(b, g.b, g.x1, g.cap, g.h, false, true),
        ]),
      ];
    },
  },
  X: {
    c: 0.588, sb: 0.74,
    draw: (g) => [
      stroke([diag(g.x0, 0, g.x1, g.cap, g.h)]),
      stroke([diag(g.x0, g.cap, g.x1, 0, g.h)]),
    ],
  },
  Y: {
    c: 0.566, sb: 0.74,
    draw: (g) => {
      const j = g.cap * 0.44;
      return [
        stroke([diag(g.x0, g.cap, g.xm, j, g.h, true, false), diag(g.xm, j, g.x1, g.cap, g.h, false, true)]),
        bar(g.xm, g.b, g.xm, j),
      ];
    },
  },
  Z: {
    c: 0.496,
    draw: (g) => [
      stroke([
        line(g.x0, g.t, g.x1, g.t),
        diag(g.x1, g.t, g.x0, g.b, g.h, false, false),
        line(g.x0, g.b, g.x1, g.b),
      ]),
    ],
  },

  // -- Lowercase ------------------------------------------------------------------------------

  a: { c: 0.658, lower: true, draw: (g) => bowlStem(g, g.B, g.XT, g.xt, g.b) },
  b: {
    c: 0.707,
    lower: true,
    draw: (g) => [bar(g.x0, g.b, g.x0, g.at), ringClosed(g.x0, g.B, g.x1, g.XT, g.round)],
  },
  c: { c: 0.609, sb: 0.66, lower: true, draw: (g) => [stroke(cut(g, g.x0, g.B, g.x1, g.XT, 58, 302))] },
  d: {
    c: 0.707,
    lower: true,
    draw: (g) => [bar(g.x1, g.b, g.x1, g.at), ringClosed(g.x0, g.B, g.x1, g.XT, g.round)],
  },
  e: {
    c: 0.658, sb: 0.66,
    lower: true,
    draw: (g) => [bar(g.x0, g.ym, g.x1, g.ym), stroke(cut(g, g.x0, g.B, g.x1, g.XT, 0, 325))],
  },
  f: {
    c: 0.42,
    lower: true,
    draw: (g) => {
      // The hook is capped against the space above the x-height rather than against the stem
      // width, because a face with a short ascender has nowhere to put a large one and a face with
      // a long one should not get a hook that swings clear across the next letter.
      const x = g.x0 + (g.x1 - g.x0) * 0.24;
      const r = Math.max(0.35, g.round) * Math.min((g.asc - g.xh) * 0.8, g.x1 - x);
      const project = Math.max(g.w * 0.34, (g.x1 - g.x0) * 0.16);
      return [
        chain([line(x, g.b, x, g.at - r)], r > 0 ? [arc(x + r, g.at - r, r, PI, PI / 2)] : [], [
          line(x + r, g.at, Math.max(x + r, g.x1), g.at),
        ]),
        bar(x - g.h - project, g.xt, g.x1, g.xt),
      ];
    },
  },
  g: {
    c: 0.707,
    lower: true,
    draw: (g) => {
      const r = hook(g, (g.x1 - g.x0) * 1.1, (g.b - g.DB) * 1.2);
      return [
        ringClosed(g.x0, g.B, g.x1, g.XT, g.round),
        chain([line(g.x1, g.b, g.x1, g.DB + r)], r > 0 ? [arc(g.x1 - r, g.DB + r, r, 0, -PI / 2)] : [], [
          line(g.x1 - r, g.DB, g.x0 + (g.x1 - g.x0) * 0.14, g.DB),
        ]),
      ];
    },
  },
  h: {
    c: 0.681,
    lower: true,
    draw: (g) => [bar(g.x0, g.b, g.x0, g.at), stroke(archSegs(g.x0, g.x1, g.xt, g.xh * 0.4, g.b, g.round))],
  },
  i: {
    c: 0,
    lower: true,
    draw: (g) => [bar(g.xm, g.b, g.xm, g.xt), mark(g, g.xm, tittleY(g), g.w)],
  },
  j: {
    c: 0.14,
    lower: true,
    draw: (g) => {
      const r = hook(g, (g.x1 - g.x0) * 1.8, (g.b - g.DB) * 1.2);
      return [
        chain([line(g.x1, g.xt, g.x1, g.DB + r)], r > 0 ? [arc(g.x1 - r, g.DB + r, r, 0, -PI / 2)] : [], [
          line(g.x1 - r, g.DB, Math.min(g.x0, g.x1 - r - g.w * 0.2), g.DB),
        ]),
        mark(g, g.x1, tittleY(g), g.w),
      ];
    },
  },
  k: {
    c: 0.56,
    lower: true,
    draw: (g) => {
      const j = g.xh * 0.36;
      return [
        bar(g.x0, g.b, g.x0, g.at),
        stroke([diag(g.x1, g.xh, g.x0, j, g.h, true, false)]),
        stroke([diag(g.x0, j, g.x1, 0, g.h, false, true)]),
      ];
    },
  },
  l: { c: 0, lower: true, draw: (g) => [bar(g.xm, g.b, g.xm, g.at)] },
  m: {
    c: 1.759,
    lower: true,
    draw: (g) => {
      const s = (g.x1 - g.x0) / 2;
      return [
        bar(g.x0, g.b, g.x0, g.xt),
        stroke(archSegs(g.x0, g.x0 + s, g.xt, g.xh * 0.4, g.b, g.round)),
        stroke(archSegs(g.x0 + s, g.x1, g.xt, g.xh * 0.4, g.b, g.round)),
      ];
    },
  },
  n: {
    c: 0.681,
    lower: true,
    draw: (g) => [bar(g.x0, g.b, g.x0, g.xt), stroke(archSegs(g.x0, g.x1, g.xt, g.xh * 0.4, g.b, g.round))],
  },
  o: { c: 0.73, sb: 0.66, lower: true, draw: (g) => [ringClosed(g.x0, g.B, g.x1, g.XT, g.round)] },
  p: {
    c: 0.707,
    lower: true,
    draw: (g) => [bar(g.x0, g.db, g.x0, g.xt), ringClosed(g.x0, g.B, g.x1, g.XT, g.round)],
  },
  q: {
    c: 0.707,
    lower: true,
    draw: (g) => [bar(g.x1, g.db, g.x1, g.xt), ringClosed(g.x0, g.B, g.x1, g.XT, g.round)],
  },
  r: {
    c: 0.193,
    lower: true,
    draw: (g) => {
      const r = hook(g, (g.x1 - g.x0) * 1.6, g.xh * 0.9);
      return [
        bar(g.x0, g.b, g.x0, g.xt),
        chain([line(g.x0, g.xh * 0.45, g.x0, g.xt - r)], r > 0 ? [arc(g.x0 + r, g.xt - r, r, PI, PI / 2)] : [], [
          line(g.x0 + r, g.xt, g.x1, g.xt),
        ]),
      ];
    },
  },
  s: { c: 0.463, sb: 0.66, lower: true, draw: (g) => esseShapes(g, g.B, g.XT) },
  t: {
    c: 0.42,
    lower: true,
    draw: (g) => {
      // A crossbar has to *cross*. Measuring its left end from the glyph's edge rather than from
      // the stem meant that at any respectable weight it started inside the stem it was supposed to
      // cut through, and the letter came out as an L with a bar on it. The projection is measured
      // from the stem's own flank, and it is allowed to overhang into the sidebearing, which is
      // what a t does in every face that has one.
      const x = g.x0 + (g.x1 - g.x0) * 0.3;
      const top = g.xh + (g.asc - g.xh) * 0.62;
      const r = hook(g, (g.x1 - g.x0) * 1.5, g.xh * 0.55);
      const project = Math.max(g.w * 0.34, (g.x1 - g.x0) * 0.16);
      return [
        chain([line(x, top, x, g.b + r)], r > 0 ? [arc(x + r, g.b + r, r, PI, PI * 1.5)] : [], [
          line(x + r, g.b, g.x1, g.b),
        ]),
        bar(x - g.h - project, g.xt, g.x1, g.xt),
      ];
    },
  },
  u: {
    c: 0.681,
    lower: true,
    draw: (g) => [
      stroke(scoopSegs(g.x0, g.x1, g.B, g.xt, g.xh * 0.6, g.round)),
      bar(g.x1, g.b, g.x1, g.xt),
    ],
  },
  v: {
    c: 0.583, sb: 0.74,
    lower: true,
    draw: (g) => [
      stroke([diag(g.x0, g.xh, g.xm, g.b, g.h, true, false), diag(g.xm, g.b, g.x1, g.xh, g.h, false, true)]),
    ],
  },
  w: {
    c: 1.195, sb: 0.74,
    lower: true,
    draw: (g) => {
      const a = g.x0 + (g.x1 - g.x0) * 0.29;
      const b = g.x1 - (g.x1 - g.x0) * 0.29;
      const peak = g.xh * 0.62;
      return [
        stroke([
          diag(g.x0, g.xh, a, g.b, g.h, true, false),
          diag(a, g.b, g.xm, peak, g.h, false, false),
          diag(g.xm, peak, b, g.b, g.h, false, false),
          diag(b, g.b, g.x1, g.xh, g.h, false, true),
        ]),
      ];
    },
  },
  x: {
    c: 0.534, sb: 0.74,
    lower: true,
    draw: (g) => [stroke([diag(g.x0, 0, g.x1, g.xh, g.h)]), stroke([diag(g.x0, g.xh, g.x1, 0, g.h)])],
  },
  y: {
    c: 0.583, sb: 0.74,
    lower: true,
    draw: (g) => [
      stroke([diag(g.x0, g.xh, g.xm + (g.x1 - g.xm) * 0.24, g.b, g.h, true, false)]),
      stroke([diag(g.x1, g.xh, g.x0 + (g.xm - g.x0) * 0.1, -g.desc, g.h, true, true)]),
    ],
  },
  z: {
    c: 0.486,
    lower: true,
    draw: (g) => [
      stroke([
        line(g.x0, g.xt, g.x1, g.xt),
        diag(g.x1, g.xt, g.x0, g.b, g.h, false, false),
        line(g.x0, g.b, g.x1, g.b),
      ]),
    ],
  },

  // -- Figures --------------------------------------------------------------------------------

  '0': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => [ringClosed(g.x0, g.B, g.x1, g.T, g.round)],
  },
  '1': {
    c: TABULAR, sb: 0.74,
    tabular: true,
    draw: (g) => {
      const x = g.xm + (g.x1 - g.xm) * 0.18;
      const f = Math.max(g.w * 1.15, (g.x1 - g.x0) * 0.46);
      const drop = Math.max(g.w * 1.35, g.cap * 0.22);
      return [bar(x, g.b, x, g.t), stroke([diag(x - f, g.cap - drop, x, g.t, g.h, true, false)])];
    },
  },
  '2': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      // The arch is walked clockwise from nine o'clock down to four, and the diagonal leaves from
      // wherever that lands rather than from a guessed point, so it stays tangent at every width.
      const top = g.cap * 0.48;
      const arch = cut(g, g.x0, top, g.x1, g.T, -38, 186, true);
      const tip = tipOf(arch);
      return [chain(arch, [diag(tip.x, tip.y, g.x0, g.b, g.h, false, false)], [line(g.x0, g.b, g.x1, g.b)])];
    },
  },
  '3': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      const mid = (g.B + g.T) / 2;
      return [
        chain(cut(g, g.x0, mid, g.x1, g.T, -66, 172, true), cut(g, g.x0, g.B, g.x1, mid, -172, 62, true)),
      ];
    },
  },
  '4': {
    c: TABULAR,
    tabular: true,
    draw: (g) => {
      const x = g.x1 - (g.x1 - g.x0) * 0.24;
      const y = g.cap * 0.3;
      return [bar(x, g.b, x, g.t), stroke([diag(x, g.t, g.x0, y, g.h, false, false), line(g.x0, y, g.x1, y)])];
    },
  },
  '5': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      const waist = g.cap * 0.6;
      return [
        bar(g.x0, g.t, g.x1, g.t),
        chain([line(g.x0, g.t, g.x0, waist)], cut(g, g.x0, g.B, g.x1, waist, -168, 128, true)),
      ];
    },
  },
  '6': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      const bowlTop = g.cap * 0.56;
      return [
        ringClosed(g.x0, g.B, g.x1, bowlTop, g.round),
        stroke(cut(g, g.x0, g.B, g.x1, g.T, 56, 190)),
      ];
    },
  },
  '7': {
    c: TABULAR, sb: 0.74,
    tabular: true,
    draw: (g) => [stroke([line(g.x0, g.t, g.x1, g.t), diag(g.x1, g.t, g.x0 + (g.x1 - g.x0) * 0.2, 0, g.h, false, true)])],
  },
  '8': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      const mid = (g.B + g.T) / 2;
      const inset = (g.x1 - g.x0) * 0.07;
      return [
        ringClosed(g.x0 + inset, mid, g.x1 - inset, g.T, g.round),
        ringClosed(g.x0, g.B, g.x1, mid, g.round),
      ];
    },
  },
  '9': {
    c: TABULAR, sb: 0.66,
    tabular: true,
    draw: (g) => {
      const bowlBot = g.cap * 0.44;
      return [
        ringClosed(g.x0, bowlBot, g.x1, g.T, g.round),
        stroke(cut(g, g.x0, g.B, g.x1, g.T, 236, 360)),
      ];
    },
  },

  // -- Punctuation ----------------------------------------------------------------------------

  '.': { c: 0, draw: (g) => [mark(g, g.xm, g.h, g.w)] },
  ',': { c: 0, draw: (g) => [commaShape(g, commaTop(g))] },
  ':': { c: 0, draw: (g) => [mark(g, g.xm, g.h, g.w), mark(g, g.xm, g.xh - g.h, g.w)] },
  ';': { c: 0, draw: (g) => [commaShape(g, commaTop(g)), mark(g, g.xm, g.xh - g.h, g.w)] },
  '!': { c: 0, draw: (g) => [bar(g.xm, g.cap * 0.3, g.xm, g.t), mark(g, g.xm, g.h, g.w)] },
  '?': {
    c: 0.336,
    draw: (g) => {
      const top = g.cap * 0.5;
      const arch = cut(g, g.x0, top, g.x1, g.T, -50, 186, true);
      const tip = tipOf(arch);
      return [
        chain(arch, [diag(tip.x, tip.y, g.xm, g.cap * 0.36, g.h, false, false)], [line(g.xm, g.cap * 0.36, g.xm, g.cap * 0.3)]),
        mark(g, g.xm, g.h, g.w),
      ];
    },
  },
  "'": { c: 0, draw: (g) => [bar(g.xm, g.cap * 0.68, g.xm, g.t)] },
  '"': {
    c: 0.154,
    draw: (g) => {
      const d = Math.max(g.w * 1.5, (g.x1 - g.x0) * 0.5);
      return [bar(g.xm - d / 2, g.cap * 0.68, g.xm - d / 2, g.t), bar(g.xm + d / 2, g.cap * 0.68, g.xm + d / 2, g.t)];
    },
  },
  '‘': { c: 0, draw: (g) => [commaShape(g, g.cap, true)] },
  '’': { c: 0, draw: (g) => [commaShape(g, g.cap)] },
  '“': { c: 0.154, draw: (g) => pairQuotes(g, true) },
  '”': { c: 0.154, draw: (g) => pairQuotes(g, false) },
  '-': { c: 0.085, draw: (g) => [bar(g.x0, g.cap * 0.42, g.x1, g.cap * 0.42)] },
  '–': { c: 0.36, draw: (g) => [bar(g.x0, g.cap * 0.42, g.x1, g.cap * 0.42)] },
  '—': { c: 0.748, draw: (g) => [bar(g.x0, g.cap * 0.42, g.x1, g.cap * 0.42)] },
  '_': { c: 0.428, draw: (g) => [bar(g.x0, -g.desc * 0.5, g.x1, -g.desc * 0.5)] },
  '(': { c: 0.12, sb: 0.66, draw: (g) => parenShape(g, false) },
  ')': { c: 0.12, sb: 0.66, draw: (g) => parenShape(g, true) },
  '[': { c: 0.1, draw: (g) => bracketShape(g, false) },
  ']': { c: 0.1, draw: (g) => bracketShape(g, true) },
  '{': { c: 0.2, draw: (g) => braceShape(g, false) },
  '}': { c: 0.2, draw: (g) => braceShape(g, true) },
  '/': { c: 0.245, sb: 0.74, draw: (g) => [stroke([diag(g.x0, -g.desc * 0.55, g.x1, g.cap, g.h)])] },
  '\\': { c: 0.245, sb: 0.74, draw: (g) => [stroke([diag(g.x0, g.cap, g.x1, -g.desc * 0.55, g.h)])] },
  '|': { c: 0, draw: (g) => [bar(g.xm, -g.desc * 0.55, g.xm, g.cap)] },
  '+': {
    c: 0.428,
    draw: (g) => [bar(g.x0, g.cm, g.x1, g.cm), bar(g.xm, g.cm - (g.x1 - g.x0) / 2, g.xm, g.cm + (g.x1 - g.x0) / 2)],
  },
  '=': {
    c: 0.428,
    draw: (g) => {
      const d = Math.max(g.w * 1.6, g.cap * 0.14);
      return [bar(g.x0, g.cm - d / 2, g.x1, g.cm - d / 2), bar(g.x0, g.cm + d / 2, g.x1, g.cm + d / 2)];
    },
  },
  '<': { c: 0.428, draw: (g) => [stroke([diag(g.x1, g.cm + (g.x1 - g.x0) * 0.5, g.x0, g.cm, g.h, false, false), diag(g.x0, g.cm, g.x1, g.cm - (g.x1 - g.x0) * 0.5, g.h, false, false)])] },
  '>': { c: 0.428, draw: (g) => [stroke([diag(g.x0, g.cm + (g.x1 - g.x0) * 0.5, g.x1, g.cm, g.h, false, false), diag(g.x1, g.cm, g.x0, g.cm - (g.x1 - g.x0) * 0.5, g.h, false, false)])] },
  '*': {
    c: 0.38,
    draw: (g) => {
      // Three bars crossing at one point only read as a star if each arm is clear of the others.
      // Below about one stroke width of reach they merge into a blob, so the reach has a floor.
      const cy = g.cap * 0.74;
      const r = Math.max(g.w, Math.min((g.x1 - g.x0) / 2, g.cap * 0.2));
      const out: Piece[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i * PI) / 3 + PI / 2;
        out.push(bar(g.xm - Math.cos(a) * r, cy - Math.sin(a) * r, g.xm + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      return out;
    },
  },
  '#': {
    c: 0.566,
    draw: (g) => {
      const dx = (g.x1 - g.x0) * 0.26;
      const dy = Math.max(g.w * 0.95, g.cap * 0.15);
      const lean = g.cap * 0.045;
      return [
        bar(g.xm - dx + lean, g.cap * 0.06, g.xm - dx - lean, g.cap * 0.86),
        bar(g.xm + dx + lean, g.cap * 0.06, g.xm + dx - lean, g.cap * 0.86),
        bar(g.x0, g.cm - dy, g.x1, g.cm - dy),
        bar(g.x0, g.cm + dy, g.x1, g.cm + dy),
      ];
    },
  },
  '%': {
    c: 0.748, sb: 0.66,
    draw: (g) => {
      const rr = Math.min((g.x1 - g.x0) * 0.3, g.cap * 0.27);
      return [
        stroke([diag(g.x0, 0, g.x1, g.cap, g.h)]),
        ringClosed(g.x0, g.T - rr * 2, g.x0 + rr * 2, g.T, g.round * rr),
        ringClosed(g.x1 - rr * 2, g.B, g.x1, g.B + rr * 2, g.round * rr),
      ];
    },
  },
  '&': {
    c: 0.702,
    draw: (g) => {
      // A small loop riding a large one, with a tail leaving the bottom right — the ampersand the
      // geometric sans of the twenties settled on, rather than the calligraphic Et ligature, which
      // has no monoline construction that survives being widened.
      // A small loop riding a large bowl, with the bowl kept clear of the right edge so the tail has
      // somewhere to sweep. The geometric sans of the twenties settled on this rather than the
      // calligraphic Et ligature, which has no monoline construction that survives being widened.
      const W = g.x1 - g.x0;
      const loop = W * 0.58;
      const bowl = cut(g, g.x0, g.B, g.x0 + W * 0.8, g.cap * 0.54, 50, 318);
      const tip = tipOf(bowl);
      return [
        ringClosed(g.x0, g.cap * 0.5, g.x0 + loop, g.T, g.round),
        chain(bowl, [diag(tip.x, tip.y, g.x1, g.cap * 0.52, g.h, false, false)]),
      ];
    },
  },
  '@': {
    c: 1, sb: 0.66,
    draw: (g) => {
      const inner = (g.x1 - g.x0) * 0.3;
      const cy = g.cm;
      return [
        ringClosed(g.xm - inner, cy - inner * 0.86, g.xm + inner, cy + inner * 0.86, g.round),
        stroke(cut(g, g.x0, g.B, g.x1, g.T, -46, 296)),
        bar(g.xm + inner, cy - inner * 0.86, g.xm + inner, cy + inner * 0.3),
      ];
    },
  },
  '$': {
    c: 0.496,
    draw: (g) => [...esseShapes(g, g.cap * 0.1, g.cap * 0.9), bar(g.xm, 0, g.xm, g.cap)],
  },
  '£': {
    c: 0.52,
    draw: (g) => {
      const W = g.x1 - g.x0;
      const xs = g.x0 + W * 0.3;
      const top = g.cap * 0.5;
      return [
        chain(cut(g, xs, top, g.x1, g.T, 6, 180), [line(xs, (top + g.T) / 2, xs, g.b)]),
        bar(g.x0, g.b, g.x1, g.b),
        bar(g.x0, g.cap * 0.38, xs + W * 0.44, g.cap * 0.38),
      ];
    },
  },
  '€': {
    c: 0.612,
    draw: (g) => [
      stroke(cut(g, g.x0 + g.w * 0.3, g.B, g.x1, g.T, 56, 304)),
      bar(g.x0, g.cm + g.cap * 0.08, g.x0 + (g.x1 - g.x0) * 0.66, g.cm + g.cap * 0.08),
      bar(g.x0, g.cm - g.cap * 0.08, g.x0 + (g.x1 - g.x0) * 0.66, g.cm - g.cap * 0.08),
    ],
  },
  '°': {
    c: 0.15,
    draw: (g) => {
      const r = Math.min((g.x1 - g.x0) / 2, g.cap * 0.11);
      return [ringClosed(g.xm - r, g.cap - r * 2 - g.h, g.xm + r, g.cap - g.h, g.round * r)];
    },
  },
  '·': { c: 0, draw: (g) => [mark(g, g.xm, g.cm, g.w)] },
  '•': { c: 0.22, draw: (g) => [mark(g, g.xm, g.cap * 0.42, Math.max(g.w * 1.5, g.cap * 0.26))] },
  '…': {
    c: 0.68,
    draw: (g) => {
      const s = (g.x1 - g.x0) / 2;
      return [mark(g, g.x0, g.h, g.w), mark(g, g.x0 + s, g.h, g.w), mark(g, g.x1, g.h, g.w)];
    },
  },
  '~': {
    c: 0.428,
    draw: (g) => {
      const W = g.x1 - g.x0;
      const a = Math.max(g.w * 0.6, g.cap * 0.07);
      const y = g.cap * 0.46;
      return [
        stroke([
          line(g.x0, y - a, g.x0 + W * 0.36, y + a),
          line(g.x0 + W * 0.36, y + a, g.x1 - W * 0.36, y - a),
          line(g.x1 - W * 0.36, y - a, g.x1, y + a),
        ]),
      ];
    },
  },

  // -- Ligature letters -----------------------------------------------------------------------
  // Not accents: these are single letters that happen to have grown out of two, and each needs its
  // own drawing. Without them the font cannot set Danish, Norwegian, French or German.

  'Æ': {
    c: 0.98, sb: 0.74,
    draw: (g) => {
      const W = g.x1 - g.x0;
      const j = g.x0 + W * 0.44;
      const crossY = g.cm;
      return [
        stroke([diag(g.x0, 0, j, g.t, g.h, true, false)]),
        bar(j, g.b, j, g.t),
        bar(j, g.t, g.x1, g.t),
        bar(g.x0 + W * 0.44 * (crossY / g.cap), crossY, g.x1 - g.w * 0.16, crossY),
        bar(j, g.b, g.x1, g.b),
      ];
    },
  },
  'Œ': {
    c: 1.02, sb: 0.74,
    draw: (g) => {
      const W = g.x1 - g.x0;
      const j = g.x0 + W * 0.46;
      return [
        stroke(cut(g, g.x0, g.B, g.x0 + (j - g.x0) * 2, g.T, 90, 270)),
        bar(j, g.b, j, g.t),
        bar(j, g.t, g.x1, g.t),
        bar(j, g.cm, g.x1 - g.w * 0.16, g.cm),
        bar(j, g.b, g.x1, g.b),
      ];
    },
  },
  'æ': {
    c: 1.24, lower: true, sb: 0.74,
    draw: (g) => {
      // The left half has to be the tool's own single-storey 'a' — a bowl with a *flat* right side,
      // closed by a stem — or æ and œ come out as the same drawing. A ring would not do it: at full
      // roundness a ring has no flat side to distinguish it from the o in œ.
      const W = g.x1 - g.x0;
      const j = g.x0 + W * 0.44;
      return [
        stroke(cut(g, g.x0, g.B, g.x0 + (j - g.x0) * 2, g.XT, 90, 270)),
        bar(j, g.b, j, g.xt),
        bar(j, g.ym, g.x1, g.ym),
        stroke(cut(g, j, g.B, g.x1, g.XT, 0, 322)),
      ];
    },
  },
  'œ': {
    c: 1.3, lower: true, sb: 0.66,
    draw: (g) => {
      const W = g.x1 - g.x0;
      const j = g.x0 + W * 0.48;
      return [
        ringClosed(g.x0, g.B, j, g.XT, g.round),
        bar(j - g.w * 0.3, g.ym, g.x1, g.ym),
        stroke(cut(g, j - g.w * 0.3, g.B, g.x1, g.XT, 0, 322)),
      ];
    },
  },
  'ß': {
    c: 0.72, lower: true,
    draw: (g) => {
      // What separates an eszett from a B is that the lower bowl never closes back onto the stem —
      // it runs round and stops, leaving the foot of the stem standing free. Closing it draws a B,
      // which is exactly what the first attempt here did.
      const W = g.x1 - g.x0;
      const waist = g.xh * 0.5;
      return [
        bar(g.x0, g.b, g.x0, g.at),
        chain(
          bowlRSegs(g.x0, g.x1 - g.w * 0.06, waist, g.at, g.round),
          cut(g, g.x0 + W * 0.24, g.b, g.x1, waist, -124, 92, true),
        ),
      ];
    },
  },

  // -- Accented letters -----------------------------------------------------------------------
  // A dotless i, so that the accents on i replace the tittle rather than stack on top of it. It
  // is also a letter in its own right in Turkish, which is reason enough to map it.
  'ı': { c: 0, lower: true, draw: (g) => [bar(g.xm, g.b, g.xm, g.xt)] },
  'À': { of: { base: 'A', mark: 'grave' } },
  'Á': { of: { base: 'A', mark: 'acute' } },
  'Â': { of: { base: 'A', mark: 'circumflex' } },
  'Ã': { of: { base: 'A', mark: 'tilde' } },
  'Ä': { of: { base: 'A', mark: 'dieresis' } },
  'Å': { of: { base: 'A', mark: 'ring' } },
  'Ç': { of: { base: 'C', mark: 'cedilla' } },
  'È': { of: { base: 'E', mark: 'grave' } },
  'É': { of: { base: 'E', mark: 'acute' } },
  'Ê': { of: { base: 'E', mark: 'circumflex' } },
  'Ë': { of: { base: 'E', mark: 'dieresis' } },
  'Ì': { of: { base: 'I', mark: 'grave' } },
  'Í': { of: { base: 'I', mark: 'acute' } },
  'Î': { of: { base: 'I', mark: 'circumflex' } },
  'Ï': { of: { base: 'I', mark: 'dieresis' } },
  'Ñ': { of: { base: 'N', mark: 'tilde' } },
  'Ò': { of: { base: 'O', mark: 'grave' } },
  'Ó': { of: { base: 'O', mark: 'acute' } },
  'Ô': { of: { base: 'O', mark: 'circumflex' } },
  'Õ': { of: { base: 'O', mark: 'tilde' } },
  'Ö': { of: { base: 'O', mark: 'dieresis' } },
  'Ø': { of: { base: 'O', mark: 'slash' } },
  'Ù': { of: { base: 'U', mark: 'grave' } },
  'Ú': { of: { base: 'U', mark: 'acute' } },
  'Û': { of: { base: 'U', mark: 'circumflex' } },
  'Ü': { of: { base: 'U', mark: 'dieresis' } },
  'Ý': { of: { base: 'Y', mark: 'acute' } },
  'Ÿ': { of: { base: 'Y', mark: 'dieresis' } },
  'Š': { of: { base: 'S', mark: 'caron' } },
  'Ž': { of: { base: 'Z', mark: 'caron' } },
  'à': { of: { base: 'a', mark: 'grave' } },
  'á': { of: { base: 'a', mark: 'acute' } },
  'â': { of: { base: 'a', mark: 'circumflex' } },
  'ã': { of: { base: 'a', mark: 'tilde' } },
  'ä': { of: { base: 'a', mark: 'dieresis' } },
  'å': { of: { base: 'a', mark: 'ring' } },
  'ç': { of: { base: 'c', mark: 'cedilla' } },
  'è': { of: { base: 'e', mark: 'grave' } },
  'é': { of: { base: 'e', mark: 'acute' } },
  'ê': { of: { base: 'e', mark: 'circumflex' } },
  'ë': { of: { base: 'e', mark: 'dieresis' } },
  'ì': { of: { base: 'ı', mark: 'grave' } },
  'í': { of: { base: 'ı', mark: 'acute' } },
  'î': { of: { base: 'ı', mark: 'circumflex' } },
  'ï': { of: { base: 'ı', mark: 'dieresis' } },
  'ñ': { of: { base: 'n', mark: 'tilde' } },
  'ò': { of: { base: 'o', mark: 'grave' } },
  'ó': { of: { base: 'o', mark: 'acute' } },
  'ô': { of: { base: 'o', mark: 'circumflex' } },
  'õ': { of: { base: 'o', mark: 'tilde' } },
  'ö': { of: { base: 'o', mark: 'dieresis' } },
  'ø': { of: { base: 'o', mark: 'slash' } },
  'ù': { of: { base: 'u', mark: 'grave' } },
  'ú': { of: { base: 'u', mark: 'acute' } },
  'û': { of: { base: 'u', mark: 'circumflex' } },
  'ü': { of: { base: 'u', mark: 'dieresis' } },
  'ý': { of: { base: 'y', mark: 'acute' } },
  'ÿ': { of: { base: 'y', mark: 'dieresis' } },
  'š': { of: { base: 's', mark: 'caron' } },
  'ž': { of: { base: 'z', mark: 'caron' } },

};

/** Where a tittle sits above an i or a j: clear of the x-height, tucked under the ascender. */
function tittleY(g: Geo): number {
  const gap = Math.max(g.w * 0.62, g.cap * 0.06);
  return Math.min(g.xh + gap + g.w / 2, g.asc - g.w / 2);
}

/**
 * The comma, and the quotes that are commas set high — one shape, drawn four ways.
 *
 * In a monoline face a comma has no thick and thin to curl, so what is left of it is the lean and
 * the drop below the baseline. Both are scaled against the weight as well as the cap height, so a
 * hairline comma stays a mark rather than shrinking into a speck.
 */
function commaShape(g: Geo, topY: number, flipped = false): Stroke {
  const drop = Math.max(g.w * 1.7, g.cap * 0.19);
  const lean = Math.max(g.w * 0.42, g.cap * 0.05);
  return flipped
    ? stroke([diag(g.xm - lean, topY, g.xm + lean, topY - drop, g.h, false, false)])
    : stroke([diag(g.xm + lean, topY, g.xm - lean, topY - drop, g.h, false, false)]);
}

/** Where a comma starts, so that the tail of it clears the baseline by a sensible amount. */
function commaTop(g: Geo): number {
  return Math.max(g.w * 1.2, g.cap * 0.15);
}

function pairQuotes(g: Geo, opening: boolean): Piece[] {
  const d = Math.max(g.w * 1.6, (g.x1 - g.x0) * 0.55);
  const y = g.cap;
  return [
    commaShape({ ...g, xm: g.xm - d / 2 }, y, opening),
    commaShape({ ...g, xm: g.xm + d / 2 }, y, opening),
  ];
}

/**
 * A parenthesis, as one circular arc through three points.
 *
 * Built from the ring like everything else it would come out as a rounded rectangle, which is a
 * bracket, not a parenthesis. The bow is instead the arc that passes through both tips and the
 * midpoint of the bulge, whose radius falls straight out of the sagitta: `R = (b² + h²) / 2b`. That
 * keeps it a true bow at every height the descender slider can ask for.
 */
function parenShape(g: Geo, right: boolean): Piece[] {
  const top = g.cap + g.w * 0.26 - g.h;
  const bot = -g.desc * 0.6 + g.h;
  const mid = (top + bot) / 2;
  const half = (top - bot) / 2;
  const reach = Math.max(g.w * 0.85, (g.x1 - g.x0) * 0.95);
  const R = (reach * reach + half * half) / (2 * reach);
  const edge = right ? g.x0 : g.x1;
  const cx = right ? edge - R + reach : edge + R - reach;
  const aTop = Math.atan2(top - mid, edge - cx);
  const aBot = Math.atan2(bot - mid, edge - cx);
  // A left bow has to be walked the long way round, past nine o'clock; a right bow the short way.
  return [stroke([arc(cx, mid, R, aTop, right ? aBot : aBot + PI * 2)])];
}

/** A bracket: a stem and two arms, square whatever the roundness slider says. */
function bracketShape(g: Geo, right: boolean): Piece[] {
  const top = g.cap + g.w * 0.26 - g.h;
  const bot = -g.desc * 0.6 + g.h;
  const armLen = Math.max(g.w * 0.62, (g.x1 - g.x0) * 0.8);
  const x = right ? g.x1 : g.x0;
  const s = right ? -1 : 1;
  return [stroke([line(x + s * armLen, top, x, top), line(x, top, x, bot), line(x, bot, x + s * armLen, bot)])];
}

/**
 * A brace, as a run of corners rather than a run of curves.
 *
 * The join disc that rounds every other corner in the face rounds these too, which means the brace
 * picks up the weight and the softness of whatever the sliders are set to without needing its own
 * arc maths. At heavy weights it reads as a fat bracket, which is what heavy braces look like.
 */
function braceShape(g: Geo, right: boolean): Piece[] {
  const top = g.cap + g.w * 0.3 - g.h;
  const bot = -g.desc * 0.6 + g.h;
  const mid = (top + bot) / 2;
  const reach = Math.max(g.w * 1.15, (g.x1 - g.x0) * 0.8);
  const s = right ? -1 : 1;
  const xIn = right ? g.x0 + reach : g.x0 + reach;
  const xMid = xIn - s * reach * 0.45;
  const xOut = xIn - s * reach;
  const d = Math.min((top - mid) * 0.5, reach * 0.9);
  return [
    stroke([
      line(xIn, top, xMid, top),
      line(xMid, top, xMid, mid + d),
      line(xMid, mid + d, xOut, mid),
      line(xOut, mid, xMid, mid - d),
      line(xMid, mid - d, xMid, bot),
      line(xMid, bot, xIn, bot),
    ]),
  ];
}

// ---------------------------------------------------------------------------------------------
// Alternates
// ---------------------------------------------------------------------------------------------

/**
 * Different letters, not different settings.
 *
 * Everything above this line is one skeleton per character, treated in different ways. That is
 * enough to move a face a long way, and not nearly enough to change what it *is*: a single-storey
 * a, a vertical-sided M and a horizontal bar on the e will read as descended from Futura at any
 * weight, width or serif length you like. The letters that carry a typeface's identity are the ones
 * with more than one accepted construction, and swapping those is the difference between a variant
 * and a different design.
 *
 * These are the same switches a real font ships as character variants — the reason JetBrains Mono
 * offers you a slashed zero and IBM Plex offers a one-storey a. Here they are the main event.
 */
export interface Alternate {
  key: AltKey;
  label: string;
  /** What it changes and why anybody would want it. */
  note: string;
  /**
   * The characters it changes, and how.
   *
   * `draw` replaces the letter; `add` leaves it alone and puts something on top of it. The second
   * exists so that a change affecting seven letters in the same small way — an entry stroke on
   * every stem that starts at the x-height — does not mean seven copies of those letters, each of
   * which would then have to be kept in step with the original by hand.
   */
  chars: Record<string, { c?: number; sb?: number; draw?: (g: Geo) => Piece[]; add?: (g: Geo) => Piece[] }>;
}

export const ALTERNATES: Alternate[] = [
  {
    key: 'a2',
    label: 'Two-storey a',
    note: 'A bowl with a hood over it, instead of a circle with a stem. The single loudest letter in a face.',
    chars: {
      a: {
        c: 0.78,
        draw: (g) => {
          // The hood ends in open air, which is what it does in every two-storey a ever cut: it
          // leaves the stem, arches over, and stops short of the bowl on the left. Running it round
          // far enough to touch was the wrong instinct — an ellipse's left flank is at its own
          // vertical centre, well above where the bowl's flank is, so a hood chased that far dives
          // through the counter instead of landing on anything.
          const bowlTop = g.xh * 0.5;
          return [
            ringClosed(g.x0, g.B, g.x1, bowlTop, g.round),
            bar(g.x1, g.b, g.x1, g.xt),
            stroke(cut(g, g.x0, g.xh * 0.36, g.x1, g.XT, 6, 198)),
          ];
        },
      },
    },
  },
  {
    key: 'g2',
    label: 'Two-storey g',
    note: 'Two bowls and a link, instead of one bowl and a hook. The mark of a face descended from a book.',
    chars: {
      g: {
        c: 0.8,
        draw: (g) => {
          // Two bowls of deliberately different shape: the upper one round and small, the lower one
          // wide and shallow. Drawing them the same size makes an 8 with an ear, which is the trap
          // this letter sets — the loop below the line is the wider of the two in every face that
          // has one, because it has less height to work with and still has to hold a counter.
          const W = g.x1 - g.x0;
          const earRoom = W * 0.16;
          const upBot = g.xh * 0.42;
          const loTop = g.xh * 0.12;
          const link = g.x0 + W * 0.34;
          return [
            ringClosed(g.x0, upBot, g.x1 - earRoom, g.XT, g.round),
            bar(link, loTop, link, upBot),
            ringClosed(g.x0, g.DB, g.x1, loTop, g.round),
            stroke([
              line(g.x1 - earRoom, g.XT - g.w * 0.35, g.x1 - earRoom * 0.15, g.XT - g.w * 0.1),
            ]),
          ];
        },
      },
    },
  },
  {
    key: 'entry',
    label: 'Angled entries',
    note: 'A short flag where a stem meets the x-height, left by a broad nib starting the stroke.',
    chars: Object.fromEntries(
      ['i', 'j', 'm', 'n', 'p', 'r', 'u'].map((ch) => [
        ch,
        {
          add: (g: Geo) => {
            const reach = Math.max(g.w * 0.62, g.xh * 0.1);
            const x = ch === 'u' ? g.x0 : g.x0;
            return [stroke([diag(x - reach, g.xt - reach * 0.55, x, g.xt, g.h, false, false)])];
          },
        },
      ]),
    ),
  },
  {
    key: 'eangle',
    label: 'Angled e bar',
    note: 'Tilts the crossbar of the e and opens its aperture. A humanist marker; the flat bar is the geometric one.',
    chars: {
      e: {
        draw: (g) => {
          // The aperture moves *below* the bar rather than across it. Opening the bowl at three
          // o'clock, where the geometric e opens, leaves the angled bar ending in mid-air with
          // nothing to meet; opening it at five leaves the bar a wall to land on and gives the
          // letter the open throat that is the whole point of the humanist construction.
          const tilt = g.xh * 0.035;
          return [
            bar(g.x0, g.ym - tilt, g.x1, g.ym + tilt),
            stroke(cut(g, g.x0, g.B, g.x1, g.XT, -8, 304)),
          ];
        },
      },
    },
  },
  {
    key: 'rarm',
    label: 'Straight r arm',
    note: 'Replaces the r\u2019s curved shoulder with a straight arm off the stem.',
    chars: {
      r: {
        c: 0.4,
        draw: (g) => {
          // The arm is capped against the stroke rather than the box. In a monospaced face the box
          // is stretched to fill a slot, and an arm sized to it comes out as a long thin diagonal
          // across the whole slot — a tick, not a letter.
          const reach = Math.min(g.x1 - g.x0, Math.max(g.w * 1.5, (g.x1 - g.x0) * 0.45));
          return [
            bar(g.x0, g.b, g.x0, g.xt),
            stroke([diag(g.x0, g.xh * 0.66, g.x0 + reach, g.xt, g.h, false, false)]),
          ];
        },
      },
    },
  },
  {
    key: 'ycurve',
    label: 'Curved y tail',
    note: 'Hooks the descender of the y to the left instead of running it straight down.',
    chars: {
      y: {
        draw: (g) => {
          const r = hook(g, (g.x1 - g.x0) * 1.1, (g.b - g.DB) * 1.3);
          const stem = g.xm + (g.x1 - g.xm) * 0.24;
          return [
            stroke([diag(g.x0, g.xh, stem, g.b, g.h, true, false)]),
            chain(
              [diag(g.x1, g.xh, stem, g.b, g.h, true, false)],
              [line(stem, g.b, stem, g.DB + r)],
              r > 0 ? [arc(stem - r, g.DB + r, r, 0, -PI / 2)] : [],
              [line(stem - r, g.DB, g.x0 + (g.x1 - g.x0) * 0.08, g.DB)],
            ),
          ];
        },
      },
    },
  },
  {
    key: 'msplay',
    label: 'Splayed M',
    note: 'Leans the outer strokes of the M outward, the way a Roman inscription cut them.',
    chars: {
      M: {
        draw: (g) => {
          const lean = (g.x1 - g.x0) * 0.09;
          return [
            stroke([diag(g.x0, 0, g.x0 + lean, g.t, g.h, true, false)]),
            stroke([
              diag(g.x0 + lean, g.t, g.xm, g.cap * 0.1, g.h, false, false),
              diag(g.xm, g.cap * 0.1, g.x1 - lean, g.t, g.h, false, false),
            ]),
            stroke([diag(g.x1, 0, g.x1 - lean, g.t, g.h, true, false)]),
          ];
        },
      },
    },
  },
  {
    key: 'wcross',
    label: 'Crossed W',
    note: 'Runs the W\u2019s middle strokes all the way to the cap line so they cross.',
    chars: {
      W: {
        draw: (g) => {
          const a = g.x0 + (g.x1 - g.x0) * 0.34;
          const b = g.x1 - (g.x1 - g.x0) * 0.34;
          return [
            stroke([diag(g.x0, g.cap, a, g.b, g.h, true, false)]),
            stroke([diag(g.xm - (g.x1 - g.x0) * 0.07, g.cap, b, g.b, g.h, true, false)]),
            stroke([diag(a, g.b, g.xm + (g.x1 - g.x0) * 0.07, g.cap, g.h, false, true)]),
            stroke([diag(b, g.b, g.x1, g.cap, g.h, false, true)]),
          ];
        },
      },
    },
  },
  {
    key: 'ltail',
    label: 'Tailed l',
    note: 'Curls the foot of the l to the right so it cannot be read as a 1 or an I. Standard in code faces.',
    chars: {
      l: {
        c: 0.3,
        draw: (g) => {
          const r = hook(g, (g.x1 - g.x0) * 1.4, g.xh * 0.5);
          const x = g.x0 + (g.x1 - g.x0) * 0.18;
          return [
            chain([line(x, g.at, x, g.b + r)], r > 0 ? [arc(x + r, g.b + r, r, PI, PI * 1.5)] : [], [
              line(x + r, g.b, g.x1, g.b),
            ]),
          ];
        },
      },
    },
  },
  {
    key: 'ifoot',
    label: 'Footed i and j',
    note: 'Gives the i and j a flag and a foot so they fill a monospaced slot instead of rattling in it.',
    chars: {
      i: {
        c: 0.36,
        draw: (g) => {
          const x = g.xm;
          return [
            bar(x, g.b, x, g.xt),
            bar(g.x0, g.b, g.x1, g.b),
            stroke([diag(g.x0 + (x - g.x0) * 0.35, g.xh * 0.72, x, g.xt, g.h, true, false)]),
            mark(g, x, tittleY(g), g.w),
          ];
        },
      },
      j: {
        c: 0.36,
        draw: (g) => {
          const r = hook(g, (g.x1 - g.x0) * 1.2, (g.b - g.DB) * 1.2);
          const x = g.x1 - (g.x1 - g.x0) * 0.2;
          return [
            chain([line(x, g.xt, x, g.DB + r)], r > 0 ? [arc(x - r, g.DB + r, r, 0, -PI / 2)] : [], [
              line(x - r, g.DB, g.x0, g.DB),
            ]),
            stroke([diag(g.x0 + (x - g.x0) * 0.3, g.xh * 0.72, x, g.xt, g.h, true, false)]),
            mark(g, x, tittleY(g), g.w),
          ];
        },
      },
    },
  },
  {
    key: 'zeroslash',
    label: 'Slashed zero',
    note: 'A stroke through the zero so it cannot be read as a capital O. The other half of a code face.',
    chars: {
      '0': {
        draw: (g) => [
          ringClosed(g.x0, g.B, g.x1, g.T, g.round),
          stroke([diag(g.x0 + (g.x1 - g.x0) * 0.12, g.cap * 0.18, g.x1 - (g.x1 - g.x0) * 0.12, g.cap * 0.82, g.h, false, false)]),
        ],
      },
    },
  },
  {
    key: 'zerodot',
    label: 'Dotted zero',
    note: 'The quieter way to disambiguate a zero. Popular where a slash looks too much like a Scandinavian \u00f8.',
    chars: {
      '0': {
        draw: (g) => [
          ringClosed(g.x0, g.B, g.x1, g.T, g.round),
          mark(g, g.xm, g.cm, Math.max(g.w * 0.7, g.cap * 0.075)),
        ],
      },
    },
  },
  {
    key: 'onefoot',
    label: 'Footed 1',
    note: 'A base bar on the 1, so it holds its own next to a slashed zero.',
    chars: {
      '1': {
        draw: (g) => {
          const x = g.xm + (g.x1 - g.xm) * 0.18;
          const f = Math.max(g.w * 1.15, (g.x1 - g.x0) * 0.46);
          const drop = Math.max(g.w * 1.35, g.cap * 0.22);
          return [
            bar(x, g.b, x, g.t),
            stroke([diag(x - f, g.cap - drop, x, g.t, g.h, true, false)]),
            bar(Math.max(g.x0, x - f * 0.95), g.b, Math.min(g.x1, x + f * 0.95), g.b),
          ];
        },
      },
    },
  },
];

const ALT_BY_KEY = new Map(ALTERNATES.map((a) => [a.key, a]));

interface AltEffect {
  c?: number;
  sb?: number;
  draw?: (g: Geo) => Piece[];
  adds: Array<(g: Geo) => Piece[]>;
}

/**
 * Everything the active alternates do to one character.
 *
 * At most one of them may *replace* the drawing — the last one listed wins, so a style can layer —
 * but any number may add to it, which is what lets an entry stroke sit on top of a two-storey a
 * without either of them knowing about the other.
 */
function altFor(ch: string, alts: readonly AltKey[]): AltEffect | null {
  let effect: AltEffect | null = null;
  for (const key of alts) {
    const hit = ALT_BY_KEY.get(key)?.chars[ch];
    if (!hit) continue;
    effect ??= { adds: [] };
    if (hit.draw) {
      effect.draw = hit.draw;
      effect.c = hit.c;
      effect.sb = hit.sb;
    }
    if (hit.add) effect.adds.push(hit.add);
  }
  return effect;
}

// ---------------------------------------------------------------------------------------------
// Building a glyph
// ---------------------------------------------------------------------------------------------

export const SUPPORTED: string[] = Object.keys(TABLE);

export function hasGlyph(ch: string): boolean {
  return ch in TABLE;
}

/**
 * The advance of a tabular figure.
 *
 * Every digit is given the same advance so that a column of numbers lines up, which costs nothing
 * and is the sort of thing whose absence people feel without being able to name.
 */
function tabularOuter(m: Metrics): number {
  return units(m).uc * TABULAR + m.w * 2;
}

/**
 * The slot every character sits in when the face is monospaced.
 *
 * Chosen a little narrower than the widest letter would naturally want, because the alternative —
 * sizing the slot to fit an unsqueezed m — leaves every other letter marooned in white space. The
 * m and the w are condensed to fit instead, which is what monospaced faces have always done.
 */
export function monoSlot(m: Metrics): number {
  return Math.round((units(m).uc * 0.72 + m.w * 2) * m.xscale + m.track);
}

/**
 * The counter a glyph is given so it sits in the monospaced slot.
 *
 * Fitting a slot is not only about squeezing: an m has to come in, but an o, an e and an r all have
 * to go *out*, or every letter but a handful floats in a puddle of its own white space and the page
 * reads as though the spacing broke. So the counter is simply set to whatever fills the slot, which
 * makes every letter that has a hole in it the same width — which is the point.
 *
 * Only the counter gives. Narrowing an m by thinning its three stems would leave it paler than the
 * letters either side, and an even colour down the page is most of what a monospaced face is for.
 *
 * The two limits stop the extremes from turning silly. Without a ceiling an r, whose natural
 * counter is a fifth of an o's, grows a shoulder halfway across its slot.
 */
function monoFit(m: Metrics, counter: number, lower: boolean): number {
  if (counter <= 0) return counter;
  const u = lower ? units(m).ul : units(m).uc;
  if (u <= 0) return counter;
  const room = (monoSlot(m) - m.track) / m.xscale - m.w * 2;
  const fits = room / u;
  // Fitting is not symmetric. A letter wider than the slot *must* come in or it collides with its
  // neighbours, so an m is squeezed the whole way. A letter narrower than the slot only needs to
  // stop looking marooned, and stretching it the whole way is what made the first version of this
  // read as a distorted sans rather than a monospaced one: every o, e and n came out the same
  // squat oval. It is moved most of the way and the sidebearings absorb the rest, which is what
  // real monospaced faces do — they are spaced generously, not drawn wide.
  if (fits < counter) return Math.max(fits, counter * 0.4);
  return counter + (fits - counter) * 0.55;
}

/**
 * Which characters take serifs.
 *
 * Letters and figures, and nothing else. A comma with a serif on it is a comma with a hook, an
 * accent with one is a smear, and both are the kind of thing that only shows up once somebody has
 * set a real paragraph. Deriving the rule from the character rather than annotating ninety entries
 * means it also holds for every accented letter without any of them being listed.
 */
const SERIFED = /^[\p{L}\p{N}]$/u;

function withoutSerifs(pieces: Piece[]): Piece[] {
  return pieces.map((p) => (p.kind === 'stroke' ? { ...p, serif: false } : p));
}

/**
 * The letter underneath an accented one.
 *
 * Kerning is worked out per base letter and shared with every accented form of it, which is what
 * real fonts do: a dieresis sits above the cap and changes nothing about where the left and right
 * flanks of the letter are, so measuring \u00c4V separately from AV would spend table space to
 * arrive at the same number.
 */
export function baseOf(ch: string): string {
  return TABLE[ch]?.of?.base ?? ch;
}

export function buildGlyph(ch: string, m: Metrics, alts: readonly AltKey[] = []): Glyph | null {
  const e = TABLE[ch];
  if (!e) return null;

  if (e.of) {
    // An accented letter keeps its base letter's width and spacing exactly. Anything else and a
    // word with an accent in it sets to a different measure than the same word without one.
    const base = buildGlyph(e.of.base, m, alts);
    const under = TABLE[e.of.base];
    if (!base || !under) return null;
    const underAlt = altFor(e.of.base, alts);
    const underRaw = underAlt?.c ?? under.c ?? 0;
    const underCounter = m.mono ? monoFit(m, underRaw, under.lower ?? false) : underRaw;
    const g = geo(m, underCounter, under.lower ?? false);
    const gap = Math.max(m.w * 0.5, m.cap * 0.05);
    const foot =
      e.of.mark === 'cedilla' || e.of.mark === 'slash' ? 0 : (under.lower ? m.xh : m.cap) + gap;
    return {
      ...base,
      pieces: [
        ...base.pieces,
        ...withoutSerifs(markPieces(g, e.of.mark, g.outer / 2, foot, under.lower ?? false)),
      ],
    };
  }

  const alt = altFor(ch, alts);
  const declared = alt?.c ?? e.c ?? 0;
  const counter = m.mono ? monoFit(m, declared, e.lower ?? false) : declared;
  const g = geo(m, counter, e.lower ?? false);
  const draw = alt?.draw ?? e.draw;
  const raw = [...(draw ? draw(g) : []), ...(alt?.adds ?? []).flatMap((f) => f(g))];
  const pieces = SERIFED.test(ch) ? raw : withoutSerifs(raw);
  // Figures share one advance so columns of numbers line up. In a monospaced face everything
  // already does, so the override would only fight the slot.
  const outer = e.tabular && !m.mono ? tabularOuter(m) : g.outer;
  return { outer, sb: alt?.sb ?? e.sb ?? 1, pieces };
}

/** Every character the tool can set, in the order the specimen shows them. */
export const CHARSET: string[] = SUPPORTED;

export type { Pt };
export { poly };
