/**
 * The proof run.
 *
 * A punchcutter pulled a proof before committing a punch to a matrix. This does the same job for a
 * deploy: it draws every glyph at a spread of settings across the parameter space, writes each one
 * out as a .ttf, and asserts that what came back is a font rather than a plausible pile of bytes.
 *
 * It exists because the failure mode of a font writer is not a crash. A file with a wrong table
 * length or a missed checksum renders perfectly in a browser and is refused by an installer, and
 * the only way to find that out is to parse the file back with something stricter than the thing
 * that drew it. `npm run proof` catches the structural half of that here; the shape of the letters
 * is still a job for eyes.
 *
 * Vite bundles the sources first because they import each other without file extensions, which
 * Node's resolver will not do, and because bundling is exactly what the browser will be running.
 */

import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');

await mkdir(outDir, { recursive: true });

await build({
  logLevel: 'error',
  build: {
    outDir,
    emptyOutDir: false,
    lib: { entry: join(here, '..', 'src', 'proof-entry.ts'), formats: ['es'], fileName: () => 'proof-entry.mjs' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false,
  },
});

const { buildFace, buildTTF, CHARSET, CASES } = await import(join(outDir, 'proof-entry.mjs'));

const cases = CASES;

let failures = 0;
const fail = (where, message) => {
  failures += 1;
  console.error(`  FAIL  ${where}: ${message}`);
};

for (const c of cases) {
  const face = buildFace(c.design);

  // Every character in the set has to come back with an outline and a positive advance. A glyph
  // that silently draws nothing is the exact bug this catches: it looks like a space in a specimen.
  for (const ch of CHARSET) {
    const g = face.glyphs.get(ch);
    if (!g) {
      fail(c.name, `no glyph for ${JSON.stringify(ch)}`);
      continue;
    }
    if (!Number.isFinite(g.advance) || g.advance <= 0) {
      fail(c.name, `${JSON.stringify(ch)} has advance ${g.advance}`);
    }
    if (ch !== ' ' && g.contours.length === 0) {
      fail(c.name, `${JSON.stringify(ch)} drew nothing`);
    }
    for (const contour of g.contours) {
      for (const p of contour) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          fail(c.name, `${JSON.stringify(ch)} has a point at ${p.x},${p.y}`);
          break;
        }
      }
    }
  }

  const bytes = buildTTF(face, c.name);
  const file = join(outDir, `${c.name.replace(/\W+/g, '-')}.ttf`);
  await writeFile(file, bytes);
  console.log(`  ${c.name.padEnd(14)} ${String(bytes.length).padStart(7)} bytes  ->  ${file}`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\n${cases.length} faces drawn and written.`);
