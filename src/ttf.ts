/**
 * Writing a TrueType font, by hand, in the tab.
 *
 * There are libraries for this. Not using one is not stubbornness: every library that builds a font
 * from paths wants cubic Béziers or its own path object, and this face is already described as
 * quadratics on an integer grid because that is what the `glyf` table stores. Handing those points
 * to a converter and getting them back would be a lossy round trip in the middle of the one step
 * that has to be exact — and it is the difference between a tool that gives you a font and a tool
 * that gives you a picture of one.
 *
 * A .ttf is a directory of tables, each padded to four bytes, each with a checksum, plus one
 * checksum over the whole file patched back into `head` at the end. The ten tables below are the
 * minimum a modern operating system will install and render, and they are written in the order the
 * directory requires them sorted: alphabetically by tag.
 *
 * The single fussiest rule is the last one. `checkSumAdjustment` is defined as a magic constant
 * minus the checksum of the entire file *including the field itself*, so it can only be computed
 * once everything else is laid out and must be written with the field zeroed. Getting it wrong
 * produces a file that most renderers accept and some installers silently reject, which is the
 * worst failure mode available.
 */

import type { Face } from './font';
import { roundedRectContour, type Contour } from './geom';
import type { KernClasses } from './kern';
import { UPM } from './params';

// ---------------------------------------------------------------------------------------------
// A growable big-endian buffer
// ---------------------------------------------------------------------------------------------

class Writer {
  private buf = new Uint8Array(1 << 16);
  private len = 0;

  private room(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number): void {
    this.room(1);
    this.buf[this.len++] = v & 0xff;
  }

  u16(v: number): void {
    this.room(2);
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  i16(v: number): void {
    this.u16(v < 0 ? v + 0x10000 : v);
  }

  u32(v: number): void {
    this.room(4);
    this.buf[this.len++] = (v >>> 24) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  /** A LONGDATETIME: seconds since 1904, as a signed 64-bit big-endian integer. */
  i64(v: number): void {
    const hi = Math.floor(v / 0x100000000);
    this.u32(hi);
    this.u32(v >>> 0);
  }

  tag(s: string): void {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
  }

  bytes(b: Uint8Array): void {
    this.room(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 0xff);
  }

  utf16(s: string): void {
    for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i));
  }

  padTo4(): void {
    while (this.len % 4 !== 0) this.u8(0);
  }

  get length(): number {
    return this.len;
  }

  done(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** The sum of a table's big-endian 32-bit words, with the tail zero-padded. */
function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const w =
      ((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0);
    sum = (sum + (w >>> 0)) >>> 0;
  }
  return sum >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Glyph outlines, as `glyf` wants them
// ---------------------------------------------------------------------------------------------

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME = 0x10;
const Y_SAME = 0x20;

interface GlyfEntry {
  data: Uint8Array;
  points: number;
  contours: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * One glyph's entry in `glyf`.
 *
 * Coordinates are stored as deltas from the previous point, which is why they are rounded to
 * integers first and then differenced rather than the other way round: differencing rounded values
 * keeps the accumulated position exact, while rounding differences lets error walk along the
 * contour and pull the last point off the first.
 */
function buildGlyf(contours: Contour[]): GlyfEntry {
  const kept = contours.filter((c) => c.length >= 2);
  if (kept.length === 0) {
    return { data: new Uint8Array(0), points: 0, contours: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  }

  const xs: number[] = [];
  const ys: number[] = [];
  const on: boolean[] = [];
  const ends: number[] = [];
  for (const c of kept) {
    for (const p of c) {
      xs.push(Math.round(p.x));
      ys.push(Math.round(p.y));
      on.push(p.on);
    }
    ends.push(xs.length - 1);
  }

  const xMin = Math.min(...xs);
  const yMin = Math.min(...ys);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys);

  const flags: number[] = [];
  const xData: number[][] = [];
  const yData: number[][] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - px;
    const dy = ys[i]! - py;
    px = xs[i]!;
    py = ys[i]!;
    let f = on[i] ? ON_CURVE : 0;
    if (dx === 0) {
      f |= X_SAME;
    } else if (dx >= -255 && dx <= 255) {
      f |= X_SHORT;
      if (dx > 0) f |= X_SAME;
      xData.push([Math.abs(dx)]);
    } else {
      xData.push([(dx < 0 ? dx + 0x10000 : dx) >> 8, (dx < 0 ? dx + 0x10000 : dx) & 0xff]);
    }
    if (dy === 0) {
      f |= Y_SAME;
    } else if (dy >= -255 && dy <= 255) {
      f |= Y_SHORT;
      if (dy > 0) f |= Y_SAME;
      yData.push([Math.abs(dy)]);
    } else {
      yData.push([(dy < 0 ? dy + 0x10000 : dy) >> 8, (dy < 0 ? dy + 0x10000 : dy) & 0xff]);
    }
    flags.push(f);
  }

  const w = new Writer();
  w.i16(kept.length);
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);
  for (const e of ends) w.u16(e);
  w.u16(0); // No hinting instructions. The outlines are what they are at every size.

  // Runs of identical flags collapse into one byte plus a count, which is most of this table.
  for (let i = 0; i < flags.length; ) {
    const f = flags[i]!;
    let run = 1;
    while (i + run < flags.length && flags[i + run] === f && run < 255) run++;
    if (run > 1) {
      w.u8(f | REPEAT);
      w.u8(run - 1);
    } else {
      w.u8(f);
    }
    i += run;
  }
  for (const d of xData) for (const b of d) w.u8(b);
  for (const d of yData) for (const b of d) w.u8(b);
  w.padTo4();

  return { data: w.done(), points: xs.length, contours: kept.length, xMin, yMin, xMax, yMax };
}

/** A hollow box, drawn where a character the font does not have would go. */
function notdefContours(upm: number): Contour[] {
  const outer = roundedRectContour(upm * 0.08, 0, upm * 0.52, upm * 0.7, 0);
  const inner = roundedRectContour(upm * 0.15, upm * 0.07, upm * 0.45, upm * 0.63, 0);
  return [outer, inner.slice().reverse()];
}

/**
 * The kerning, as OpenType wants it.
 *
 * Four nested tables to say one thing — "under the default script, in the default language, the
 * feature called kern runs this lookup, and this lookup adjusts these pairs" — which is the price of
 * a format that also has to describe Arabic. The old `kern` table would be a tenth of the code and
 * is ignored by most of the software anybody would use this font in, so it is not the shortcut it
 * looks like.
 *
 * `PairPos` format 2 stores a dense matrix of class against class. Listing pairs individually was
 * the first attempt and it does not fit: the offsets inside a pair table are sixteen bits, and
 * twelve thousand measured pairs run past sixty-four kilobytes and wrap, which produced eight
 * proof faces that no longer parsed. One class per base letter bounds the table and hands every
 * accented form its base letter's kerning for free.
 */
function buildGPOS(k: KernClasses, gidOf: Map<string, number>): Uint8Array {
  // Coverage lists the glyphs that can be the *first* of a kerned pair.
  const covered = [...gidOf.entries()]
    .filter(([ch]) => (k.left.get(ch) ?? 0) > 0)
    .map(([, gid]) => gid)
    .sort((x, y) => x - y);
  if (covered.length === 0 || k.count1 <= 1 || k.count2 <= 1) return new Uint8Array(0);

  /** A ClassDef, format 2: runs of glyph ids that share a class. Sorted, non-overlapping. */
  const classDef = (of: Map<string, number>): Uint8Array => {
    const entries = [...gidOf.entries()]
      .map(([ch, gid]) => ({ gid, cls: of.get(ch) ?? 0 }))
      .filter((e) => e.cls > 0)
      .sort((x, y) => x.gid - y.gid);
    const ranges: Array<{ start: number; end: number; cls: number }> = [];
    for (const e of entries) {
      const last = ranges[ranges.length - 1];
      if (last && last.cls === e.cls && last.end === e.gid - 1) last.end = e.gid;
      else ranges.push({ start: e.gid, end: e.gid, cls: e.cls });
    }
    const w = new Writer();
    w.u16(2);
    w.u16(ranges.length);
    for (const r of ranges) {
      w.u16(r.start);
      w.u16(r.end);
      w.u16(r.cls);
    }
    return w.done();
  };

  const defs1 = classDef(k.left);
  const defs2 = classDef(k.right);
  // The class matrix is written *inline*, immediately after the sixteen fixed bytes — it is not
  // pointed at by an offset, unlike the two class definitions and the coverage. Laying it out last
  // and pointing at it is the obvious reading of the spec and produces a table that parses as
  // nonsense, because everything after the header is then read as matrix rows.
  const matrixLen = k.count1 * k.count2 * 2;
  const class1Offset = 16 + matrixLen;
  const class2Offset = class1Offset + defs1.length;
  const coverageOffset = class2Offset + defs2.length;

  const sub = new Writer();
  sub.u16(2); // posFormat 2: adjustments by class pair
  sub.u16(coverageOffset);
  sub.u16(0x0004); // valueFormat1: X_ADVANCE on the first glyph
  sub.u16(0x0000); // valueFormat2: nothing on the second
  sub.u16(class1Offset);
  sub.u16(class2Offset);
  sub.u16(k.count1);
  sub.u16(k.count2);
  for (let i = 0; i < k.count1; i++) {
    for (let j = 0; j < k.count2; j++) sub.i16(k.values[i * k.count2 + j] ?? 0);
  }
  sub.bytes(defs1);
  sub.bytes(defs2);
  sub.u16(1); // Coverage format 1: an explicit list
  sub.u16(covered.length);
  for (const gid of covered) sub.u16(gid);
  const subtable = sub.done();

  // -- Lookup ----------------------------------------------------------------------------------
  const lookup = new Writer();
  lookup.u16(2); // LookupType 2: pair adjustment
  lookup.u16(0); // lookupFlag
  lookup.u16(1); // subTableCount
  lookup.u16(8); // offset to the single subtable
  lookup.bytes(subtable);

  const lookupList = new Writer();
  lookupList.u16(1);
  lookupList.u16(4);
  lookupList.bytes(lookup.done());

  // -- Feature ---------------------------------------------------------------------------------
  const feature = new Writer();
  feature.u16(0); // featureParams
  feature.u16(1); // lookupIndexCount
  feature.u16(0);
  const featureList = new Writer();
  featureList.u16(1);
  featureList.tag('kern');
  featureList.u16(2 + 6);
  featureList.bytes(feature.done());

  // -- Script ----------------------------------------------------------------------------------
  const langSys = new Writer();
  langSys.u16(0); // lookupOrderOffset, reserved
  langSys.u16(0xffff); // requiredFeatureIndex: none
  langSys.u16(1);
  langSys.u16(0);
  const script = new Writer();
  script.u16(4); // defaultLangSysOffset
  script.u16(0); // langSysCount
  script.bytes(langSys.done());
  const scriptBytes = script.done();

  // Two scripts pointing at the same table: some software looks only for DFLT and some only for
  // latn, and which pairs get kerned should not depend on which.
  const scriptList = new Writer();
  const listHeader = 2 + 2 * 6;
  scriptList.u16(2);
  scriptList.tag('DFLT');
  scriptList.u16(listHeader);
  scriptList.tag('latn');
  scriptList.u16(listHeader + scriptBytes.length);
  scriptList.bytes(scriptBytes);
  scriptList.bytes(scriptBytes);

  const scripts = scriptList.done();
  const features = featureList.done();
  const lookups = lookupList.done();

  const out = new Writer();
  out.u32(0x00010000);
  out.u16(10);
  out.u16(10 + scripts.length);
  out.u16(10 + scripts.length + features.length);
  out.bytes(scripts);
  out.bytes(features);
  out.bytes(lookups);
  return out.done();
}

// ---------------------------------------------------------------------------------------------
// The font
// ---------------------------------------------------------------------------------------------

export interface NameSet {
  family: string;
  style: string;
  postscript: string;
  version: string;
}

/** Family and style names, cleaned up enough that a font menu and a PostScript name will take them. */
export function namesFor(raw: string, face: Face): NameSet {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Punchcut';
  const italic = Math.abs(face.design.params.slant) > 0.5;
  const style = italic ? 'Oblique' : 'Regular';
  const ps = `${cleaned}-${style}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 62) || `Punchcut-${style}`;
  return { family: cleaned, style, postscript: ps, version: 'Version 1.000' };
}

/** OpenType's nine width classes, from the width axis. */
function widthClass(width: number): number {
  const t = Math.round((width - 0.6) / (1.6 - 0.6) * 8) + 1;
  return Math.max(1, Math.min(9, t));
}

/** The usWeightClass a font menu sorts on, from the stroke. */
function weightClass(weight: number): number {
  const t = Math.round(((weight - 20) / (190 - 20)) * 8);
  return Math.max(100, Math.min(900, 100 + t * 100));
}

/**
 * The whole file.
 *
 * Glyphs are ordered by codepoint after `.notdef`, which is not required by the format but makes
 * every `cmap` segment a run of consecutive glyph ids — so the mapping needs only an `idDelta` and
 * never the indirection array, and the table comes out a few hundred bytes instead of a few
 * thousand.
 */
export function buildTTF(face: Face, rawName: string): Uint8Array {
  const names = namesFor(rawName, face);

  const chars = [...face.glyphs.keys()]
    .filter((c) => c.codePointAt(0)! <= 0xffff)
    .sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);

  // `.notdef` takes the space's advance rather than a constant, because in a monospaced face a
  // glyph on a different advance makes the whole file a lie: `post.isFixedPitch` says every
  // character is the same width, and a validator that measures them finds one that is not.
  const entries: GlyfEntry[] = [buildGlyf(notdefContours(UPM))];
  const fallback = face.glyphs.get(' ')?.advance ?? Math.round(UPM * 0.5);
  const advances: number[] = [fallback];
  const lsbs: number[] = [Math.round(UPM * 0.08)];
  for (const ch of chars) {
    const g = face.glyphs.get(ch)!;
    const e = buildGlyf(g.contours);
    entries.push(e);
    advances.push(Math.max(0, Math.min(0xffff, g.advance)));
    lsbs.push(e.contours ? e.xMin : 0);
  }
  const numGlyphs = entries.length;

  const xMin = Math.min(...entries.filter((e) => e.contours).map((e) => e.xMin), 0);
  const yMin = Math.min(...entries.filter((e) => e.contours).map((e) => e.yMin), 0);
  const xMax = Math.max(...entries.filter((e) => e.contours).map((e) => e.xMax), 0);
  const yMax = Math.max(...entries.filter((e) => e.contours).map((e) => e.yMax), 0);

  const italic = Math.abs(face.design.params.slant) > 0.5;

  // -- glyf and loca ---------------------------------------------------------------------------
  const glyf = new Writer();
  const offsets: number[] = [0];
  for (const e of entries) {
    glyf.bytes(e.data);
    offsets.push(glyf.length);
  }
  const loca = new Writer();
  for (const o of offsets) loca.u32(o);

  // -- cmap, format 4 --------------------------------------------------------------------------
  const segStart: number[] = [];
  const segEnd: number[] = [];
  const segDelta: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i]!.codePointAt(0)!;
    const gid = i + 1;
    const last = segEnd.length - 1;
    if (last >= 0 && code === segEnd[last]! + 1 && gid === code + segDelta[last]!) {
      segEnd[last] = code;
    } else {
      segStart.push(code);
      segEnd.push(code);
      segDelta.push(gid - code);
    }
  }
  segStart.push(0xffff);
  segEnd.push(0xffff);
  segDelta.push(1);

  const segCount = segStart.length;
  const sub = new Writer();
  sub.u16(4);
  sub.u16(16 + segCount * 8);
  sub.u16(0);
  sub.u16(segCount * 2);
  const pow = 2 ** Math.floor(Math.log2(segCount));
  sub.u16(pow * 2);
  sub.u16(Math.log2(pow));
  sub.u16(segCount * 2 - pow * 2);
  for (const e of segEnd) sub.u16(e);
  sub.u16(0);
  for (const s of segStart) sub.u16(s);
  for (const d of segDelta) sub.u16(d & 0xffff);
  for (let i = 0; i < segCount; i++) sub.u16(0);
  const subtable = sub.done();

  const cmap = new Writer();
  cmap.u16(0);
  cmap.u16(2);
  // The same subtable is claimed twice: once as Unicode BMP and once as Windows BMP. Some
  // installers look only for one of them, and pointing both at one table costs eight bytes.
  cmap.u16(0);
  cmap.u16(3);
  cmap.u32(4 + 2 * 8);
  cmap.u16(3);
  cmap.u16(1);
  cmap.u32(4 + 2 * 8);
  cmap.bytes(subtable);

  // -- hmtx ------------------------------------------------------------------------------------
  const hmtx = new Writer();
  for (let i = 0; i < numGlyphs; i++) {
    hmtx.u16(advances[i]!);
    hmtx.i16(Math.max(-32768, Math.min(32767, lsbs[i]!)));
  }

  // -- head ------------------------------------------------------------------------------------
  // 1904-01-01 to 1970-01-01 is 2,082,844,800 seconds; the file is stamped at a fixed date so that
  // two people who build the same design get byte-identical files.
  const EPOCH = 3_600_000_000;
  const head = new Writer();
  head.u32(0x00010000);
  head.u32(0x00010000);
  head.u32(0); // checkSumAdjustment, patched at the end
  head.u32(0x5f0f3cf5);
  head.u16(0x000b);
  head.u16(UPM);
  head.i64(EPOCH);
  head.i64(EPOCH);
  head.i16(xMin);
  head.i16(yMin);
  head.i16(xMax);
  head.i16(yMax);
  head.u16(italic ? 0x0002 : 0x0000);
  head.u16(8);
  head.i16(2);
  head.i16(1); // Long loca offsets: no division by two, no 64k ceiling to trip over.
  head.i16(0);

  // -- hhea ------------------------------------------------------------------------------------
  const hhea = new Writer();
  hhea.u32(0x00010000);
  hhea.i16(face.ascent);
  hhea.i16(-face.descent);
  hhea.i16(face.lineGap);
  hhea.u16(Math.max(...advances));
  hhea.i16(Math.min(...lsbs));
  hhea.i16(0);
  hhea.i16(xMax);
  hhea.i16(1);
  hhea.i16(0);
  hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0);
  hhea.u16(numGlyphs);

  // -- maxp ------------------------------------------------------------------------------------
  const maxp = new Writer();
  maxp.u32(0x00010000);
  maxp.u16(numGlyphs);
  maxp.u16(Math.max(...entries.map((e) => e.points)));
  maxp.u16(Math.max(...entries.map((e) => e.contours)));
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(2);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(0);

  // -- OS/2 ------------------------------------------------------------------------------------
  const os2 = new Writer();
  const avg = Math.round(advances.reduce((a, b) => a + b, 0) / advances.length);
  os2.u16(4);
  os2.i16(avg);
  os2.u16(weightClass(face.design.params.weight));
  os2.u16(widthClass(face.design.params.width));
  os2.u16(0); // Installable embedding: the file is the user's.
  os2.i16(650);
  os2.i16(700);
  os2.i16(0);
  os2.i16(140);
  os2.i16(650);
  os2.i16(700);
  os2.i16(0);
  os2.i16(477);
  os2.i16(Math.round(face.metrics.w));
  os2.i16(Math.round(face.metrics.xh * 0.5));
  os2.i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(0x00000003); // Basic Latin and Latin-1 Supplement.
  os2.u32(0);
  os2.u32(0);
  os2.u32(0);
  os2.ascii('PNCH');
  os2.u16(italic ? 0x0001 : 0x0040);
  os2.u16(chars.length ? chars[0]!.codePointAt(0)! : 0x20);
  os2.u16(chars.length ? chars[chars.length - 1]!.codePointAt(0)! : 0x20);
  os2.i16(face.ascent);
  os2.i16(-face.descent);
  os2.i16(face.lineGap);
  os2.u16(face.ascent);
  os2.u16(face.descent);
  os2.u32(0x00000001);
  os2.u32(0);
  os2.i16(Math.round(face.metrics.xh));
  os2.i16(Math.round(face.metrics.cap));
  os2.u16(0x0020);
  os2.u16(0x0020);
  os2.u16(2);

  // -- name ------------------------------------------------------------------------------------
  const records: Array<{ id: number; text: string }> = [
    { id: 0, text: 'Made with Punchcutter. Do what you like with it.' },
    { id: 1, text: names.family },
    { id: 2, text: names.style },
    { id: 3, text: `${names.family} ${names.style} Punchcutter` },
    { id: 4, text: `${names.family} ${names.style}` },
    { id: 5, text: names.version },
    { id: 6, text: names.postscript },
    { id: 11, text: 'https://punchcutter.plausible.ventures' },
  ];
  const nameData = new Writer();
  interface NameRow {
    platform: number;
    encoding: number;
    language: number;
    id: number;
    length: number;
    offset: number;
  }
  const rows: NameRow[] = [];
  for (const r of records) {
    // Macintosh, single-byte. Some installers on macOS still read these first.
    rows.push({ platform: 1, encoding: 0, language: 0, id: r.id, length: r.text.length, offset: nameData.length });
    nameData.ascii(r.text);
  }
  for (const r of records) {
    rows.push({
      platform: 3,
      encoding: 1,
      language: 0x409,
      id: r.id,
      length: r.text.length * 2,
      offset: nameData.length,
    });
    nameData.utf16(r.text);
  }
  const name = new Writer();
  name.u16(0);
  name.u16(rows.length);
  name.u16(6 + rows.length * 12);
  for (const r of rows) {
    name.u16(r.platform);
    name.u16(r.encoding);
    name.u16(r.language);
    name.u16(r.id);
    name.u16(r.length);
    name.u16(r.offset);
  }
  name.bytes(nameData.done());

  // -- post ------------------------------------------------------------------------------------
  const post = new Writer();
  post.u32(0x00030000); // Version 3: no glyph names at all, which nothing modern needs.
  post.u32(italic ? 0xfff40000 : 0); // A rough italic angle, as a Fixed. Cosmetic.
  post.i16(-Math.round(face.descent * 0.4));
  post.i16(Math.round(face.metrics.w * 0.6));
  // `isFixedPitch`. Editors read this to decide whether to offer a font as a code font at all, so
  // a monospaced face that forgets to declare itself never appears in the list it was made for.
  post.u32(face.metrics.mono ? 1 : 0);
  post.u32(0);
  post.u32(0);
  post.u32(0);
  post.u32(0);

  // -- the directory ---------------------------------------------------------------------------
  const gidOf = new Map<string, number>();
  chars.forEach((ch, i) => gidOf.set(ch, i + 1));
  const gpos = buildGPOS(face.kerning.classes(), gidOf);

  const tables: Array<{ tag: string; data: Uint8Array }> = [
    ...(gpos.length ? [{ tag: 'GPOS', data: gpos }] : []),
    { tag: 'OS/2', data: os2.done() },
    { tag: 'cmap', data: cmap.done() },
    { tag: 'glyf', data: glyf.done() },
    { tag: 'head', data: head.done() },
    { tag: 'hhea', data: hhea.done() },
    { tag: 'hmtx', data: hmtx.done() },
    { tag: 'loca', data: loca.done() },
    { tag: 'maxp', data: maxp.done() },
    { tag: 'name', data: name.done() },
    { tag: 'post', data: post.done() },
  ].sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const n = tables.length;
  const searchPow = 2 ** Math.floor(Math.log2(n));
  const out = new Writer();
  out.u32(0x00010000);
  out.u16(n);
  out.u16(searchPow * 16);
  out.u16(Math.log2(searchPow));
  out.u16(n * 16 - searchPow * 16);

  let offset = 12 + n * 16;
  const placed: Array<{ tag: string; data: Uint8Array; offset: number }> = [];
  for (const t of tables) {
    const padded = new Uint8Array(Math.ceil(t.data.length / 4) * 4);
    padded.set(t.data);
    out.tag(t.tag);
    out.u32(checksum(padded));
    out.u32(offset);
    out.u32(t.data.length);
    placed.push({ tag: t.tag, data: padded, offset });
    offset += padded.length;
  }
  for (const t of placed) out.bytes(t.data);

  const file = out.done();

  // The final rule: the whole file must check-sum to a constant, and the slack is taken up by a
  // field inside `head` that therefore has to be written after everything else is in place.
  const headEntry = placed.find((t) => t.tag === 'head')!;
  const adjust = (0xb1b0afba - checksum(file)) >>> 0;
  const at = headEntry.offset + 8;
  file[at] = (adjust >>> 24) & 0xff;
  file[at + 1] = (adjust >>> 16) & 0xff;
  file[at + 2] = (adjust >>> 8) & 0xff;
  file[at + 3] = adjust & 0xff;

  return file;
}
