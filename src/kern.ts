/**
 * Kerning, measured off the letters rather than typed out by hand.
 *
 * A typeface with no kerning announces itself in about four words: AV opens a hole, To leaves the o
 * stranded under the arm of the T, and Ye reads as two separate events. Real foundries close those
 * by hand, a pair at a time, over months — which is not available here, because the letters do not
 * exist until somebody moves a slider, and a table of numbers tuned against one weight is wrong at
 * every other.
 *
 * So the gaps are measured. Each glyph is reduced to a pair of silhouettes — the furthest right its
 * ink reaches in each horizontal band, and the furthest left — and a pair is kerned by comparing
 * those two silhouettes band by band and finding the closest approach. If the closest approach is
 * wider than the letter's own sidebearings would suggest, the pair is pulled together by the
 * difference; if it is tighter, it is pushed apart. That is what a designer's eye is doing when it
 * looks at AV, and unlike a table it is correct at every setting the tool can reach.
 *
 * The measurement is deliberately conservative. Optical kerning that closes every gap completely
 * makes a line look lumpy, because the eye wants a *rhythm* rather than a constant area of white;
 * the correction is applied at a fraction of what the geometry suggests, and small corrections are
 * dropped entirely rather than filling the font with noise.
 */

import type { Contour } from './geom';
import type { DrawnGlyph, Face } from './font';
import { baseOf } from './glyphs';
import { UPM } from './params';

/** Horizontal slices the silhouettes are measured in. Finer than this buys nothing an eye can see. */
const BAND = 28;
const Y_LO = -520;
const Y_HI = 1080;
const BANDS = Math.ceil((Y_HI - Y_LO) / BAND);

/**
 * How much of the geometric correction to actually apply.
 *
 * Never all of it. Closing every gap to the same measurement makes a line look lumpy: the eye wants
 * a rhythm, not a constant area of white, and a pair like AV that genuinely does diverge should
 * still read as slightly open after kerning. Half is about where it stops looking corrected.
 */
const STRENGTH = 0.5;

/** Corrections smaller than this are noise; they cost table space and change nothing. */
const FLOOR = 12;

/** Nothing is ever pulled closer than this, whatever the silhouettes say. */
const MAX_PULL = 0.13;

export interface Profile {
  /** Furthest right the ink reaches in each band, or -Infinity where there is none. */
  right: Float64Array;
  /** Furthest left, or +Infinity where there is none. */
  left: Float64Array;
  /** Ink bounds, for the reference gap. */
  inkLeft: number;
  inkRight: number;
  advance: number;
}

/**
 * Measure one glyph's two silhouettes.
 *
 * Contours are flattened into a flat buffer of coordinates rather than an array of pairs, and the
 * band walk is written out longhand. Both are ugly and both are worth it: this runs for every glyph
 * on screen every time a slider moves, and the version that allocated a small array per point spent
 * more time in the garbage collector than in the measurement, which showed up as a specimen that
 * stuttered under the hand dragging it.
 */
export function profileOf(g: DrawnGlyph): Profile {
  const right = new Float64Array(BANDS).fill(-Infinity);
  const left = new Float64Array(BANDS).fill(Infinity);
  let inkLeft = Infinity;
  let inkRight = -Infinity;

  const buf = scratch;
  for (const c of g.contours) {
    const n = flattenInto(c, buf);
    for (let i = 0; i + 1 < n; i++) {
      const x0 = buf[i * 2]!;
      const y0 = buf[i * 2 + 1]!;
      const x1 = buf[i * 2 + 2]!;
      const y1 = buf[i * 2 + 3]!;
      if (x0 < inkLeft) inkLeft = x0;
      if (x0 > inkRight) inkRight = x0;

      const yLo = y0 < y1 ? y0 : y1;
      const yHi = y0 < y1 ? y1 : y0;
      let b0 = ((yLo - Y_LO) / BAND) | 0;
      let b1 = ((yHi - Y_LO) / BAND) | 0;
      if (b0 < 0) b0 = 0;
      if (b1 > BANDS - 1) b1 = BANDS - 1;
      if (b1 < 0 || b0 > BANDS - 1) continue;
      const dy = y1 - y0;
      const flat = dy > -1e-9 && dy < 1e-9;
      const slope = flat ? 0 : (x1 - x0) / dy;
      // Every band the edge crosses, not just the ones its endpoints land in: a long diagonal
      // registers at its ends and nowhere between, and a diagonal is the shape that needs kerning
      // most.
      for (let b = b0; b <= b1; b++) {
        let ya = Y_LO + b * BAND;
        let yb = ya + BAND;
        if (ya < yLo) ya = yLo;
        if (yb > yHi) yb = yHi;
        if (yb < ya) continue;
        const xa = flat ? x0 : x0 + (ya - y0) * slope;
        const xb = flat ? x1 : x0 + (yb - y0) * slope;
        const lo = xa < xb ? xa : xb;
        const hi = xa < xb ? xb : xa;
        if (hi > right[b]!) right[b] = hi;
        if (lo < left[b]!) left[b] = lo;
      }
    }
  }

  return {
    right,
    left,
    inkLeft: Number.isFinite(inkLeft) ? inkLeft : 0,
    inkRight: Number.isFinite(inkRight) ? inkRight : g.advance,
    advance: g.advance,
  };
}

/** Reused between glyphs; nothing here outlives one call to `profileOf`. */
const scratch = new Float64Array(1 << 14);

/** Flatten a quadratic contour into `out` as x,y pairs. Returns how many points were written. */
function flattenInto(c: Contour, out: Float64Array): number {
  const n = c.length;
  if (n === 0) return 0;
  let k = 0;
  const put = (x: number, y: number) => {
    if (k * 2 + 1 < out.length) {
      out[k * 2] = x;
      out[k * 2 + 1] = y;
      k += 1;
    }
  };
  let start = c.findIndex((p) => p.on);
  let sx: number;
  let sy: number;
  if (start < 0) {
    start = 0;
    sx = (c[0]!.x + c[n - 1]!.x) / 2;
    sy = (c[0]!.y + c[n - 1]!.y) / 2;
  } else {
    sx = c[start]!.x;
    sy = c[start]!.y;
    start += 1;
  }
  let cx = sx;
  let cy = sy;
  put(cx, cy);
  const quad = (ax: number, ay: number, bx: number, by: number) => {
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const u = 1 - t;
      put(u * u * cx + 2 * u * t * ax + t * t * bx, u * u * cy + 2 * u * t * ay + t * t * by);
    }
    cx = bx;
    cy = by;
  };
  let i = 0;
  while (i < n) {
    const p = c[(start + i) % n]!;
    if (p.on) {
      cx = p.x;
      cy = p.y;
      put(cx, cy);
      i += 1;
      continue;
    }
    const q = c[(start + i + 1) % n]!;
    if (q.on) {
      quad(p.x, p.y, q.x, q.y);
      i += 2;
    } else {
      quad(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      i += 1;
    }
  }
  put(sx, sy);
  return k;
}

/**
 * How far a pair should move, in font units. Negative pulls together.
 *
 * The reference is what the two letters' own sidebearings already promise — the gap a flat-sided
 * pair like `nn` would get. Anything the silhouettes open up beyond that is the hole the eye sees.
 */
export function kernFor(a: Profile, b: Profile, weight: number): number {
  let closest = Infinity;
  for (let i = 0; i < BANDS; i++) {
    const ra = a.right[i]!;
    const lb = b.left[i]!;
    if (ra === -Infinity || lb === Infinity) continue;
    const gap = a.advance + lb - ra;
    if (gap < closest) closest = gap;
  }
  if (!Number.isFinite(closest)) return 0;

  const reference = a.advance - a.inkRight + b.inkLeft;
  const excess = closest - reference;
  if (Math.abs(excess) < 1) return 0;

  // A pair may never be pulled closer than this, whatever the silhouettes say. Two letters touching
  // is worse than two letters apart, and a measurement in horizontal bands cannot see that a serif
  // is about to meet a diagonal between two of them.
  const limit = Math.max(weight * 0.85, UPM * 0.038);
  const wanted = -excess * STRENGTH;
  const capped = Math.max(-MAX_PULL * UPM, Math.min(UPM * 0.06, wanted));
  const room = closest - limit;
  const value = Math.round(Math.max(capped, -Math.max(0, room)));
  return Math.abs(value) < FLOOR ? 0 : value;
}

/**
 * The kerning for one face, worked out the first time anybody asks and kept.
 *
 * The specimen only ever needs the handful of pairs actually on screen, so those are measured one
 * at a time; the font file needs all of them and pays for it once, at the moment of download.
 */
export class Kerning {
  private profiles = new Map<string, Profile>();
  private pairs = new Map<string, number>();
  private grid: KernClasses | null = null;

  constructor(private face: Face) {}

  private profile(ch: string): Profile | null {
    const cached = this.profiles.get(ch);
    if (cached) return cached;
    const g = this.face.glyphs.get(ch);
    if (!g) return null;
    const p = profileOf(g);
    this.profiles.set(ch, p);
    return p;
  }

  between(a: string, b: string): number {
    if (a === ' ' || b === ' ' || !a || !b) return 0;
    // Always measured on the base letters, so what the specimen shows is exactly what the class
    // matrix in the font file will do.
    a = baseOf(a);
    b = baseOf(b);
    const key = a + b;
    const hit = this.pairs.get(key);
    if (hit !== undefined) return hit;
    const pa = this.profile(a);
    const pb = this.profile(b);
    const value = pa && pb ? kernFor(pa, pb, this.face.metrics.w * this.face.metrics.xscale) : 0;
    this.pairs.set(key, value);
    return value;
  }

  /**
   * Every pair, as a class matrix.
   *
   * Pair-by-pair was the first attempt and it does not fit: a hundred and seventy glyphs against
   * each other produced twelve thousand kerned pairs, and the offsets inside an OpenType pair table
   * are sixteen bits, so past about sixty-four kilobytes they wrap and the font stops parsing. It
   * failed on eight of the fifty-four proof faces and read as a font bug rather than a size limit,
   * which is the kind of failure worth writing down.
   *
   * Collapsing to one class per base letter fixes both problems at once. The matrix is dense and
   * bounded — ninety-odd classes square, under twenty kilobytes — and every accented form inherits
   * its base letter's kerning for nothing.
   */
  classes(): KernClasses {
    if (this.grid) return this.grid;
    const chars = [...this.face.glyphs.keys()].filter((c) => c !== ' ');
    const reps: string[] = [];
    const repOf = new Map<string, number>();
    for (const ch of chars) {
      const base = baseOf(ch);
      let at = reps.indexOf(base);
      if (at < 0) {
        at = reps.length;
        reps.push(base);
      }
      repOf.set(ch, at);
    }

    const n = reps.length;
    const raw = new Int16Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) raw[i * n + j] = this.between(reps[i]!, reps[j]!);
    }

    // Letters that kern identically are the same letter as far as this table is concerned. An H, an
    // I, an M and an N present the same flat flank to whatever follows them, so they share a row;
    // once rows and columns are folded, a hundred and eleven classes square collapses to a fraction
    // of that and most of the twenty-five kilobytes of zeroes go with it.
    const fold = (get: (i: number, j: number) => number): number[] => {
      const groups = new Map<string, number>();
      const assign: number[] = [];
      for (let i = 0; i < n; i++) {
        let empty = true;
        const parts: string[] = [];
        for (let j = 0; j < n; j++) {
          const v = get(i, j);
          if (v !== 0) empty = false;
          parts.push(String(v));
        }
        if (empty) {
          assign.push(0);
          continue;
        }
        const key = parts.join(',');
        let id = groups.get(key);
        if (id === undefined) {
          id = groups.size + 1;
          groups.set(key, id);
        }
        assign.push(id);
      }
      return assign;
    };

    const rowClass = fold((i, j) => raw[i * n + j]!);
    const colClass = fold((j, i) => raw[i * n + j]!);
    const count1 = Math.max(0, ...rowClass) + 1;
    const count2 = Math.max(0, ...colClass) + 1;

    const values = new Int16Array(count1 * count2);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = raw[i * n + j]!;
        if (v !== 0) values[rowClass[i]! * count2 + colClass[j]!] = v;
      }
    }

    const left = new Map<string, number>();
    const right = new Map<string, number>();
    for (const ch of chars) {
      const r = repOf.get(ch)!;
      left.set(ch, rowClass[r]!);
      right.set(ch, colClass[r]!);
    }

    this.grid = { left, right, count1, count2, values };
    return this.grid;
  }
}

export interface KernClasses {
  /** Which class each character belongs to when it is the *first* of a pair. */
  left: Map<string, number>;
  /** And when it is the second. The two are folded independently. */
  right: Map<string, number>;
  count1: number;
  count2: number;
  /** Adjustments, row-major, `count1 × count2`. */
  values: Int16Array;
}
