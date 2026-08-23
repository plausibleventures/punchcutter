/**
 * Turning a skeleton into a fillable shape.
 *
 * This began by restricting the skeleton to lines and circular arcs, because those are the only two
 * curves whose offset is exact — a line offsets to a rectangle, a circular arc to an annulus — and
 * that made every join trivial. It also made every bowl a rounded rectangle and every stroke the
 * same width from end to end, and those two facts turned out to be the ceiling on the whole tool:
 * put any real typeface next to it and the letters read as drawn with a marker, because a bowl that
 * is a stadium is not a bowl and a stroke that never thins is not a stroke.
 *
 * So offsets are computed rather than derived now. A segment is sampled, each sample is pushed out
 * along its own normal by half of whatever the width is *there*, and consecutive samples are joined
 * by the quadratic that passes through both and through the offset of the midpoint between them.
 * A straight run at constant width still comes out as an exact rectangle from a single step, so
 * nothing that was cheap became expensive; what changed is that the curve may now be an ellipse and
 * the width may now vary along it.
 *
 * A punchcutter cut a letter as a solid. This tool draws letters the other way round — as the path
 * a pen travels, which is how a type designer actually thinks about a monoline face — and then has
 * to recover the solid before anything can be filled or written into a font file.
 *
 * The usual way to do that is to offset the skeleton outward by half the stroke width and stitch
 * the offsets together at the joins. Offsetting general curves is a genuinely hard problem with a
 * long tail of degenerate cases, and it is where most attempts at this sink. This file sidesteps it
 * entirely by restricting the skeleton to two primitives whose offsets are exact and trivial:
 *
 *   - a straight line, whose offset is a rectangle
 *   - a circular arc, whose offset is an annular sector
 *
 * Each segment is then emitted as its own independent closed contour, and the join between two
 * segments is a plain disc of the stroke's radius dropped on the shared point. Nothing is stitched.
 * The shapes simply overlap, and the non-zero winding rule that both TrueType and Canvas fill with
 * unions them for free — which is also why every contour this file emits is forced to the same
 * orientation before it leaves. Two contours wound against each other would cancel where they
 * overlap and punch a hole through the middle of a stem.
 *
 * The cost is that a glyph carries more contours than a hand-drawn one would. The benefit is that
 * there is no join case to get wrong: a disc of the right radius is a perfect round join at every
 * angle, including the ones a mitre would spike on.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A straight run of skeleton, from `a` to `b`. */
export interface LineSeg {
  k: 'L';
  a: Pt;
  b: Pt;
}

/**
 * An elliptical run of skeleton.
 *
 * Angles are the *parametric* angle, not the geometric one: the point at `t` is
 * `(c.x + rx·cos t, c.y + ry·sin t)`, which only coincides with the direction from the centre when
 * the radii are equal. Everywhere a real direction is wanted — cutting a C open at five o'clock —
 * the conversion happens at the call site rather than being smuggled in here.
 *
 * The sign of `a1 - a0` is the direction of travel, which matters because it is what the caps,
 * joins and serifs are oriented against.
 */
export interface EllipseSeg {
  k: 'E';
  c: Pt;
  rx: number;
  ry: number;
  a0: number;
  a1: number;
}

export type Seg = LineSeg | EllipseSeg;

/**
 * A connected run of skeleton drawn in one pen-down. Segments are assumed to meet end to end; where
 * they do not quite, the join disc covers the discrepancy, so glyph code can be written to the
 * nearest unit without chasing floating-point seams.
 */
export interface Stroke {
  kind: 'stroke';
  segs: Seg[];
  closed: boolean;
  /** Set false on a stroke whose ends must never take a serif, whatever the burial test says. */
  serif?: boolean;
}

/**
 * A solid mark of the pen's own width, sitting where the pen was put down and not moved.
 *
 * A period is not a stroke — it has no length, and stroking a zero-length path gives you nothing at
 * a flat terminal and a circle at a round one, neither of which is a period. It is its own shape,
 * and it takes its corner rounding from the same slider the bowls do, so a squared-off face gets
 * squared-off dots without anybody having to ask for them.
 */
export interface Dot {
  kind: 'dot';
  x: number;
  y: number;
  /** Width and height are separate so a mark can be pre-squashed against a horizontal scale. */
  w: number;
  h: number;
}

export type Piece = Stroke | Dot;

/** A point on an outline. `on: false` marks a quadratic control point, in TrueType's sense. */
export interface CPt {
  x: number;
  y: number;
  on: boolean;
}

export type Contour = CPt[];

export const TAU = Math.PI * 2;
export const D = Math.PI / 180;

export const pt = (x: number, y: number): Pt => ({ x, y });

export function line(x1: number, y1: number, x2: number, y2: number): Seg {
  return { k: 'L', a: pt(x1, y1), b: pt(x2, y2) };
}

/** A circular run: the ellipse whose radii happen to match. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): Seg {
  return { k: 'E', c: pt(cx, cy), rx: r, ry: r, a0, a1 };
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Seg {
  return { k: 'E', c: pt(cx, cy), rx, ry, a0, a1 };
}

/** One stroke from a list of segments. */
export function stroke(segs: Seg[], closed = false): Stroke {
  return { kind: 'stroke', segs, closed };
}

export function dot(x: number, y: number, w: number, h = w): Dot {
  return { kind: 'dot', x, y, w, h };
}

/** A stroke that is a single straight run — the workhorse for stems and bars. */
export function bar(x1: number, y1: number, x2: number, y2: number): Stroke {
  return stroke([line(x1, y1, x2, y2)]);
}

/** A stroke through a run of points, corner to corner. */
export function poly(points: Pt[], closed = false): Stroke {
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    segs.push({ k: 'L', a: points[i]!, b: points[i + 1]! });
  }
  if (closed && points.length > 2) {
    segs.push({ k: 'L', a: points[points.length - 1]!, b: points[0]! });
  }
  return stroke(segs, closed);
}

// ---------------------------------------------------------------------------------------------
// Segment queries
// ---------------------------------------------------------------------------------------------

/** The point at a fraction of the way along a segment's own parameter. */
export function segPoint(s: Seg, t: number): Pt {
  if (s.k === 'L') return pt(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t);
  const th = s.a0 + (s.a1 - s.a0) * t;
  return pt(s.c.x + s.rx * Math.cos(th), s.c.y + s.ry * Math.sin(th));
}

/** The unit tangent at a fraction along, pointing the way the pen travels. */
export function segTangent(s: Seg, t: number): Pt {
  if (s.k === 'L') return norm(s.b.x - s.a.x, s.b.y - s.a.y);
  const th = s.a0 + (s.a1 - s.a0) * t;
  const sign = s.a1 >= s.a0 ? 1 : -1;
  return norm(-s.rx * Math.sin(th) * sign, s.ry * Math.cos(th) * sign);
}

export function segStart(s: Seg): Pt {
  return segPoint(s, 0);
}

export function segEnd(s: Seg): Pt {
  return segPoint(s, 1);
}

function norm(x: number, y: number): Pt {
  const m = Math.hypot(x, y);
  return m < 1e-9 ? pt(1, 0) : pt(x / m, y / m);
}

export function segTanStart(s: Seg): Pt {
  return segTangent(s, 0);
}

export function segTanEnd(s: Seg): Pt {
  return segTangent(s, 1);
}

/**
 * How long a segment is.
 *
 * An elliptical arc has no closed form, so it is walked. The number only ever has to be consistent
 * rather than accurate: it is used to cut paths at a fraction of their length, and the cut and the
 * measurement go through the same approximation, so they agree with each other exactly.
 */
export function segLength(s: Seg): number {
  if (s.k === 'L') return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  if (Math.abs(s.a1 - s.a0) < 1e-9) return 0;
  const steps = 12;
  let total = 0;
  let prev = segPoint(s, 0);
  for (let i = 1; i <= steps; i++) {
    const p = segPoint(s, i / steps);
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return total;
}

/** The sub-segment between two fractions of a segment's own parameter. */
export function segSlice(s: Seg, t0: number, t1: number): Seg {
  if (s.k === 'L') return { k: 'L', a: segPoint(s, t0), b: segPoint(s, t1) };
  const d = s.a1 - s.a0;
  return { k: 'E', c: s.c, rx: s.rx, ry: s.ry, a0: s.a0 + d * t0, a1: s.a0 + d * t1 };
}

// ---------------------------------------------------------------------------------------------
// Arcs as quadratics
// ---------------------------------------------------------------------------------------------

/**
 * Append a circular arc to a contour as a chain of quadratic Béziers.
 *
 * Each sub-arc uses the tangent-intersection control point, which sits at `r / cos(Δ/2)` from the
 * centre along the bisector. Capping Δ at 22.5° holds the radial error under about 2 parts in
 * 100,000 — at a 300-unit radius that is a twentieth of a font unit, which is well beneath the
 * grid anything will ever be rasterised on.
 */
function pushArc(out: Contour, cx: number, cy: number, r: number, a0: number, a1: number, withStart: boolean): void {
  const sweep = a1 - a0;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));
  const d = sweep / steps;
  if (withStart) out.push({ x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0), on: true });
  for (let i = 0; i < steps; i++) {
    const s = a0 + d * i;
    const e = s + d;
    const m = s + d / 2;
    const cr = r / Math.cos(d / 2);
    out.push({ x: cx + cr * Math.cos(m), y: cy + cr * Math.sin(m), on: false });
    out.push({ x: cx + r * Math.cos(e), y: cy + r * Math.sin(e), on: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Stroking
// ---------------------------------------------------------------------------------------------

/** Twice the enclosed area, signed. Positive is counter-clockwise. Control points count as corners,
 *  which is wrong for the area but never wrong for the sign at these curvatures. */
function signedArea(c: Contour): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % c.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/**
 * TrueType fills with the non-zero rule and expects outer contours to run clockwise in its y-up
 * space. Everything here overlaps everything else, so the only thing that actually matters is that
 * they all agree; clockwise is the convention worth agreeing on.
 */
function orient(c: Contour): Contour {
  return signedArea(c) > 0 ? c.slice().reverse() : c;
}

/** How far a width may be pushed inward before the inner offset folds through itself. */
function innerLimit(s: Seg): number {
  if (s.k === 'L') return Infinity;
  // The tightest the curve gets is the smaller radius; staying just inside it keeps the inner run
  // on the correct side of the centre and the contour free of the bow-tie that would otherwise
  // cancel half the segment away under the non-zero rule.
  return Math.min(s.rx, s.ry) * 0.94 * 2;
}

/** A point on one flank of a segment, at a fraction along and half the local width out. */
function flank(s: Seg, t: number, side: number, widthAt: (t: number) => number): Pt {
  const p = segPoint(s, t);
  const d = segTangent(s, t);
  const w = Math.min(widthAt(t), side < 0 ? innerLimit(s) : Infinity);
  const h = w / 2;
  return pt(p.x - d.y * side * h, p.y + d.x * side * h);
}

/**
 * Walk one flank, emitting quadratics that pass through the offset of each sample *and* of the
 * midpoint between them.
 *
 * Three points determine a quadratic, and taking the middle one at the halfway parameter is what
 * makes this track an offset curve that has no exact Bézier form. A straight run at constant width
 * needs one step and the control point lands on the edge it is describing, so lines stay exactly as
 * cheap and exactly as exact as they were when the offsets were derived rather than sampled.
 */
function pushFlank(
  out: Contour,
  s: Seg,
  side: number,
  from: number,
  to: number,
  steps: number,
  widthAt: (t: number) => number,
  slant: [number, number] = [0, 0],
): void {
  const shove = (p: Pt, t: number, amount: number): Pt => {
    if (amount === 0) return p;
    const d = segTangent(s, t);
    return pt(p.x + d.x * amount * side, p.y + d.y * amount * side);
  };
  out.push({ ...shove(flank(s, from, side, widthAt), from, slant[0]), on: true });
  for (let i = 0; i < steps; i++) {
    const t0 = from + (to - from) * (i / steps);
    const t1 = from + (to - from) * ((i + 1) / steps);
    const p0 = i === 0 ? shove(flank(s, t0, side, widthAt), t0, slant[0]) : flank(s, t0, side, widthAt);
    const p1 =
      i === steps - 1 ? shove(flank(s, t1, side, widthAt), t1, slant[1]) : flank(s, t1, side, widthAt);
    const pm = flank(s, (t0 + t1) / 2, side, widthAt);
    out.push({ x: 2 * pm.x - (p0.x + p1.x) / 2, y: 2 * pm.y - (p0.y + p1.y) / 2, on: false });
    out.push({ x: p1.x, y: p1.y, on: true });
  }
}

/** How finely a segment has to be sampled for its offset to look like a curve rather than a fan. */
function stepsFor(s: Seg): number {
  if (s.k === 'L') return 1;
  const sweep = Math.abs(s.a1 - s.a0);
  return Math.max(1, Math.min(28, Math.ceil(sweep / (Math.PI / 9))));
}

/**
 * One segment's solid outline: up one flank and back down the other.
 *
 * `slant` shifts the two flanks in opposite directions along the tangent at whichever ends are free,
 * which turns a square cut into an angled one. It is applied to the outline rather than by moving
 * the skeleton, because the skeleton is what everything else — joins, serifs, the burial test — is
 * measured against, and an end that moved would drag all of those with it.
 */
function segOutline(s: Seg, widthAt: (t: number) => number, slant: [number, number] = [0, 0]): Contour {
  const steps = stepsFor(s);
  const out: Contour = [];
  pushFlank(out, s, 1, 0, 1, steps, widthAt, slant);
  pushFlank(out, s, -1, 1, 0, steps, widthAt, [slant[1], slant[0]]);
  return out;
}

/** A ball terminal: a disc a little larger than the stroke, sat on the end of it. */
function ballContour(p: Pt, dir: Pt, h: number, amount: number): Contour | null {
  if (amount <= 0.02) return null;
  const r = h * (1 + amount * 0.62);
  // Pushed out just far enough that the disc's far edge clears the square end it is covering,
  // rather than sitting concentric and reading as a bulge in the middle of the stroke.
  const shift = (r - h) * 0.85;
  return disc(pt(p.x + dir.x * shift, p.y + dir.y * shift), r);
}

/** A full disc, as four quarter arcs. Dropped on every join where the pen actually turns. */
function disc(p: Pt, h: number): Contour {
  const out: Contour = [];
  pushArc(out, p.x, p.y, h, 0, TAU, true);
  out.pop(); // The closing point repeats the opening one; contours are implicitly closed.
  return out;
}

/**
 * The width along a stroke, thinned where it disappears into other ink.
 *
 * Where a shoulder meets a stem, two strokes overlap and the ink there is heavier than anywhere
 * else in the letter; every real face answers by thinning the curve as it approaches. A monoline
 * that does not is the single most reliable tell that a typeface was generated, and it is why the
 * joins in an n, an m, an h and a two-storey a used to read as blobs.
 *
 * The rule needs no per-letter annotation, because the tool already works out which stroke ends are
 * buried in order to place serifs. An end that is buried is exactly an end that wants thinning.
 */
function taperedWidth(
  weight: number,
  modulation: number,
  segLen: number,
  atStart: boolean,
  atEnd: boolean,
): (t: number) => number {
  if (modulation <= 0.001 || (!atStart && !atEnd) || segLen <= 0) return () => weight;
  // Two numbers decided by looking. The reach is held under half the segment so that a short bar
  // with both ends buried keeps its middle at full weight instead of thinning end to end. The floor
  // is shallow because a stroke reaches its thinnest exactly where it enters the other one, and a
  // stroke only just inside its neighbour shows most of that thinning — at anything deeper than
  // about a quarter it stops reading as modulation and starts reading as damage.
  const reach = Math.min(segLen * 0.5, weight * 1.3);
  const floor = 1 - 0.24 * modulation;
  const ramp = (dist: number) => {
    if (dist >= reach) return 1;
    const u = dist / reach;
    return floor + (1 - floor) * (u * u * (3 - 2 * u));
  };
  return (t: number) => {
    let scale = 1;
    if (atStart) scale = Math.min(scale, ramp(t * segLen));
    if (atEnd) scale = Math.min(scale, ramp((1 - t) * segLen));
    return weight * scale;
  };
}

/**
 * The shape added past a free end of a stroke.
 *
 * `t` runs from a flat cut to a half-round, and the blend between them is continuous rather than a
 * switch: the cap is a rectangle of depth `t·h` whose outer corners are rounded by that same depth.
 * At `t = 1` the two corner radii meet in the middle and the rectangle is exactly a semicircle; at
 * `t = 0` it has no depth at all and the segment's own square end is already the answer.
 */
function cap(p: Pt, dir: Pt, h: number, t: number): Contour | null {
  const e = t * h;
  if (e < 0.75) return null;
  const phi = Math.atan2(dir.y, dir.x);
  const n = pt(-dir.y, dir.x);
  const k = h - e;
  const out: Contour = [];
  const c1 = pt(p.x + n.x * k, p.y + n.y * k);
  const c2 = pt(p.x - n.x * k, p.y - n.y * k);
  pushArc(out, c1.x, c1.y, e, phi + Math.PI / 2, phi, true);
  pushArc(out, c2.x, c2.y, e, phi, phi - Math.PI / 2, true);
  return out;
}

/** How far a point lies from a run of skeleton. */
export function distToSeg(p: Pt, s: Seg): number {
  if (s.k === 'L') {
    const vx = s.b.x - s.a.x;
    const vy = s.b.y - s.a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 <= 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / len2));
    return Math.hypot(p.x - (s.a.x + vx * t), p.y - (s.a.y + vy * t));
  }
  // No closed form for the distance to an ellipse, and none is needed: this only ever answers
  // "is this endpoint buried inside that stroke", so a walk of the segment is ample.
  let best = Infinity;
  const steps = Math.max(4, stepsFor(s) * 2);
  for (let i = 0; i <= steps; i++) {
    const q = segPoint(s, i / steps);
    best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}

/**
 * A serif: the bar across the end of a stroke, with the fillet that softens it into the stem.
 *
 * The profile is walked from one outer tip, in along the top of the serif, round the bracket, down
 * across the stem and back out the other side. At a bracket of zero every point on that inner run
 * is at the same depth and the whole thing collapses into the rectangle a slab serif is; as the
 * bracket opens, a quarter arc of radius `R` eats into it and the serif grows a throat.
 *
 * `L` is how far the serif reaches past the stroke on each side, `T` how deep it is. Tying `T` to
 * the contrast axis rather than exposing it is what makes one slider carry a face from Rockwell,
 * whose serifs are as thick as its stems, to something Didone with hairlines for serifs.
 */
function serifContour(p: Pt, dir: Pt, h: number, L: number, T: number, bracket: number): Contour | null {
  if (L < 0.5 || T < 0.5) return null;
  const n = pt(-dir.y, dir.x);
  const R = Math.max(0, Math.min(bracket * L, L));
  const phi = Math.atan2(dir.y, dir.x);
  // Local frame: `u` runs inward from the terminal, `v` across it.
  const at = (u: number, v: number): Pt => pt(p.x - dir.x * u + n.x * v, p.y - dir.y * u + n.y * v);
  const on = (u: number, v: number): CPt => ({ ...at(u, v), on: true });
  const out: Contour = [];

  out.push(on(0, h + L));
  out.push(on(T, h + L));
  if (R > 0.5) {
    // The fillet's centre sits a radius deeper and level with the tip, so the arc leaves the serif
    // face pointing inward and arrives on the stem's flank pointing along it.
    const c = at(T + R, h + L);
    pushArc(out, c.x, c.y, R, phi, phi - Math.PI / 2, false);
  } else {
    out.push(on(T, h + L - R));
  }
  out.push(on(T + R, -(h + L - R)));
  if (R > 0.5) {
    const c = at(T + R, -(h + L));
    pushArc(out, c.x, c.y, R, phi + Math.PI / 2, phi, false);
  }
  out.push(on(T, -(h + L)));
  out.push(on(0, -(h + L)));
  return out;
}

const TURN_EPS = 0.004; // ~0.23°, below which a join is tangent-continuous and needs no disc.

/** Everything about how the pen behaves, gathered so no caller has to pass six numbers. */
export interface Pen {
  weight: number;
  /** 0 cuts stroke ends flat, 1 finishes them half-round. Ignored where a serif is drawn instead. */
  terminal: number;
  round: number;
  /** How far a serif reaches past the stroke on each side, measured after the horizontal scale. */
  serifLen: number;
  /** How deep the serif is, likewise. At the stroke's own width it is a slab. */
  serifThick: number;
  /** 0 leaves the serif square against the stem, 1 gives it a full quarter-round throat. */
  bracket: number;
  /**
   * How much a stroke thins where it runs into other ink.
   *
   * Zero is a true monoline — one width everywhere, which is what Futura and the early geometric
   * faces were after. Anything above it starts putting the junction thinning into the shoulders
   * that every drawn typeface has and that no constant-width pen can produce.
   */
  modulation: number;
  /**
   * How much a free end is cut off square.
   *
   * Zero cuts every terminal at a right angle to its own stroke, which is what a geometric face
   * does and what a compass and a straight edge can produce. Humanist faces slant the cut, because
   * the shapes they descend from were written with a broad nib held at an angle and the nib left
   * that slant behind on every stroke it lifted off.
   */
  cut: number;
  /**
   * The blob at the end of a curved stroke — the ball on an a, a c, an f, an r.
   *
   * It goes on curves only. Stem ends want serifs and curve ends want balls, and in a serif face
   * the two never swap; deciding by the kind of segment the terminal belongs to gets every letter
   * right without naming any of them.
   */
  ball: number;
  /**
   * The horizontal scale the finished contours will be stretched by.
   *
   * Contrast is produced by drawing the whole glyph horizontally squashed and stretching it back
   * afterwards, which turns the round pen into an elliptical one — thick stems, thin horizontals —
   * without giving up the exact offsets everything here depends on. Serifs are the one thing that
   * has to know about it: their lengths are quoted in the final space, so a serif lying across the
   * stretch has to be drawn short by exactly the amount the stretch will add back.
   */
  xscale: number;
}

/** A length in the finished drawing, expressed in the squashed space it has to be drawn in. */
function preScale(len: number, dx: number, dy: number, k: number): number {
  const stretch = Math.hypot(dx * k, dy);
  return stretch < 1e-9 ? len : len / stretch;
}

/** Every contour a single pen-down contributes. `exposed` says which free ends are in open air. */
export function strokeToContours(st: Stroke, pen: Pen, exposed: [boolean, boolean] = [true, true]): Contour[] {
  const h = pen.weight / 2;
  const out: Contour[] = [];
  const segs = st.segs.filter((s) => segLength(s) > 0.01);
  if (segs.length === 0) return out;

  const n = segs.length;
  // Thinning is applied only at the ends that vanish into other ink, and only on the segment that
  // actually owns that end — so a shoulder tapers into its stem while the rest of it holds weight.
  const buried: [boolean, boolean] = [!st.closed && !exposed[0], !st.closed && !exposed[1]];
  const widths = segs.map((seg, i) =>
    taperedWidth(
      pen.weight,
      pen.modulation,
      segLength(seg),
      i === 0 && buried[0],
      i === n - 1 && buried[1],
    ),
  );

  // What happens at each free end is decided before any of it is drawn, because the angled cut has
  // to know: a slant under a serif or a ball pushes a corner out past the shape covering it, which
  // reads as a spur on the side of the letter and was exactly what the first version produced.
  type Finish = 'serif' | 'ball' | 'cap';
  const finish: [Finish, Finish] = ['cap', 'cap'];
  const free: Array<[Pt, Pt]> = [];
  if (!st.closed) {
    const ts = segTanStart(segs[0]!);
    const te = segTanEnd(segs[n - 1]!);
    free.push([segStart(segs[0]!), pt(-ts.x, -ts.y)], [segEnd(segs[n - 1]!), te]);
    const owner: Seg[] = [segs[0]!, segs[n - 1]!];
    for (let i = 0; i < 2; i++) {
      const wants = exposed[i] && st.serif !== false;
      if (!wants) continue;
      // Stem ends want serifs; curve ends want balls. In a serif face the two never swap, and
      // deciding by the kind of segment the terminal belongs to gets the a, the c, the f and the r
      // right at the same time as the H, the E and the T, without naming any of them.
      if (owner[i]!.k === 'E' && pen.ball > 0.02) finish[i] = 'ball';
      else if (owner[i]!.k === 'L' && pen.serifLen > 0.5) finish[i] = 'serif';
    }
  }

  const slantAt = (i: number): [number, number] => {
    if (st.closed || pen.cut <= 0.001) return [0, 0];
    const amount = pen.cut * h * 0.85;
    const head = i === 0 && exposed[0] && finish[0] === 'cap' ? amount : 0;
    const tail = i === n - 1 && exposed[1] && finish[1] === 'cap' ? -amount : 0;
    return [head, tail];
  };
  for (let i = 0; i < n; i++) out.push(segOutline(segs[i]!, widths[i]!, slantAt(i)));

  const lastJoin = st.closed ? n : n - 1;
  for (let i = 0; i < lastJoin; i++) {
    const a = segs[i]!;
    const b = segs[(i + 1) % n]!;
    const ta = segTanEnd(a);
    const tb = segTanStart(b);
    const turn = Math.abs(ta.x * tb.y - ta.y * tb.x) + Math.max(0, -(ta.x * tb.x + ta.y * tb.y));
    // The disc that rounds a join has to match the width arriving at it, or a tapered shoulder
    // grows a bead where it turns.
    if (turn > TURN_EPS) out.push(disc(segEnd(a), widths[i]!(1) / 2));
  }

  free.forEach(([p, dir], i) => {
    let shape: Contour | null = null;
    if (finish[i] === 'ball') {
      shape = ballContour(p, dir, h, pen.ball);
    } else if (finish[i] === 'serif') {
      // Serifs in a Latin face are horizontal or vertical, never square to the stroke they end. A
      // perpendicular serif on the foot of an A or the leg of a K spikes off sideways at the angle
      // of the diagonal, which is a shape no punchcutter ever cut.
      const axis = Math.abs(dir.y) >= Math.abs(dir.x) ? pt(0, Math.sign(dir.y) || 1) : pt(Math.sign(dir.x) || 1, 0);
      // The stroke's own square cut already reaches past `p` along that axis; start the serif there
      // instead, or the diagonal pokes out through the face of its own foot.
      const over = h * Math.abs(-dir.y * axis.x + dir.x * axis.y);
      const foot = pt(p.x + axis.x * over, p.y + axis.y * over);
      shape = serifContour(
        foot,
        axis,
        h,
        preScale(pen.serifLen, -axis.y, axis.x, pen.xscale),
        preScale(pen.serifThick, axis.x, axis.y, pen.xscale),
        pen.bracket,
      );
    }
    if (!shape) shape = cap(p, dir, h, pen.terminal);
    if (shape) out.push(shape);
  });

  return out.map(orient);
}

// ---------------------------------------------------------------------------------------------
// The ring: one shape that spans a circle and a rectangle
// ---------------------------------------------------------------------------------------------

/**
 * The closed skeleton of a rounded rectangle, walked counter-clockwise from the middle of the right
 * side.
 *
 * This single primitive is what lets one slider carry a typeface from Futura to something squared
 * off and technical. At full roundness on a square box the straight runs vanish and the four corner
 * arcs meet into a circle; at zero roundness the arcs vanish and it is a rectangle; everything
 * between is a superellipse-ish shape that geometric type has been built out of for a century.
 *
 * Starting at the right-middle is deliberate: it is the point a C or a G opens at, so the aperture
 * of those letters is a cut at a fixed distance from the start of the walk.
 */
export function ring(x0: number, y0: number, x1: number, y1: number, round: number): Seg[] {
  const k = Math.max(0, Math.min(1, round));
  const rx = ((x1 - x0) / 2) * k;
  const ry = ((y1 - y0) / 2) * k;
  const ym = (y0 + y1) / 2;
  const segs: Seg[] = [];
  const push = (s: Seg) => {
    if (segLength(s) > 0.01) segs.push(s);
  };
  push(line(x1, ym, x1, y1 - ry));
  push(ellipse(x1 - rx, y1 - ry, rx, ry, 0, Math.PI / 2));
  push(line(x1 - rx, y1, x0 + rx, y1));
  push(ellipse(x0 + rx, y1 - ry, rx, ry, Math.PI / 2, Math.PI));
  push(line(x0, y1 - ry, x0, y0 + ry));
  push(ellipse(x0 + rx, y0 + ry, rx, ry, Math.PI, Math.PI * 1.5));
  push(line(x0 + rx, y0, x1 - rx, y0));
  push(ellipse(x1 - rx, y0 + ry, rx, ry, Math.PI * 1.5, TAU));
  push(line(x1, y0 + ry, x1, ym)); // Closes the walk back onto its own start point.
  return segs;
}

/** Total length of a segment run. */
export function pathLength(segs: Seg[]): number {
  let t = 0;
  for (const s of segs) t += segLength(s);
  return t;
}

/** The same run of segments, walked the other way. */
export function reverseSegs(segs: Seg[]): Seg[] {
  return segs
    .slice()
    .reverse()
    .map<Seg>((s) =>
      s.k === 'L' ? { k: 'L', a: s.b, b: s.a } : { k: 'E', c: s.c, rx: s.rx, ry: s.ry, a0: s.a1, a1: s.a0 },
    );
}

/**
 * The piece of a segment run between two fractions of its total length.
 *
 * Cutting by length rather than by which segment you happen to be on is what keeps a C's aperture
 * looking like the same aperture as the roundness slider moves: the corner arcs and the straight
 * runs trade length back and forth, and a length-based cut rides that trade instead of jumping.
 *
 * `t1` may run past 1 to wrap around a closed ring. An S needs exactly that — its lower bowl is
 * entered at the top-left and left at the bottom-left, which on a walk that starts at the right is
 * a cut straddling the seam.
 */
export function subPath(segs: Seg[], t0: number, t1: number): Seg[] {
  const total = pathLength(segs);
  if (total <= 0) return [];
  if (t1 > 1) return [...subPath(segs, t0, 1), ...subPath(segs, 0, t1 - 1)];
  if (t0 < 0) return [...subPath(segs, t0 + 1, 1), ...subPath(segs, 0, t1)];
  const a = Math.max(0, Math.min(1, t0)) * total;
  const b = Math.max(0, Math.min(1, t1)) * total;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: Seg[] = [];
  let walked = 0;
  for (const s of segs) {
    const len = segLength(s);
    if (len <= 0) continue;
    const segLo = walked;
    const segHi = walked + len;
    walked = segHi;
    if (segHi <= lo || segLo >= hi) continue;
    const u0 = Math.max(0, (lo - segLo) / len);
    const u1 = Math.min(1, (hi - segLo) / len);
    if (u1 - u0 < 1e-6) continue;
    out.push(u0 === 0 && u1 === 1 ? s : segSlice(s, u0, u1));
  }
  return out;
}

/**
 * Where a given direction from the centre of a ring meets it, as a fraction of the walk.
 *
 * Cutting a ring by arc length was the first thing tried here, and it is wrong for a reason worth
 * writing down: arc length is stable against the roundness slider but not against the width one. An
 * S whose bowls are square gets its terminals in one place and an S whose bowls are tall and narrow
 * gets them somewhere else entirely, because the straight sides take a different share of the
 * perimeter. Angle from the centre is what a person actually means by "open it at four o'clock",
 * and it survives every axis in the design space.
 *
 * The ring is convex and walked anticlockwise from angle zero, so the angle rises monotonically
 * along it and one pass is enough to find the segment that brackets the target.
 */
export function angleFraction(segs: Seg[], cx: number, cy: number, angle: number): number {
  const total = pathLength(segs);
  if (total <= 0) return 0;
  const target = ((angle % TAU) + TAU) % TAU;
  const dx = Math.cos(target);
  const dy = Math.sin(target);
  let walked = 0;
  let prev = 0;
  for (const seg of segs) {
    const len = segLength(seg);
    if (len <= 0) continue;
    const e = segEnd(seg);
    let end = Math.atan2(e.y - cy, e.x - cx);
    if (end < 0) end += TAU;
    // Angles only rise along the walk, so anything that appears to go backwards has wrapped past
    // the seam. The last segment closes onto angle zero and is the usual case.
    if (end <= prev + 1e-9) end = TAU;
    if (target >= prev - 1e-9 && target <= end + 1e-9) {
      let u = 0;
      if (seg.k === 'L') {
        const ax = seg.a.x - cx;
        const ay = seg.a.y - cy;
        const bx = seg.b.x - seg.a.x;
        const by = seg.b.y - seg.a.y;
        const den = bx * dy - by * dx;
        u = Math.abs(den) < 1e-9 ? 0 : -(ax * dy - ay * dx) / den;
      } else {
        // Squash the whole problem by the ellipse's own radii and it becomes a ray against a unit
        // circle, which has a closed form; the parametric angle falls straight out of the answer.
        const fx = (cx - seg.c.x) / seg.rx;
        const fy = (cy - seg.c.y) / seg.ry;
        const gx = dx / seg.rx;
        const gy = dy / seg.ry;
        const aq = gx * gx + gy * gy;
        const bq = 2 * (fx * gx + fy * gy);
        const cq = fx * fx + fy * fy - 1;
        const det = bq * bq - 4 * aq * cq;
        const root = det > 0 ? Math.sqrt(det) : 0;
        const dist = aq === 0 ? 0 : (-bq + root) / (2 * aq);
        const px = fx + gx * dist;
        const py = fy + gy * dist;
        const sweep = seg.a1 - seg.a0;
        let local = Math.atan2(py, px) - seg.a0;
        while (local * Math.sign(sweep) < -1e-9) local += TAU * Math.sign(sweep);
        while (Math.abs(local) > Math.abs(sweep) + 1e-9) local -= TAU * Math.sign(sweep);
        u = sweep === 0 ? 0 : local / sweep;
      }
      return (walked + Math.max(0, Math.min(1, u)) * len) / total;
    }
    walked += len;
    prev = end;
  }
  return 1;
}

/**
 * A ring cut open between two directions from its centre, walked anticlockwise.
 *
 * This is how every open round letter in the face is described — a C is a ring from about five
 * o'clock round to seven, an e is one from three o'clock most of the way back — which means those
 * apertures stay where a reader expects them no matter what the width and roundness sliders do.
 */
export function ringSlice(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  a0: number,
  a1: number,
): Seg[] {
  const segs = ring(x0, y0, x1, y1, r);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const t0 = angleFraction(segs, cx, cy, a0);
  let t1 = angleFraction(segs, cx, cy, a1);
  if (t1 <= t0 + 1e-6) t1 += 1;
  return subPath(segs, t0, t1);
}

/** A ring cut open between two fractions of its perimeter — the C, G, S and c of the alphabet. */
export function ringArc(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  t0: number,
  t1: number,
): Stroke {
  return stroke(subPath(ring(x0, y0, x1, y1, r), t0, t1), false);
}

/** A closed ring — O, o, D's bowl, the counters that letters are recognised by. */
export function ringClosed(x0: number, y0: number, x1: number, y1: number, r: number): Stroke {
  return stroke(ring(x0, y0, x1, y1, r), true);
}

/** A rounded rectangle as a single filled contour — not stroked, solid. */
export function roundedRectContour(x0: number, y0: number, x1: number, y1: number, r: number): Contour {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const out: Contour = [];
  if (rr < 0.5) {
    return orient([
      { x: x0, y: y0, on: true },
      { x: x0, y: y1, on: true },
      { x: x1, y: y1, on: true },
      { x: x1, y: y0, on: true },
    ]);
  }
  out.push({ x: x1, y: y1 - rr, on: true });
  pushArc(out, x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  out.push({ x: x0 + rr, y: y1, on: true });
  pushArc(out, x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  out.push({ x: x0, y: y0 + rr, on: true });
  pushArc(out, x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  out.push({ x: x1 - rr, y: y0, on: true });
  pushArc(out, x1 - rr, y0 + rr, rr, Math.PI * 1.5, TAU, false);
  return orient(out);
}

export function dotContour(d: Dot, round: number): Contour {
  const a = d.w / 2;
  const b = d.h / 2;
  return roundedRectContour(d.x - a, d.y - b, d.x + a, d.y + b, round * Math.min(a, b));
}

/**
 * Whether a stroke's free end stands in open air or is buried inside other ink.
 *
 * Serifs belong on the ends a reader can see. The right ends of E's three arms want them; the left
 * ends, which vanish into the stem, do not, and a serif there grows a lump on the side of the
 * letter. Rather than annotate ninety glyphs by hand — and get it wrong every time a slider moves a
 * stroke — each free end is simply measured against every other run of skeleton in the glyph. If
 * something else passes within about half a stroke width, the end is already covered and is left
 * alone. That one test gets E, A's crossbar, H's crossbar, the bar of an e and the bar of a G right
 * without any of them being named.
 */
function exposureOf(pieces: Piece[], reach: number): Map<Stroke, [boolean, boolean]> {
  const strokes = pieces.filter((p): p is Stroke => p.kind === 'stroke');
  const out = new Map<Stroke, [boolean, boolean]>();
  for (const st of strokes) {
    const segs = st.segs.filter((s) => segLength(s) > 0.01);
    if (segs.length === 0 || st.closed) {
      out.set(st, [false, false]);
      continue;
    }
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    const clear = (p: Pt, own: Seg) =>
      strokes.every((other) =>
        other.segs.every((seg) => seg === own || segLength(seg) <= 0.01 || distToSeg(p, seg) > reach),
      );
    out.set(st, [clear(segStart(first), first), clear(segEnd(last), last)]);
  }
  return out;
}

/** Every contour of a glyph, from the pieces that draw it. */
export function piecesToContours(pieces: Piece[], pen: Pen): Contour[] {
  // An end counts as buried when it lies inside another stroke's ink, which is exactly one stroke
  // radius; the slack lets a glyph aim a crossbar at a diagonal without hitting its centre line.
  const exposure = exposureOf(pieces, pen.weight * 0.56);
  const out: Contour[] = [];
  for (const p of pieces) {
    if (p.kind === 'dot') out.push(dotContour(p, pen.round));
    else out.push(...strokeToContours(p, pen, exposure.get(p) ?? [true, true]));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------------------------

/** Shear about the baseline, for the oblique. */
export function shearContours(cs: Contour[], tan: number): Contour[] {
  if (Math.abs(tan) < 1e-9) return cs;
  return cs.map((c) => c.map((p) => ({ x: p.x + p.y * tan, y: p.y, on: p.on })));
}

/**
 * Knock a drawing off the ruled line, the same way every time.
 *
 * Real handwriting is never twice alike, but a font has exactly one drawing per letter, so an
 * irregularity that has to survive being repeated is the opposite problem: it must be *fixed*. Every
 * displacement here comes from a hash of the character itself, so an `a` is always the same `a` and
 * a page reads as somebody's hand rather than as static.
 *
 * The one rule that matters is that the displacement is a function of *where a point is*, never of
 * which contour or which index it happens to be. Every letter in this typeface is built from
 * overlapping shapes that are welded together only by sitting on top of each other, and a wobble
 * keyed to contour index moves two shapes that shared an edge in different directions — which tears
 * the letter into pieces along seams that were invisible a moment earlier. Keyed to position, two
 * points in the same place always move together, and the weld holds.
 */
export function wobbleContours(
  cs: Contour[],
  seed: number,
  amount: number,
  amp: number,
  wave: number,
): Contour[] {
  if (amount <= 0.001) return cs;
  const rnd = (n: number) => {
    let h = (seed ^ Math.imul(n, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const swing = amount * amp;
  // Whole-letter moves. These are uniform, so they cannot break a weld, and they are most of what
  // reads as a hand: letters that do not quite sit on the line and do not quite stand up straight.
  const shiftX = (rnd(1) - 0.5) * swing * 0.7;
  const shiftY = (rnd(2) - 0.5) * swing * 0.9;
  const tilt = (rnd(3) - 0.5) * amount * 0.07;
  const p1 = rnd(4) * TAU;
  const p2 = rnd(5) * TAU;
  const p3 = rnd(6) * TAU;
  const k1 = TAU / wave;
  const k2 = TAU / (wave * 0.55);
  return cs.map((c) =>
    c.map((p) => {
      const dx = Math.sin(p.y * k1 + p1) * swing * 0.5 + Math.sin(p.x * k2 + p2) * swing * 0.22;
      const dy = Math.cos(p.x * k1 + p3) * swing * 0.42 + Math.cos(p.y * k2 + p1) * swing * 0.18;
      const y = p.y + shiftY + dy;
      return { x: p.x + shiftX + dx + y * tilt, y, on: p.on };
    }),
  );
}

/** Stretch horizontally. This is the second half of the contrast trick; see `Pen.xscale`. */
export function scaleContoursX(cs: Contour[], k: number): Contour[] {
  if (k === 1) return cs;
  return cs.map((c) => c.map((p) => ({ x: p.x * k, y: p.y, on: p.on })));
}

export function translateContours(cs: Contour[], dx: number, dy: number): Contour[] {
  if (dx === 0 && dy === 0) return cs;
  return cs.map((c) => c.map((p) => ({ x: p.x + dx, y: p.y + dy, on: p.on })));
}

export function boundsOf(cs: Contour[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cs) {
    for (const p of c) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}
