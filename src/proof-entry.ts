/**
 * What the proof run needs, in one module.
 *
 * The corners are chosen to be the settings most likely to break something rather than the settings
 * anybody would use: the thinnest and heaviest strokes the sliders allow, the narrowest and widest
 * proportions, every ratio at both ends, and each of those again inside each family.
 */

export { buildFace } from './font';
export { buildTTF } from './ttf';
export { CHARSET } from './glyphs';
export { FAMILIES, STYLES, START } from './params';

import { ALT_KEYS, FAMILIES, STYLES, START, type Design, type Params } from './params';

const corner = (name: string, patch: Partial<Params>): { name: string; design: Design } => ({
  name,
  design: { family: START.family, params: { ...START.params, ...patch }, alts: [], edits: {} },
});

export const CASES: Array<{ name: string; design: Design }> = [
  ...FAMILIES.map((f) => ({ name: `family-${f.id}`, design: { family: f.id, params: f.params, alts: f.alts, edits: {} } })),
  ...STYLES.map((p) => ({ name: `${p.family}-${p.name}`, design: { family: p.family, params: p.params, alts: p.alts, edits: {} } })),
  corner('thinnest', { weight: 20 }),
  corner('heaviest', { weight: 190 }),
  corner('heaviest-narrow', { weight: 190, width: 0.6 }),
  corner('heaviest-wide', { weight: 190, width: 1.6 }),
  corner('square', { round: 0 }),
  corner('square-heavy', { round: 0, weight: 190, width: 0.6 }),
  corner('xheight-low', { xheight: 0.4, weight: 190 }),
  corner('xheight-high', { xheight: 0.92, weight: 20 }),
  corner('extenders-short', { ascend: 0.98, descend: 0.08, xheight: 0.92 }),
  corner('extenders-long', { ascend: 1.34, descend: 0.44, xheight: 0.4 }),
  corner('round-terminals', { terminal: 1, weight: 190 }),
  corner('slant-back', { slant: -8 }),
  corner('slant-far', { slant: 26, weight: 150 }),
  corner('tight', { tracking: -70 }),
  corner('loose', { tracking: 140 }),
  corner('contrast-max', { contrast: 1 }),
  corner('contrast-max-heavy', { contrast: 1, weight: 190 }),
  corner('contrast-max-thin-narrow', { contrast: 1, weight: 20, width: 0.6 }),
  corner('serif-max', { serif: 1, bracket: 1 }),
  corner('serif-max-heavy', { serif: 1, bracket: 1, weight: 190, contrast: 0.9 }),
  corner('serif-square', { serif: 1, bracket: 0, round: 0 }),
  corner('wobble-max', { wobble: 1 }),
  corner('wobble-max-heavy', { wobble: 1, weight: 190 }),
  { name: 'mono-heaviest', design: { family: 'mono', params: { ...START.params, weight: 190, serif: 1 }, alts: [], edits: {} } },
  { name: 'mono-thinnest', design: { family: 'mono', params: { ...START.params, weight: 20 }, alts: [], edits: {} } },
  { name: 'mono-narrow', design: { family: 'mono', params: { ...START.params, width: 0.6, weight: 150 }, alts: [], edits: {} } },
  { name: 'hand-heavy-slant', design: { family: 'hand', params: { ...START.params, wobble: 1, weight: 170, slant: 26 }, alts: [], edits: {} } },
  { name: 'serif-everything', design: { family: 'serif', params: { ...START.params, serif: 1, bracket: 1, contrast: 1, weight: 190, width: 1.6 }, alts: [], edits: {} } },
  {
    name: 'all-alternates',
    design: { family: 'sans', params: { ...START.params }, alts: [...ALT_KEYS], edits: {} },
  },
];
