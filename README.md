# Punchcutter

**[punchcutter.plausible.ventures](https://punchcutter.plausible.ventures)** — draw a typeface, and
take the font file with you.

Pick a family, move the sliders, press **Download .ttf**, and you get a real installable TrueType
file assembled in the tab. 171 characters — enough for English, French, German, Spanish, Portuguese,
Italian and the Nordic languages. No account, no upload, no server. A typeface you do not want
anybody to see never leaves the machine it was drawn on.

It is also meant to teach. Each family says what it actually is and where it came from, the sliders
explain what they do to the letters, and an anatomy diagram names the parts of a letter — drawn in
whatever face you have just made, so pulling the ascender down moves the label marked *ascender*.

## The four families

| | |
| --- | --- |
| **Sans** | No serifs. Geometric — circles and straight lines, the way the Bauhaus built them. |
| **Serif** | Bars on the stroke ends, and contrast between thick uprights and thin horizontals. |
| **Mono** | Every character on one advance, with the wide letters squeezed and the narrow ones grown to fit. |
| **Hand** | Knocked off the ruled line by a wobble seeded from each letter, so the irregularity repeats. |

## Letterforms

Sliders change a letter's proportions. They cannot turn a single-storey `a` into a two-storey one,
and until something can, every face a parametric tool produces reads as a variation on whichever
construction was drawn first. So the letters that real typefaces disagree about are switchable:

`a` two-storey · `g` two-storey · angled entry strokes · `e` angled bar · `r` straight arm ·
`y` curved tail · `M` splayed · `W` crossed · `l` tailed · `i`/`j` footed · `0` slashed or dotted ·
`1` footed

Most of these *replace* a letter. Entry strokes *add* to whatever is already there, which is why
they compose with a two-storey `a` without either knowing about the other.

**Styles** set these together with the numbers — a mono in *Humanist* is a two-storey `a`, a tailed
`l`, a slashed zero and a straight-armed `r`, which is a different design from the same family in
*Geometric*, not a different weight of it.

## The axes

| Axis | What it does | Families |
| --- | --- | --- |
| Weight | Thickness of the pen. With contrast up, the average of thick and thin. | all |
| Width | How far the letters stretch sideways. Stroke thickness holds. | all |
| Roundness | Squares off the bowls at 0, closes them into circles at 100. | all |
| x-height | Size of the lowercase against the caps. | all |
| Ascender | How far b, d, h and l reach past the cap line. | all |
| Descender | How far g, p, q and y hang below the baseline. | all |
| Terminal | Flat cut at 0, half-round at 100. | sans, mono, hand |
| Serif | Length of the bar across a stroke end. 0 is a sans again. | serif, mono |
| Bracket | The curve where a serif meets its stem. Square is a slab. | serif |
| Contrast | Thickens the uprights, thins the horizontals. | serif |
| Modulation | How much a stroke thins where it runs into another. 0 is a true monoline. | all |
| Terminal angle | Slants the cut across each stroke end, the way a pen held at an angle leaves it. | sans, serif, mono |
| Ball terminals | Puts a blob on the end of every curved stroke — the a, c, f, r. | serif |
| Wobble | How far the hand strays off the line. | hand |
| Slant | A true oblique — the drawing is sheared, not redrawn. | all |
| Tracking | Air on both sides, on top of a sidebearing that already scales with the weight. | all |

A design encodes to 36 characters, which is what the shared link carries — the family, every axis
including the ones the current family hides, and which letterforms are switched on.

## How it works

Letters are described the way a designer thinks about them rather than the way a font file stores
them: as the path a pen walks. Each glyph is a run of straight lines and circular arcs, and the
solid shape is recovered by stroking that skeleton.

Offsets are **computed, not derived**. A segment is sampled, each sample pushed out along its own
normal by half of whatever the width is *there*, and consecutive samples joined by the quadratic
through both and through the offset of the midpoint between them. A straight run at constant width
still comes out as an exact rectangle from a single step, so nothing cheap became expensive.

This replaced an earlier engine that only allowed lines and circular arcs, because those are the two
curves whose offset is exact. That constraint made every join trivial and it was also the ceiling on
the whole tool: it forced every bowl to be a rounded rectangle and every stroke to be one width from
end to end. Put a real typeface beside the output and the letters read as drawn with a marker.
Sampling the offset instead buys three things at once:

- **Elliptical bowls.** The ring's corners are quarter ellipses, so at full roundness a `D` is a half
  ellipse rather than a stadium — the difference between a bowl and a running track.
- **Modulation.** A stroke can thin where it runs into another. Every real face does this at the
  shoulder of an `n`; a constant-width pen cannot, and its absence is the most reliable tell that a
  typeface was generated. It needs no per-letter annotation, because the tool already works out
  which stroke ends are buried in order to place serifs — a buried end is exactly an end that wants
  thinning.
- **Variable width in general**, which is what any future taper, flare or entry stroke will need.

Each segment is still emitted as its own closed contour and unioned by the non-zero winding rule.
That is what keeps the whole thing robust: no stitching, no join cases, and a self-intersection in
one segment cannot corrupt its neighbours.

The four families come out of that same skeleton:

- **Terminals** are decided by what kind of segment they end. A stem end takes a serif; a curve end
  takes a ball. In a serif face the two never swap, so choosing by segment kind gets the `a`, the
  `c`, the `f` and the `r` right at the same time as the `H`, the `E` and the `T` — without naming
  any of them. A plain end may instead be cut on a slant, which is what a broad nib leaves behind.
- **Serifs** are drawn at any free stroke end that stands in open air. Which ends those are is
  measured, not annotated: each free end is checked against every other run of skeleton in the
  glyph, and one that already sits inside other ink is left alone. That single test puts serifs on
  the tips of an E's arms but not where those arms vanish into the stem, and none at all on an O.
  They are then snapped to the nearest axis, because a Latin serif is horizontal or vertical and
  never square to the diagonal it finishes.
- **Contrast** is a change of coordinates. The glyph is built and stroked horizontally squashed,
  where the pen is still round and every offset is still exact, and stretched back out afterwards —
  which turns that round pen into an elliptical one. Uprights thicken, horizontals do not, bowls
  become ellipses. The pen is narrowed by the square root of the stretch so that contrast trades
  thick against thin instead of acting as a second weight slider.
- **Monospace** decides the advance first and fits the letter to it, giving every letter with a
  counter the same width and centring the ones without. Fitting a slot is not only squeezing: the
  `m` comes in, but the `o`, the `e` and the `r` all have to go out, or every letter but a handful
  floats in a puddle of white space.
- **Hand** displaces the outline by a smooth field seeded from the character. The displacement is a
  function of *position*, never of contour index — glyphs here are welded together by overlap
  alone, and a wobble keyed to index tears them apart along seams that were invisible a moment
  earlier.

**Kerning is measured, not typed.** A face with none announces itself in four words: `AV` opens a
hole, `To` strands the o under the arm of the T. Foundries close those by hand over months, which is
not available here — the letters do not exist until somebody moves a slider, and a table tuned at
one weight is wrong at every other. So each glyph is reduced to a pair of silhouettes (how far right
its ink reaches in each horizontal band, and how far left), and a pair is kerned by finding the
closest approach between them and comparing it against what the two letters' own sidebearings
already promise. It ships as a real OpenType `GPOS` table and is applied to the on-screen specimen
too, so what you look at is spaced the way the file will be.

Two things that had to be got right there. The correction is applied at half of what the geometry
suggests — closing every gap completely makes a line lumpy, because the eye wants a rhythm rather
than a constant area of white. And the pairs are stored **by class**: listing them individually
produced twelve thousand kerned pairs, and the offsets inside an OpenType pair table are sixteen
bits, so past 64KB they wrap and the font stops parsing. One class per base letter bounds the table,
hands every accented form its base letter's kerning for free, and folds further by merging letters
whose rows are identical — an `H`, an `I` and an `N` present the same flank to whatever follows.

Widths are stated as **counter** widths, with the stems added afterwards at the width they will
*finish* at. That is what lets the face get heavy without strangling itself: at a stroke of 170
units, sizing the whole letter instead leaves an 'o' with a counter thirteen units wide.

The `.ttf` is written by hand — ten tables, `cmap` format 4, quadratic `glyf` outlines on an integer
grid, and a checksum over the whole file patched back into `head`. Doing it without a library is not
stubbornness: every library that builds a font from paths wants cubics or its own path object, and
this face is already quadratics on an integer grid because that is what `glyf` stores.

## Working on it

```
npm install
npm run dev      # the tool, at localhost:5192
npm run proof    # draw every glyph across 54 faces, write the .ttf files, assert they parse
npm run build    # typecheck, bundle
```

`npm run dev` also serves `/proof.html`: a contact sheet of every glyph at every preset and at the
corners of the parameter space, plus each face installed as a live `FontFace` so you can see the
exported file rather than the drawing of it. It is the fastest way to find a letter that has broken
at some setting, and looking at it is not optional — the failure mode of generated type is a glyph
that draws successfully and reads as the wrong letter.

`npm run proof` draws 54 faces — every family, every style, all thirteen alternates at once, and
the corners of the parameter space — and writes them to `tools/out/`. To check the output against something stricter than a browser:

```
pip install fonttools
python -c "from fontTools.ttLib import TTFont; TTFont('tools/out/default.ttf', checkChecksums=2).ensureDecompiled()"
```

## Known gaps

- No kerning and no hinting. A generated monoline face has fairly even sidebearings, so the first
  matters less than it would elsewhere; the second does not matter on any screen made this century.
- Overlapping contours. Every rasteriser in use fills them correctly under the non-zero rule, but
  they would need merging before the outlines could be interpolated or offset by other software.
- Latin only. Greek and Cyrillic would mostly fall out of the same primitives; nothing has been
  drawn for them.
- The serif families are *rational* serifs — Century-ish. A revival of an old-style face (Garamond,
  Caslon) is a thousand individual optical decisions rather than a rule set, and is not reachable
  from here.
- **It still cannot reproduce a named typeface.** `compare.html` puts Roboto, IBM Plex Sans and
  Mono, Newsreader, Source Sans and Serif, Recursive, Montserrat, Avenir, Georgia, Palatino and
  Monaco on the line above the closest thing this tool reaches. Avenir, Montserrat and Monaco land
  in the neighbourhood; the rest are recognisably the same *genre* and not the same face.

  The engine's founding constraint — exact offsets, hence lines and circular arcs only — has been
  removed, and with it went the rounded-rectangle bowls and the unvarying stroke. What is left is a
  Ball terminals, angled terminal cuts, angled entry strokes and a two-storey `g` have since been
  built, and the serif families now read as text serifs rather than a sans wearing serifs. What
  remains is one item: widths and sidebearings come from one number per letter rather than being
  tuned by eye, which is the part of type design that is judgement rather than rule, and the part a
  parametric tool is least able to replace.

- The hand family is unconnected. A joined script needs entry and exit strokes at a fixed height on
  every letter; nothing has been drawn for that.

## Licence

The tool is one of the [Plausible Ventures](https://plausible.ventures). Anything you draw with it
is yours, with no conditions attached.
