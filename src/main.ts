/**
 * The tool.
 *
 * One object holds the whole application: nine numbers, a line of specimen text, a caret and a
 * name. Everything else — the sheet, the console, the link in the address bar, the bytes of the
 * download — is derived from it on demand, so there is exactly one place a bug can live and no way
 * for the specimen and the file to disagree about what the typeface is.
 */

import { buildFace, type Face } from './font';
import { ALTERNATES, CHARSET } from './glyphs';
import {
  AXES,
  FAMILIES,
  STYLES,
  START,
  clampParams,
  decodeDesign,
  encodeDesign,
  familyOf,
  suggestName,
  type AltKey,
  type Axis,
  type Design,
  type FamilyId,
  type Params,
} from './params';
import {
  caretAt,
  drawCharset,
  drawHero,
  drawAnatomy,
  drawParagraph,
  drawWaterfall,
  paletteOf,
  type Palette,
} from './specimen';
import { buildTTF, namesFor } from './ttf';

const PARAGRAPH =
  'A punchcutter cut each letter in reverse, by hand, into the end of a steel bar, then struck ' +
  'that punch into a copper blank to make the matrix the type would be cast from. One size, one ' +
  'weight, one alphabet: several months of work, and every judgement in it made by eye. Nothing ' +
  'about the job was parametric, and the letters still had to be looked at. So do these.';

const state = {
  design: { family: START.family, params: { ...START.params }, alts: [...START.alts] } as Design,
  text: 'Punchcutter',
  caret: null as number | null,
  name: '',
  /** The axis under the pointer, so the hero can light the rule that answers to it. */
  live: null as keyof Params | null,
};

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const hero = el<HTMLCanvasElement>('hero');
const capture = el<HTMLInputElement>('hero-capture');
const waterfall = el<HTMLCanvasElement>('waterfall');
const charset = el<HTMLCanvasElement>('charset');
const paragraph = el<HTMLCanvasElement>('paragraph');
const anatomy = el<HTMLCanvasElement>('anatomy');
const nameField = el<HTMLInputElement>('fontname');
const status = el<HTMLParagraphElement>('status');

let palette: Palette = paletteOf();

/**
 * The sheet's own gutter, in pixels.
 *
 * Read off a heading rather than off the custom property, because the property's value is a
 * `clamp()` expression and parsing that gives a number with no relation to what the browser
 * actually resolved. Measuring an element that already uses it is the only way to be sure the
 * canvases start on the same line the headings do.
 */
function gutter(): number {
  const probe = document.querySelector<HTMLElement>('.eyebrow');
  const n = probe ? parseFloat(getComputedStyle(probe).paddingLeft) : NaN;
  return Number.isFinite(n) ? n : 24;
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

let frame = 0;

function render(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const face: Face = buildFace(state.design);
    const pad = gutter();
    // The sheet is painted rather than set, so a screen reader has nothing to read from it unless
    // the specimen line is announced here.
    hero.setAttribute('aria-label', `${state.text || 'The specimen'}, set in the typeface you are drawing`);
    drawHero(hero, face, palette, { text: state.text, caret: state.caret, live: state.live, pad });
    drawWaterfall(waterfall, face, palette, state.text || 'Hamburgefonstiv', pad);
    drawCharset(charset, face, palette, CHARSET, pad);
    drawAnatomy(anatomy, face, palette, pad);
    drawParagraph(paragraph, face, palette, PARAGRAPH, 17, pad);
  });
}

// ---------------------------------------------------------------------------------------------
// The console
// ---------------------------------------------------------------------------------------------

/** How an axis reads in the margin. Percentages are the ones people actually think in. */
function format(axis: Axis, value: number): string {
  switch (axis.unit) {
    case 'units':
      return String(Math.round(value));
    case 'ratio':
      return value.toFixed(2);
    case 'degrees':
      return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}°`;
    case 'percent':
      return `${Math.round(value * 100)}%`;
  }
}

interface Row {
  root: HTMLElement;
  input: HTMLInputElement;
  value: HTMLElement;
}

const rows = new Map<keyof Params, Row>();

function buildFamilies(): void {
  const box = el('families');
  for (const f of FAMILIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'family';
    b.dataset.family = f.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.innerHTML = '<span class="family__name"></span><span class="family__tag"></span>';
    b.querySelector('.family__name')!.textContent = f.name;
    b.querySelector('.family__tag')!.textContent = f.tag;
    b.addEventListener('click', () => pickFamily(f.id));
    box.append(b);
  }
}

/**
 * Switching family keeps nothing.
 *
 * Carrying the current numbers across sounds friendlier and is worse: the weight that reads well as
 * a geometric sans is not the weight that reads well once contrast has thickened its stems, and a
 * sans's spacing in a monospaced slot is nobody's idea of a monospaced face. Each family opens
 * where it looks like itself, and the link remembers every axis anyway, so nothing is lost.
 */
function pickFamily(id: FamilyId): void {
  const f = familyOf(id);
  state.design = { family: id, params: { ...f.params }, alts: [...f.alts] };
  state.name = '';
  nameField.value = '';
  syncConsole();
  writeHash();
  render();
}

function buildConsole(): void {
  const axes = el('axes');
  for (const axis of AXES) {
    const root = document.createElement('div');
    root.className = 'axis';

    const name = document.createElement('span');
    name.className = 'axis__name';
    name.textContent = axis.label;

    const value = document.createElement('span');
    value.className = 'axis__value';

    const input = document.createElement('input');
    input.className = 'axis__slider';
    input.type = 'range';
    input.min = String(axis.min);
    input.max = String(axis.max);
    input.step = String(axis.step);
    input.setAttribute('aria-label', `${axis.label}. ${axis.note}`);

    const note = document.createElement('p');
    note.className = 'axis__note';
    note.textContent = axis.note;

    const enter = () => {
      state.live = axis.key;
      root.classList.add('axis--live');
      render();
    };
    const leave = () => {
      if (state.live !== axis.key) return;
      state.live = null;
      root.classList.remove('axis--live');
      render();
    };

    input.addEventListener('input', () => {
      enter();
      set({ [axis.key]: Number(input.value) } as Partial<Params>);
    });
    input.addEventListener('pointerdown', enter);
    input.addEventListener('focus', enter);
    input.addEventListener('blur', leave);
    root.addEventListener('pointerenter', enter);
    root.addEventListener('pointerleave', leave);

    root.append(name, value, input, note);
    axes.append(root);
    rows.set(axis.key, { root, input, value });
  }

  const presets = el('presets');
  for (const p of STYLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.dataset.preset = `${p.family}/${p.name}`;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="preset__name"></span><span class="preset__blurb"></span>`;
    b.querySelector('.preset__name')!.textContent = p.name;
    b.querySelector('.preset__blurb')!.textContent = p.blurb;
    b.addEventListener('click', () => {
      state.name = '';
      nameField.value = '';
      state.design = { family: p.family, params: clampParams(p.params), alts: [...p.alts] };
      syncConsole();
      writeHash();
      render();
    });
    presets.append(b);
  }

  const alts = el('alts');
  for (const a of ALTERNATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'alt';
    b.dataset.alt = a.key;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="alt__label"></span><span class="alt__note"></span>`;
    b.querySelector('.alt__label')!.textContent = a.label;
    b.querySelector('.alt__note')!.textContent = a.note;
    b.addEventListener('click', () => toggleAlt(a.key));
    alts.append(b);
  }
}

/**
 * Turning one letterform on turns off the ones that would draw over it.
 *
 * A zero cannot be both slashed and dotted, and offering both switches with no relationship between
 * them produces a state where the later one silently wins and the earlier button still looks
 * pressed. Grouping them makes the interface tell the truth.
 */
const EXCLUSIVE: AltKey[][] = [['zeroslash', 'zerodot']];

function toggleAlt(key: AltKey): void {
  const on = state.design.alts.includes(key);
  const group = EXCLUSIVE.find((g) => g.includes(key)) ?? [];
  const next = state.design.alts.filter((k) => k !== key && !group.includes(k));
  if (!on) next.push(key);
  state.design = { ...state.design, alts: next };
  syncConsole();
  writeHash();
  render();
}

function syncConsole(): void {
  const family = familyOf(state.design.family);
  const shown = new Set<keyof Params>(family.axes);

  for (const axis of AXES) {
    const row = rows.get(axis.key)!;
    // Axes that mean nothing to this family are removed rather than greyed out. A disabled control
    // still asks to be understood; an absent one does not.
    row.root.hidden = !shown.has(axis.key);
    const v = state.design.params[axis.key];
    if (document.activeElement !== row.input) row.input.value = String(v);
    row.value.textContent = format(axis, v);
  }

  for (const b of document.querySelectorAll<HTMLButtonElement>('.family')) {
    b.setAttribute('aria-checked', String(b.dataset.family === state.design.family));
  }

  const code = encodeDesign(state.design);
  for (const b of document.querySelectorAll<HTMLButtonElement>('.preset')) {
    const p = STYLES.find((x) => `${x.family}/${x.name}` === b.dataset.preset);
    b.hidden = !p || p.family !== state.design.family;
    const same = p && encodeDesign({ family: p.family, params: clampParams(p.params), alts: p.alts }) === code;
    b.setAttribute('aria-pressed', String(!!same));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.alt')) {
    b.setAttribute('aria-pressed', String(state.design.alts.includes(b.dataset.alt as AltKey)));
  }

  el('lesson-name').textContent = family.name;
  el('lesson-tag').textContent = family.tag;
  el('lesson-text').textContent = family.lesson;
  el('lesson-good').textContent = family.good;
  nameField.placeholder = suggestName(state.design.params, state.design.family);
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

function set(patch: Partial<Params>): void {
  state.design = { ...state.design, params: clampParams({ ...state.design.params, ...patch }) };
  syncConsole();
  writeHash();
  render();
}

let hashTimer = 0;
function writeHash(): void {
  // The address bar is written on a delay: a slider drag fires a hundred times a second and every
  // one of those would be a history entry to walk back through.
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const q = new URLSearchParams();
    q.set('f', encodeDesign(state.design));
    if (state.name.trim()) q.set('n', state.name.trim());
    if (state.text !== 'Punchcutter') q.set('t', state.text);
    history.replaceState(null, '', `#${q.toString()}`);
  }, 220);
}

function readHash(): void {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const q = new URLSearchParams(raw);
  const d = decodeDesign(q.get('f') ?? '');
  if (d) state.design = d;
  const n = q.get('n');
  if (n) {
    state.name = n.slice(0, 48);
    nameField.value = state.name;
  }
  const t = q.get('t');
  if (t !== null) {
    state.text = t.slice(0, 40);
    capture.value = state.text;
  }
}

/**
 * A link pasted into the address bar of a tab that is already open.
 *
 * Changing only the fragment does not reload the page, so without this the second face somebody is
 * sent silently does nothing — which looks exactly like a broken link. `writeHash` uses
 * `replaceState`, which does not fire this event, so there is no loop to guard against.
 */
window.addEventListener('hashchange', () => {
  readHash();
  syncConsole();
  render();
});

// ---------------------------------------------------------------------------------------------
// Typing into the specimen
// ---------------------------------------------------------------------------------------------

/**
 * The caret is drawn, not borrowed.
 *
 * A text field cannot show a font that has not been installed, and installing one on every
 * keystroke is slower than drawing the letters. So a real input sits off the page to collect
 * keystrokes and raise the keyboard on a phone, and the caret you can see is painted on the canvas
 * at a position this code tracks itself.
 */
function wireTyping(): void {
  const focus = (index: number | null) => {
    state.caret = index;
    capture.value = state.text;
    capture.setSelectionRange(index ?? state.text.length, index ?? state.text.length);
    capture.focus({ preventScroll: true });
    render();
  };

  // The default action of a press is to move focus to whatever was pressed, which would take it
  // straight back off the input this handler just gave it to. Suppressing that is the whole trick.
  hero.addEventListener('mousedown', (e) => e.preventDefault());
  hero.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const face = buildFace(state.design);
    focus(caretAt(hero, face, state.text, e.clientX, gutter()));
  });

  capture.addEventListener('input', () => {
    state.text = capture.value.slice(0, 40);
    if (capture.value.length > 40) capture.value = state.text;
    state.caret = capture.selectionStart ?? state.text.length;
    writeHash();
    render();
  });

  const track = () => {
    if (document.activeElement !== capture) return;
    state.caret = capture.selectionStart ?? state.text.length;
    render();
  };
  capture.addEventListener('keyup', track);
  capture.addEventListener('select', track);
  capture.addEventListener('blur', () => {
    state.caret = null;
    render();
  });
}

// ---------------------------------------------------------------------------------------------
// Taking it away
// ---------------------------------------------------------------------------------------------

function say(message: string): void {
  status.textContent = message;
  clearTimeout(say.timer);
  say.timer = window.setTimeout(() => {
    status.textContent = 'The link carries the family and every axis, shown or not.';
  }, 4000);
}
say.timer = 0;

function download(): void {
  const face = buildFace(state.design);
  const raw = state.name.trim() || suggestName(state.design.params, state.design.family);
  const bytes = buildTTF(face, raw);
  const names = namesFor(raw, face);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'font/ttf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${names.postscript}.ttf`;
  a.click();
  // Revoked on the next turn of the event loop: Safari needs the element to have been clicked
  // before the URL goes away, and every browser is finished with it by then.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  say(`Saved ${names.postscript}.ttf — ${(bytes.length / 1024).toFixed(0)} KB. Open it to install.`);
}

async function share(): Promise<void> {
  const q = new URLSearchParams();
  q.set('f', encodeDesign(state.design));
  if (state.name.trim()) q.set('n', state.name.trim());
  if (state.text !== 'Punchcutter') q.set('t', state.text);
  const link = `${location.origin}${location.pathname}#${q.toString()}`;
  try {
    await navigator.clipboard.writeText(link);
    say('Link copied. It opens on this exact face.');
  } catch {
    history.replaceState(null, '', `#${q.toString()}`);
    say('Clipboard blocked — the link in the address bar is the one to copy.');
  }
}

/**
 * A random face that still looks designed.
 *
 * Nine independent uniform draws give you noise: a hairline squeezed to a condensed width with a
 * tiny x-height is a legal point in the space and an ugly typeface. Weight is drawn first and the
 * rest are pulled toward what suits it — heavier wants wider and a taller x-height — which is the
 * difference between a button worth pressing twice and one worth pressing once.
 */
function surprise(): void {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const weight = rand(24, 168);
  const heavy = (weight - 24) / 144;
  const family = familyOf(state.design.family);
  const has = (k: keyof Params) => family.axes.includes(k);
  state.name = '';
  nameField.value = '';
  set({
    weight: Math.round(weight),
    width: Number(rand(0.74, 1.06 + heavy * 0.42).toFixed(2)),
    round: Math.random() < 0.35 ? Number(rand(0, 0.35).toFixed(2)) : Number(rand(0.55, 1).toFixed(2)),
    xheight: Number(rand(0.55 + heavy * 0.1, 0.86).toFixed(3)),
    ascend: Number(rand(1, 1.24).toFixed(3)),
    descend: Number(rand(0.16, 0.38).toFixed(3)),
    terminal: Math.random() < 0.5 ? 0 : Number(rand(0.3, 1).toFixed(2)),
    slant: Math.random() < 0.75 ? 0 : Number(rand(6, 20).toFixed(1)),
    tracking: Math.round(rand(-14, 46)),
    // Only the axes this family shows are rolled; the rest keep whatever the family opened with,
    // so pressing the button in Serif never quietly produces a sans.
    contrast: has('contrast') ? Number(rand(0, 0.85).toFixed(2)) : state.design.params.contrast,
    serif: has('serif') ? Number(rand(0.25, 1).toFixed(2)) : state.design.params.serif,
    bracket: has('bracket') ? Number(rand(0, 1).toFixed(2)) : state.design.params.bracket,
    wobble: has('wobble') ? Number(rand(0.15, 0.85).toFixed(2)) : state.design.params.wobble,
  });
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

buildFamilies();
buildConsole();
readHash();
capture.value = state.text;
syncConsole();
wireTyping();

el('charset-count').textContent = `${CHARSET.length - 1} characters, all of them drawn`;

nameField.addEventListener('input', () => {
  state.name = nameField.value.slice(0, 48);
  writeHash();
});
el('download').addEventListener('click', download);
el('share').addEventListener('click', () => void share());
el('randomise').addEventListener('click', surprise);
el('reset').addEventListener('click', () => pickFamily(state.design.family));

// Canvases are sized in device pixels against a CSS box, so a window resize has to redraw — both
// because the box changed and because a move to a screen of a different pixel density needs twice
// as many pixels in the same box. The theme can change under a running tab too, and the palette is
// read from CSS.
//
// A ResizeObserver was tried here and taken out again. It was added to fix a blank first paint that
// turned out not to exist — the measurement that suggested it was reading a document whose module
// had not run yet — and observing the canvases directly is an infinite loop, because drawing sets
// their height and the observer watches for exactly that. It froze the renderer solid. Nothing that
// speculative belongs in the boot path of a page whose whole job is to draw something immediately.
const repaint = () => {
  palette = paletteOf();
  render();
};
window.addEventListener('resize', repaint);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
document.fonts.ready.then(repaint);

render();
