/**
 * The design space.
 *
 * Nine numbers, and the whole typeface follows from them. That is the bet the tool makes: that a
 * monoline geometric alphabet has few enough genuinely free decisions that a person can hold all of
 * them at once, and that the interesting work is in moving between coherent faces rather than in
 * placing four thousand individual points.
 *
 * Everything is measured in font units against a 1000-unit em, which is the unit a type designer
 * already thinks in and the unit the .ttf is written in, so no number in this file has to be
 * translated on its way out.
 */

export const UPM = 1000;

/**
 * Cap height is fixed rather than exposed.
 *
 * It reads as a size control, not a design control — a face with a smaller cap height just looks
 * like the same face set smaller — so it would spend a slider without buying a new typeface. The
 * ratios that actually change the design (x-height, ascender, descender) are all measured against
 * it, which is also why holding it still keeps those three sliders honest.
 */
export const CAP = 700;

export interface Params {
  /** Stroke width, in units. The single loudest control in the set. */
  weight: number;
  /** Horizontal proportion. 1 is the drawn default; below is condensed, above extended. */
  width: number;
  /** 0 leaves bowls rectangular, 1 rounds them as far as the box allows. */
  round: number;
  /** x-height as a fraction of cap height. */
  xheight: number;
  /** Ascender height as a multiple of cap height. */
  ascend: number;
  /** Descender depth as a fraction of cap height, below the baseline. */
  descend: number;
  /** 0 cuts stroke ends flat, 1 finishes them half-round. */
  terminal: number;
  /** Shear, in degrees. Positive leans right. */
  slant: number;
  /** Extra space added to both sidebearings, in units. */
  tracking: number;
  /** 0 draws every stroke the same width; 1 makes stems much heavier than horizontals. */
  contrast: number;
  /** How far a serif reaches past its stroke, as a multiple of the stroke width. 0 is a sans. */
  serif: number;
  /** 0 joins the serif to the stem square, 1 with a full quarter-round throat. */
  bracket: number;
  /** How far the hand drifts off the ruled line. 0 is a machine. */
  wobble: number;
  /** How much a stroke thins where it runs into another. 0 is a true monoline. */
  modulation: number;
  /** 0 cuts terminals square to the stroke, 1 slants them the way a broad nib would. */
  cut: number;
  /** The blob on the end of a curved stroke. 0 leaves the terminal plain. */
  ball: number;
}

export interface Axis {
  key: keyof Params;
  label: string;
  /** What moving this slider actually does to the letters, in the tool's own voice. */
  note: string;
  min: number;
  max: number;
  step: number;
  /** How the value reads in the panel. */
  unit: 'units' | 'ratio' | 'degrees' | 'percent';
}

export const AXES: Axis[] = [
  {
    key: 'weight',
    label: 'Weight',
    note: 'Thickness of the pen. With contrast up, it is the average of the thick and thin.',
    min: 20,
    max: 190,
    step: 1,
    unit: 'units',
  },
  {
    key: 'width',
    label: 'Width',
    note: 'How far the letters are stretched sideways. Stroke thickness holds.',
    min: 0.6,
    max: 1.6,
    step: 0.01,
    unit: 'ratio',
  },
  {
    key: 'round',
    label: 'Roundness',
    note: 'Squares off the bowls at 0, closes them into circles at 100.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'xheight',
    label: 'x-height',
    note: 'Size of the lowercase against the caps. High reads large, low reads formal.',
    min: 0.4,
    max: 0.92,
    step: 0.005,
    unit: 'percent',
  },
  {
    key: 'ascend',
    label: 'Ascender',
    note: 'How far b, d, h and l reach past the cap line.',
    min: 0.98,
    max: 1.34,
    step: 0.005,
    unit: 'ratio',
  },
  {
    key: 'descend',
    label: 'Descender',
    note: 'How far g, p, q and y hang below the baseline.',
    min: 0.08,
    max: 0.44,
    step: 0.005,
    unit: 'percent',
  },
  {
    key: 'terminal',
    label: 'Terminal',
    note: 'Flat cut at 0, half-round at 100. Changes the whole temperature of the face.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'slant',
    label: 'Slant',
    note: 'A true oblique — the drawing is sheared, not redrawn.',
    min: -8,
    max: 26,
    step: 0.5,
    unit: 'degrees',
  },
  {
    key: 'tracking',
    label: 'Tracking',
    note: 'Air on both sides of every letter.',
    min: -70,
    max: 140,
    step: 1,
    unit: 'units',
  },
  {
    key: 'contrast',
    label: 'Contrast',
    note: 'Thickens the uprights and thins the horizontals. The difference between a poster and a book.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'serif',
    label: 'Serif',
    note: 'Length of the little bar across the end of each stroke. At 0 you have a sans again.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'bracket',
    label: 'Bracket',
    note: 'The curve where a serif meets its stem. Square is a slab; curved is a book face.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'cut',
    label: 'Terminal angle',
    note: 'Slants the cut across each stroke end, the way a pen held at an angle leaves it.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'ball',
    label: 'Ball terminals',
    note: 'Puts a blob on the end of every curved stroke — the a, the c, the f, the r. A book-face habit.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'modulation',
    label: 'Modulation',
    note: 'Thins each stroke where it runs into another. Nothing drawn by hand is one width throughout.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
  {
    key: 'wobble',
    label: 'Wobble',
    note: 'How far the hand strays off the line. Every letter strays the same way every time.',
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'percent',
  },
];

export const DEFAULTS: Params = {
  weight: 78,
  width: 1,
  round: 1,
  xheight: 0.72,
  ascend: 1.06,
  descend: 0.28,
  terminal: 0,
  slant: 0,
  tracking: 0,
  contrast: 0,
  serif: 0,
  bracket: 0,
  wobble: 0,
  modulation: 0.3,
  cut: 0,
  ball: 0,
};

/**
 * Named starting points.
 *
 * These are not presets in the sense of "the good ones". They are corners of the space, chosen so
 * that landing on any of them tells you something about which slider does what — which is a faster
 * way to learn a nine-dimensional control panel than reading nine labels.
 */
/**
 * A style: a named point in the space that sets the letterforms as well as the numbers.
 *
 * This is what replaced a list of slider presets, and the difference is the whole answer to why a
 * parametric tool can feel like it only makes one typeface. Sliders move proportions; they cannot
 * turn a single-storey a into a two-storey one, and until they can, everything the tool produces
 * reads as a variation on whatever construction was drawn first.
 */
export interface Style {
  name: string;
  blurb: string;
  family: FamilyId;
  params: Params;
  alts: AltKey[];
}

const P = (over: Partial<Params>): Params => ({ ...DEFAULTS, ...over });

export const STYLES: Style[] = [
  // -- Sans -------------------------------------------------------------------------------------
  {
    name: 'Geometric',
    blurb: 'Circles and straight lines, the way 1925 meant it.',
    family: 'sans',
    alts: [],
    params: P({ weight: 78, width: 1.02, round: 1, xheight: 0.72, ascend: 1.06, descend: 0.28 , modulation: 0.08}),
  },
  {
    name: 'Grotesque',
    blurb: 'Two-storey a, tight and neutral. The airport sign.',
    family: 'sans',
    alts: ['a2'],
    params: P({ weight: 86, width: 0.98, round: 0.88, xheight: 0.76, ascend: 1.02, descend: 0.24, tracking: -6 , modulation: 0.34, cut: 0.12}),
  },
  {
    name: 'Humanist',
    blurb: 'Drawn as if written. Angled e, straight r, splayed M.',
    family: 'sans',
    alts: ['a2', 'eangle', 'rarm', 'ycurve', 'msplay', 'entry'],
    params: P({ weight: 74, width: 1, round: 0.8, xheight: 0.7, ascend: 1.16, descend: 0.3, tracking: 4 , modulation: 0.46, cut: 0.5}),
  },
  {
    name: 'Filament',
    blurb: 'Drawn with a needle. Set it large or lose it.',
    family: 'sans',
    alts: [],
    params: P({ weight: 26, width: 1.12, round: 1, xheight: 0.7, ascend: 1.1, descend: 0.3, terminal: 1, tracking: 64 , modulation: 0.05}),
  },
  {
    name: 'Bollard',
    blurb: 'As heavy as the counters will survive.',
    family: 'sans',
    alts: [],
    params: P({ weight: 168, width: 1.24, round: 0.86, xheight: 0.8, ascend: 1.02, descend: 0.22, tracking: -14 , modulation: 0.2}),
  },
  {
    name: 'Terminal',
    blurb: 'Corners squared off. Reads as a machine talking.',
    family: 'sans',
    alts: [],
    params: P({ weight: 88, width: 0.92, round: 0.06, xheight: 0.76, ascend: 1.04, descend: 0.26, tracking: 4 , modulation: 0.05}),
  },
  {
    name: 'Lantern',
    blurb: 'Round ends, wide set. Signage that wants to be liked.',
    family: 'sans',
    alts: [],
    params: P({ weight: 104, width: 1.3, round: 1, xheight: 0.78, ascend: 1.05, descend: 0.26, terminal: 1, tracking: 14 , modulation: 0.1}),
  },
  {
    name: 'Rue',
    blurb: 'Narrow, tall-shouldered, leaning. An awning at speed.',
    family: 'sans',
    alts: ['a2'],
    params: P({ weight: 66, width: 0.7, round: 0.7, xheight: 0.66, ascend: 1.2, descend: 0.34, slant: 14, tracking: 2 }),
  },
  {
    name: 'Almanac',
    blurb: 'Small lowercase, long extenders. Old habits, no serifs.',
    family: 'sans',
    alts: ['a2', 'eangle'],
    params: P({ weight: 62, width: 0.98, round: 0.92, xheight: 0.5, ascend: 1.3, descend: 0.4, terminal: 0.4, tracking: 18 }),
  },
  {
    name: 'Pillbox',
    blurb: 'Squat, fat, round-ended. Entirely shameless.',
    family: 'sans',
    alts: [],
    params: P({ weight: 140, width: 1.4, round: 1, xheight: 0.9, ascend: 1, descend: 0.14, terminal: 1, tracking: -6 }),
  },

  // -- Serif ------------------------------------------------------------------------------------
  {
    name: 'Old-style',
    blurb: 'Written before it was cut. Angled e, splayed M, deep brackets.',
    family: 'serif',
    alts: ['a2', 'eangle', 'ycurve', 'msplay', 'g2', 'entry'],
    params: P({ weight: 70, width: 1, round: 0.8, xheight: 0.64, ascend: 1.24, descend: 0.32, contrast: 0.45, serif: 0.55, bracket: 0.9, tracking: 6 , modulation: 0.5, ball: 0.7, cut: 0.45}),
  },
  {
    name: 'Transitional',
    blurb: 'The book face. Even, upright, unremarkable on purpose.',
    family: 'serif',
    alts: ['a2', 'g2', 'entry'],
    params: P({ weight: 72, width: 1, round: 0.82, xheight: 0.68, ascend: 1.16, descend: 0.3, contrast: 0.52, serif: 0.6, bracket: 0.78, tracking: 4 , modulation: 0.42, ball: 0.55, cut: 0.25}),
  },
  {
    name: 'Slab',
    blurb: 'Serifs as thick as the stems, no contrast at all.',
    family: 'serif',
    alts: [],
    params: P({ weight: 92, width: 1.02, round: 0.72, xheight: 0.74, ascend: 1.06, descend: 0.26, contrast: 0, serif: 0.8, bracket: 0.1, tracking: 4 , modulation: 0.2, ball: 0, cut: 0}),
  },
  {
    name: 'Didone',
    blurb: 'All contrast, hairline serifs. A poster from 1820.',
    family: 'serif',
    alts: ['a2', 'g2'],
    params: P({ weight: 86, width: 1.06, round: 0.85, xheight: 0.7, ascend: 1.12, descend: 0.3, contrast: 0.92, serif: 0.9, bracket: 0.12, tracking: 10 , modulation: 0.3, ball: 0.85, cut: 0}),
  },

  // -- Mono -------------------------------------------------------------------------------------
  {
    name: 'Humanist',
    blurb: 'Two-storey a, tailed l, slashed zero. A code face.',
    family: 'mono',
    alts: ['a2', 'eangle', 'rarm', 'ycurve', 'ltail', 'ifoot', 'zeroslash', 'onefoot', 'entry'],
    params: P({ weight: 76, width: 1, round: 0.72, xheight: 0.74, ascend: 1.14, descend: 0.3, serif: 0.18, bracket: 0.6, contrast: 0.12 , modulation: 0.4, cut: 0.35}),
  },
  {
    name: 'Geometric',
    blurb: 'Squared bowls, circle a. The terminal of a spacecraft.',
    family: 'mono',
    alts: ['zeroslash', 'ltail', 'onefoot'],
    params: P({ weight: 74, width: 1, round: 0.45, xheight: 0.75, ascend: 1.08, descend: 0.28, serif: 0.24, bracket: 0.3 , modulation: 0.12}),
  },
  {
    name: 'Typewriter',
    blurb: 'Heavy slabs on everything. Struck through a ribbon.',
    family: 'mono',
    alts: ['a2', 'ifoot', 'onefoot', 'zerodot'],
    params: P({ weight: 82, width: 1.02, round: 0.85, xheight: 0.7, ascend: 1.12, descend: 0.3, serif: 0.66, bracket: 0.25, contrast: 0.15, tracking: 8 , modulation: 0.25}),
  },
  {
    name: 'Ghost',
    blurb: 'Monospaced hairline. Round ends, said quietly.',
    family: 'mono',
    alts: ['zeroslash', 'ltail'],
    params: P({ weight: 36, width: 1, round: 0.7, xheight: 0.74, ascend: 1.1, descend: 0.28, terminal: 1 }),
  },

  // -- Hand -------------------------------------------------------------------------------------
  {
    name: 'Marker',
    blurb: 'Thick, round-ended, leaning. Written fast.',
    family: 'hand',
    alts: [],
    params: P({ weight: 88, width: 1.02, round: 0.95, xheight: 0.68, ascend: 1.16, descend: 0.32, terminal: 1, slant: 9, tracking: 14, wobble: 0.45 , modulation: 0.15}),
  },
  {
    name: 'Notebook',
    blurb: 'A light hand, barely off the line.',
    family: 'hand',
    alts: ['a2', 'ycurve', 'eangle'],
    params: P({ weight: 52, width: 0.96, round: 0.88, xheight: 0.62, ascend: 1.22, descend: 0.34, terminal: 1, slant: 5, tracking: 8, contrast: 0.15, wobble: 0.24 , modulation: 0.35}),
  },
  {
    name: 'Ransom',
    blurb: 'All the wobble there is. Legible, barely.',
    family: 'hand',
    alts: ['msplay', 'wcross'],
    params: P({ weight: 74, width: 1.04, round: 0.6, xheight: 0.7, ascend: 1.1, descend: 0.3, terminal: 0.5, tracking: 20, wobble: 1 }),
  },
];

// ---------------------------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------------------------

export type FamilyId = 'sans' | 'serif' | 'mono' | 'hand';

/**
 * The alternate constructions, named here rather than where they are drawn.
 *
 * The list has to live on this side of the import graph because the link encoding depends on its
 * order and `glyphs.ts` already depends on this file. The drawings themselves stay next to the rest
 * of the alphabet; this is only the register of what exists and in what order.
 *
 * Nothing may be reordered or removed once a link has been shared, because a shared link is a
 * bitmask against exactly this order. New alternates go on the end.
 */
export type AltKey =
  | 'a2'
  | 'g2'
  | 'entry'
  | 'eangle'
  | 'rarm'
  | 'ycurve'
  | 'msplay'
  | 'wcross'
  | 'ltail'
  | 'ifoot'
  | 'zeroslash'
  | 'zerodot'
  | 'onefoot';

export const ALT_KEYS: AltKey[] = [
  'a2',
  'g2',
  'entry',
  'eangle',
  'rarm',
  'ycurve',
  'msplay',
  'wcross',
  'ltail',
  'ifoot',
  'zeroslash',
  'zerodot',
  'onefoot',
];

/**
 * The four genres, and what each one actually is.
 *
 * The `lesson` on each is not decoration. Most people arriving at a font tool have never been told
 * what separates a serif from a sans beyond "one has the little bits", and the difference is the
 * only thing in typography that is both easy to explain and immediately useful. A specimen sheet
 * has always been half catalogue and half argument for the type on it; this is the argument.
 */
export interface Family {
  id: FamilyId;
  name: string;
  /** Six words for the picker. */
  tag: string;
  /** What the genre is and where it came from. */
  lesson: string;
  /** What it is actually good for. */
  good: string;
  /** Which axes make sense here. The rest are hidden rather than disabled. */
  axes: Array<keyof Params>;
  /** Where the family starts when you pick it. */
  params: Params;
  /** Monospaced families give every character the same advance. */
  mono?: boolean;
  /** The letterforms the family opens with. */
  alts: AltKey[];
}

const SHARED: Array<keyof Params> = ['weight', 'width', 'round', 'xheight', 'ascend', 'descend'];
const TAIL: Array<keyof Params> = ['modulation', 'slant', 'tracking'];

export const FAMILIES: Family[] = [
  {
    id: 'sans',
    name: 'Sans',
    tag: 'No serifs. Circles and straight lines.',
    lesson:
      'Sans means without — without the little bars on the ends of the strokes. It is the youngest ' +
      'of the four. The first one printed appeared in 1816 and struck people as so odd that one of ' +
      'its early names was grotesque, which stuck. This one is geometric: its letters are built out ' +
      'of circles and straight lines rather than drawn by eye, the way the Bauhaus and Futura built ' +
      'theirs in the 1920s. Turn Roundness down and you get the squared-off technical version of the ' +
      'same idea.',
    good: 'Signs, screens, interfaces — anything that has to be read quickly, or from across a room.',
    axes: [...SHARED, 'terminal', 'cut', ...TAIL],
    alts: [],
    params: { ...DEFAULTS, modulation: 0.12 },
  },
  {
    id: 'serif',
    name: 'Serif',
    tag: 'Bars on the stroke ends. Made for reading.',
    lesson:
      'A serif is the small bar that finishes a stroke: the feet of an H, the tips of an E\u2019s ' +
      'arms. They are inherited from Roman letters cut into stone, where the chisel left them, and ' +
      'Latin type has had them since Latin type began. They give a line of text a horizontal grain ' +
      'for the eye to run along, which is one reason nearly every book you have read is set in one. ' +
      'Contrast \u2014 thick uprights against thin horizontals \u2014 is the other half of the ' +
      'inheritance: it is the mark of the broad-nibbed pen these shapes were written with before ' +
      'anybody cut them in metal.',
    good: 'Long reading. Books, essays, anything that should feel settled rather than urgent.',
    axes: [...SHARED, 'serif', 'bracket', 'contrast', 'ball', 'cut', ...TAIL],
    alts: ['a2', 'g2'],
    params: {
      ...DEFAULTS,
      weight: 72,
      round: 0.78,
      xheight: 0.68,
      ascend: 1.14,
      descend: 0.3,
      serif: 0.6,
      bracket: 0.8,
      contrast: 0.42,
      modulation: 0.44,
      ball: 0.6,
      cut: 0.35,
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    tag: 'Every character the same width.',
    lesson:
      'In a monospaced face an i takes exactly as much room as an m. It comes from the typewriter, ' +
      'which advanced the carriage by the same step whatever key you hit, and it survives because ' +
      'code lines up in columns \u2014 and a column that quietly fails to line up is a bug you ' +
      'cannot see. Making it work means squeezing the wide letters and growing feet on the narrow ' +
      'ones so they fill their slot, which is why so many monospaced faces have serifs on the i and ' +
      'the l even when nothing else in them does.',
    good: 'Code, terminals, tables of figures — anywhere the column matters as much as the word.',
    axes: [...SHARED, 'terminal', 'serif', 'bracket', 'contrast', 'cut', ...TAIL],
    mono: true,
    alts: ['a2', 'eangle', 'rarm', 'ycurve', 'ltail', 'ifoot', 'zeroslash', 'onefoot'],
    params: {
      ...DEFAULTS,
      weight: 74,
      round: 0.55,
      xheight: 0.74,
      ascend: 1.08,
      serif: 0.32,
      bracket: 0.4,
      modulation: 0.36,
    },
  },
  {
    id: 'hand',
    name: 'Hand',
    tag: 'Drawn by something with a pulse.',
    lesson:
      'A handwritten face is a mechanical thing pretending not to be. Real handwriting is never ' +
      'twice the same, but a font has one drawing per letter, so the trick is to be irregular in a ' +
      'way that stays fixed: every letter here is knocked off the ruled line by an amount derived ' +
      'from the letter itself, so an a is always the same a and the page reads as a hand rather than ' +
      'as noise. Push Wobble too far and the illusion breaks in the other direction \u2014 nobody ' +
      'writes that badly on purpose.',
    good: 'Notes, labels, anything that wants to look like a person rather than an institution.',
    axes: [...SHARED, 'wobble', 'terminal', ...TAIL],
    alts: [],
    params: {
      ...DEFAULTS,
      weight: 62,
      round: 0.9,
      xheight: 0.66,
      ascend: 1.18,
      descend: 0.32,
      terminal: 1,
      slant: 6,
      wobble: 0.4,
      tracking: 10,
      modulation: 0.28,
    },
  },
];

export function familyOf(id: FamilyId): Family {
  return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0]!;
}

/**
 * What has been changed about one character, on its own.
 *
 * Global axes can only ever produce a *coherent* typeface, never a good one. Real faces are tuned
 * letter by letter — this `g` a shade narrower, that `t` a shade taller, the `f` given more room on
 * its left — and no number of sliders that move all hundred and seventy characters at once will
 * substitute for it. This is where that judgement goes.
 *
 * Every field is a *relative* adjustment rather than an absolute value, and that is the whole trick
 * for making hand tuning survive a parametric base. A width of 0.94 means "six per cent narrower
 * than this letter would otherwise be", so it still means the right thing after the weight axis has
 * moved and the letter has been redrawn around it. Absolute values would have to be re-tuned every
 * time anything else changed, which is the failure mode that makes most parametric tools a toy.
 */
export interface GlyphEdit {
  /** Multiplier on the counter width. */
  width?: number;
  /** Multiplier on the stroke. */
  weight?: number;
  /** Multipliers on the vertical metrics. */
  xheight?: number;
  ascend?: number;
  descend?: number;
  /** Absolute override of roundness, which is already a 0..1 quantity. */
  round?: number;
  /** Extra degrees of shear, on top of the face's own slant. */
  slant?: number;
  /** Extra space on each side, in units. Negative tightens. */
  lsb?: number;
  rsb?: number;
}

export type Edits = Record<string, GlyphEdit>;

/** The per-glyph controls, in the order the inspector shows them. */
export interface GlyphAxis {
  key: keyof GlyphEdit;
  label: string;
  note: string;
  min: number;
  max: number;
  step: number;
  /** What "unchanged" means for this control. */
  base: number;
  unit: 'multiplier' | 'units' | 'degrees' | 'percent';
}

export const GLYPH_AXES: GlyphAxis[] = [
  { key: 'width', label: 'Width', note: 'Narrower or wider than the face would make it.', min: 0.5, max: 1.8, step: 0.01, base: 1, unit: 'multiplier' },
  { key: 'weight', label: 'Weight', note: 'Lighter or heavier, for a letter that reads too dark or too pale.', min: 0.55, max: 1.6, step: 0.01, base: 1, unit: 'multiplier' },
  { key: 'lsb', label: 'Left side', note: 'Space before the letter. The other half of spacing a face by eye.', min: -120, max: 160, step: 1, base: 0, unit: 'units' },
  { key: 'rsb', label: 'Right side', note: 'Space after it.', min: -120, max: 160, step: 1, base: 0, unit: 'units' },
  { key: 'xheight', label: 'x-height', note: 'Overshoot a round letter, or shorten one that sits too tall.', min: 0.85, max: 1.15, step: 0.005, base: 1, unit: 'multiplier' },
  { key: 'ascend', label: 'Ascender', note: 'How far this letter reaches above the cap line.', min: 0.8, max: 1.3, step: 0.005, base: 1, unit: 'multiplier' },
  { key: 'descend', label: 'Descender', note: 'How far it hangs below the baseline.', min: 0.6, max: 1.6, step: 0.01, base: 1, unit: 'multiplier' },
  { key: 'round', label: 'Roundness', note: 'Square this one letter off, or round it, on its own.', min: 0, max: 1, step: 0.01, base: -1, unit: 'percent' },
  { key: 'slant', label: 'Slant', note: 'Lean this letter further than the rest.', min: -12, max: 12, step: 0.5, base: 0, unit: 'degrees' },
];

/** Whether a glyph has been touched at all. */
export function isEdited(e: GlyphEdit | undefined): boolean {
  if (!e) return false;
  return GLYPH_AXES.some((a) => {
    const v = e[a.key];
    return v !== undefined && (a.base < 0 || Math.abs(v - a.base) > 1e-9);
  });
}

/** A complete design: which genre, which letterforms, where in the space, and what was hand-tuned. */
export interface Design {
  family: FamilyId;
  params: Params;
  /** Which alternate constructions are switched on. Order does not matter. */
  alts: AltKey[];
  /** Per-character adjustments, keyed by the character itself. Absent means untouched. */
  edits: Edits;
}

export const START: Design = { family: 'sans', params: { ...DEFAULTS }, alts: [], edits: {} };

/**
 * The metrics one character is drawn with, once its own adjustments are folded in.
 *
 * Everything downstream — the frame the glyph is laid out in, the pen, the serifs, the kerning —
 * reads `Metrics`, so bending them here is enough to make a per-glyph change reach every part of
 * the drawing without a single one of them knowing that per-glyph changes exist.
 */
export function metricsFor(m: Metrics, e: GlyphEdit | undefined): Metrics {
  if (!e) return m;
  const w = m.w * (e.weight ?? 1);
  const xh = Math.round(m.xh * (e.xheight ?? 1));
  return {
    ...m,
    w,
    h: w / 2,
    xh,
    asc: Math.round(m.asc * (e.ascend ?? 1)),
    desc: Math.round(m.desc * (e.descend ?? 1)),
    over: Math.round(CAP * 0.012 + w * 0.045),
    width: m.width * (e.width ?? 1),
    round: e.round ?? m.round,
    tan: Math.tan(((Math.atan(m.tan) * 180) / Math.PI + (e.slant ?? 0)) * (Math.PI / 180)),
  };
}

/**
 * Alternates pack into the link as a bitmask.
 *
 * One base-36 digit per five switches, in the order `ALTERNATES` declares them, so adding a
 * twelfth alternate lengthens the code by nothing until it crosses a boundary and never changes
 * what an existing link decodes to.
 */
const ALT_ORDER = ALT_KEYS;
const ALT_DIGITS = Math.ceil(ALT_ORDER.length / 5);

function encodeAlts(alts: readonly AltKey[]): string {
  let bits = 0;
  ALT_ORDER.forEach((k, i) => {
    if (alts.includes(k)) bits |= 1 << i;
  });
  return bits.toString(RADIX).padStart(ALT_DIGITS, '0');
}

function decodeAlts(s: string): AltKey[] {
  const bits = parseInt(s, RADIX);
  if (!Number.isFinite(bits)) return [];
  return ALT_ORDER.filter((_, i) => (bits >> i) & 1);
}

export function clampParams(p: Params): Params {
  const out = { ...p };
  for (const a of AXES) {
    const v = out[a.key];
    out[a.key] = Math.min(a.max, Math.max(a.min, Number.isFinite(v) ? v : DEFAULTS[a.key]));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------------------------

export interface Metrics {
  cap: number;
  xh: number;
  asc: number;
  desc: number;
  w: number;
  /** Half the stroke width, used constantly enough to be worth a name. */
  h: number;
  /** Optical overshoot for round tops and bottoms, scaled to the weight. */
  over: number;
  tan: number;
  round: number;
  /**
   * The width the glyph is *drawn* at — already divided by the horizontal scale, because everything
   * downstream builds in the squashed space and is stretched back out at the end.
   */
  width: number;
  terminal: number;
  track: number;
  /** How far the finished drawing is stretched horizontally. 1 means no contrast. */
  xscale: number;
  /** Every character on one advance. */
  mono: boolean;
  contrast: number;
  serif: number;
  bracket: number;
  wobble: number;
  modulation: number;
  cut: number;
  ball: number;
}

/**
 * Contrast, expressed as the factor the drawing is stretched by.
 *
 * A stem drawn one unit wide in the squashed space comes out `xscale` units wide; a horizontal bar
 * comes out exactly as drawn. So the ratio between the two — which is what contrast *is* — is the
 * scale itself, and the range tops out a little under three, which is around where a Didone sits
 * before its hairlines stop printing.
 */
export function scaleOf(contrast: number): number {
  return 1 + contrast * 1.75;
}

export function metricsOf(p: Params, mono = false): Metrics {
  const xscale = scaleOf(p.contrast);
  // Contrast trades thick against thin; it is not a second weight slider. The pen is drawn
  // narrower by the square root of the stretch, so the stems finish at `weight · √k` and the
  // horizontals at `weight / √k` — a geometric mean that holds at whatever the weight slider says,
  // and means moving contrast changes the *colour* of a page of text without darkening it.
  const w = p.weight / Math.sqrt(xscale);
  return {
    cap: CAP,
    xh: Math.round(CAP * p.xheight),
    asc: Math.round(CAP * p.ascend),
    desc: Math.round(CAP * p.descend),
    w,
    h: w / 2,
    // A circle drawn to the same height as a square looks smaller than it. The correction is
    // traditionally about 1% of cap height and grows a little with weight, because a heavier round
    // loses more of itself to the flattening at the extremes.
    over: Math.round(CAP * 0.012 + w * 0.045),
    tan: Math.tan((p.slant * Math.PI) / 180),
    round: p.round,
    width: p.width / xscale,
    terminal: p.terminal,
    track: p.tracking,
    xscale,
    mono,
    contrast: p.contrast,
    serif: p.serif,
    bracket: p.bracket,
    wobble: p.wobble,
    modulation: p.modulation,
    cut: p.cut,
    ball: p.ball,
  };
}

// ---------------------------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------------------------

const RADIX = 36;
const SLOTS = RADIX * RADIX - 1; // Two base-36 digits per axis: 1295 steps, finer than any slider.

/**
 * Params to a short string, and back.
 *
 * A design is worth nothing if it cannot be handed to somebody. Encoding the whole face into
 * eighteen characters means the link *is* the file: no account, no server, nothing to expire. Each
 * axis is quantised to its own range rather than to absolute units, so the precision lands where
 * the slider actually is and the string stays fixed-width no matter what the ranges become.
 */
export function encodeParams(p: Params): string {
  let out = '';
  for (const a of AXES) {
    const t = (p[a.key] - a.min) / (a.max - a.min);
    const n = Math.max(0, Math.min(SLOTS, Math.round(t * SLOTS)));
    out += n.toString(RADIX).padStart(2, '0');
  }
  return out;
}

export function decodeParams(s: string): Params | null {
  const clean = s.trim().toLowerCase();
  // A short code is one written before an axis was added; the axes it does carry are read in order
  // and the rest keep their defaults.
  if (clean.length % 2 !== 0 || clean.length < 4 || clean.length > AXES.length * 2) return null;
  const out = { ...DEFAULTS };
  const carried = clean.length / 2;
  for (let i = 0; i < carried; i++) {
    const a = AXES[i]!;
    const n = parseInt(clean.slice(i * 2, i * 2 + 2), RADIX);
    if (!Number.isFinite(n)) return null;
    const v = a.min + (n / SLOTS) * (a.max - a.min);
    out[a.key] = Math.round(v / a.step) * a.step;
  }
  return clampParams(out);
}

/**
 * The whole design in one string: which family, then every axis.
 *
 * Every axis is written, not just the ones the chosen family shows, so that trying a serif, going
 * back to sans and returning finds the serif exactly where it was left. A shorter link that forgot
 * the hidden axes would be a link that quietly loses work.
 */
/**
 * The hand tuning, packed tight enough to still fit in a link.
 *
 * The whole design living in the address bar is the best property this tool has — no account, no
 * save button, no file to lose — and per-character tuning is exactly the kind of feature that
 * usually kills it. So each edited character costs one character for itself, two for a bitmask of
 * which of its nine controls were touched, and two per touched control. A dozen tuned letters is
 * well under two hundred characters; every letter in the font tuned on every axis is under four
 * thousand, which a URL still carries.
 *
 * No separators: the mask says how many values follow, so the next character begins immediately
 * after them.
 */
function encodeEdits(edits: Edits): string {
  let out = '';
  for (const ch of Object.keys(edits ?? {}).sort()) {
    const e = edits[ch]!;
    let mask = 0;
    let values = '';
    GLYPH_AXES.forEach((a, i) => {
      const v = e[a.key];
      if (v === undefined) return;
      mask |= 1 << i;
      const t = (v - a.min) / (a.max - a.min);
      values += Math.max(0, Math.min(SLOTS, Math.round(t * SLOTS)))
        .toString(RADIX)
        .padStart(2, '0');
    });
    if (mask) out += ch + mask.toString(RADIX).padStart(2, '0') + values;
  }
  return out;
}

function decodeEdits(s: string): Edits {
  const out: Edits = {};
  const chars = [...s];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i]!;
    const mask = parseInt(chars.slice(i + 1, i + 3).join(''), RADIX);
    i += 3;
    if (!Number.isFinite(mask)) break;
    const edit: GlyphEdit = {};
    for (let bit = 0; bit < GLYPH_AXES.length; bit++) {
      if (!((mask >> bit) & 1)) continue;
      const a = GLYPH_AXES[bit]!;
      const n = parseInt(chars.slice(i, i + 2).join(''), RADIX);
      i += 2;
      if (!Number.isFinite(n)) return out;
      const v = a.min + (n / SLOTS) * (a.max - a.min);
      edit[a.key] = Math.round(v / a.step) * a.step;
    }
    out[ch] = edit;
  }
  return out;
}

export function encodeDesign(d: Design): string {
  const i = FAMILIES.findIndex((f) => f.id === d.family);
  const base = Math.max(0, i).toString(RADIX) + encodeParams(d.params) + encodeAlts(d.alts);
  const tuned = encodeEdits(d.edits);
  return tuned ? `${base}.${tuned}` : base;
}

export function decodeDesign(raw: string): Design | null {
  // The tuning is split off before anything is lower-cased: an edited `G` and an edited `g` are
  // different letters, and folding the case would silently move one on to the other.
  const dot = raw.indexOf('.');
  const edits = dot >= 0 ? decodeEdits(raw.slice(dot + 1)) : {};
  const s = dot >= 0 ? raw.slice(0, dot) : raw;
  const clean = s.trim().toLowerCase();
  if (clean.length < 1 + AXES.length * 2) {
    // A design from before the families existed is axes and no prefix. Read it as a sans rather
    // than dropping it: those links were handed out.
    const legacy = decodeParams(clean);
    return legacy ? { family: 'sans', params: legacy, alts: [], edits } : null;
  }
  const family = FAMILIES[parseInt(clean[0]!, RADIX)]?.id ?? 'sans';
  const params = decodeParams(clean.slice(1, 1 + AXES.length * 2));
  if (!params) return null;
  return { family, params, alts: decodeAlts(clean.slice(1 + AXES.length * 2)), edits };
}

/** A stable fingerprint, used to decide whether cached outlines are still good. */
export function designKey(d: Design): string {
  const edits = Object.keys(d.edits ?? {})
    .sort()
    .map((ch) => ch + JSON.stringify(d.edits[ch]))
    .join('');
  return (
    `${d.family}:${encodeAlts(d.alts)}:` +
    AXES.map((a) => d.params[a.key].toFixed(4)).join(',') +
    (edits ? '|' + edits : '')
  );
}

// ---------------------------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------------------------

/**
 * A default name for an unnamed face, derived from the design itself.
 *
 * Left to themselves people download six files called `MyFont.ttf` and cannot tell them apart an
 * hour later. Naming the face after where it sits in the space costs nothing and means the download
 * folder stays legible.
 */
export function suggestName(p: Params, family: FamilyId = 'sans'): string {
  const weight =
    p.weight < 40 ? 'Hairline' : p.weight < 62 ? 'Light' : p.weight < 96 ? 'Book' : p.weight < 130 ? 'Bold' : 'Black';
  const width = p.width < 0.82 ? 'Condensed' : p.width > 1.24 ? 'Extended' : '';
  const shape = p.round < 0.25 ? 'Square' : p.round > 0.85 ? 'Circular' : 'Soft';
  const slant = Math.abs(p.slant) > 4 ? 'Oblique' : '';
  const genre =
    family === 'mono' ? 'Mono' : family === 'hand' ? 'Hand' : family === 'serif' ? '' : shape;
  return ['Punchcut', genre, width, weight, slant].filter(Boolean).join(' ');
}
