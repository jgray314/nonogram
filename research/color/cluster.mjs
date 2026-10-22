// Color clustering comparison (D28). Usage, from the repo root:
//   node research/color/cluster.mjs [--sizes=10,15,20] [--detail] [--preview]
// Compares the shipped D25 quantizer (cell averages, k-means++) with palette-
// from-pixels variants of src/color.js pixelColorGrid. Images: the samples,
// the synthetic set, the photo-like set, and any PNGs in research/color/photos/.
// --preview writes one sheet per image to research/color/out/cluster-*.png:
// source, then each approach at k=4.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { puzzleClues } from '../../src/clues.js';
import { solve } from '../../src/solver.js';
import { cellColorGrid, pixelColorGrid, rgbToLab, deltaE } from '../../src/color.js';
import { cellRange } from '../../src/image.js';
import { decodePng, encodePng } from './png.mjs';
import { centerCrop, syntheticImages, photoLikeImages } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET = 300;
const KS = [3, 4, 5];
const args = process.argv.slice(2);
const sizes = (args.find((a) => a.startsWith('--sizes=')) ?? '--sizes=10,15,20')
  .slice(8)
  .split(',')
  .map(Number);
const detail = args.includes('--detail');
const preview = args.includes('--preview');
const started = Date.now();

const APPROACHES = {
  'now (cell mean, k-means++)': (img, crop, n, k) =>
    cellColorGrid(img.rgba, img.width, crop, n, n, k),
  'pixels, far seeds, cell mean': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k, { cell: 'mean' }),
  'pixels, heavy seeds, cell vote': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k, { seed: 'heavy' }),
  'pixels, far seeds, cell vote': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k),
  'pixels, far seeds, cell vote, sat 1.1': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k, { saturate: 1.1 }),
  'pixels, far vivid seeds, cell vote': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k, { vivid: 1 }),
  'pixels, far vivid x3 seeds, cell vote': (img, crop, n, k) =>
    pixelColorGrid(img.rgba, img.width, crop, n, n, k, { vivid: 3 }),
};

// ---- images ---------------------------------------------------------------

const images = [];
function loadDir(dir, group) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).sort()) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const { warnings, ...img } = decodePng(readFileSync(join(dir, file)));
    for (const w of warnings) console.log(`warning ${file}: ${w}`);
    images.push({ name: file.replace(/\.png$/i, ''), group, ...img });
  }
}
loadDir(join(ROOT, 'sample-images'), 'samples');
for (const [name, img] of Object.entries(syntheticImages()))
  images.push({ name, group: 'synthetic', ...img });
for (const [name, img] of Object.entries(photoLikeImages()))
  images.push({ name, group: 'photo-like', ...img });
loadDir(join(ROOT, 'research', 'color', 'photos'), 'photos');

// ---- metrics --------------------------------------------------------------

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const colorsOf = (q) => [q.blank, ...q.palette.map((p) => p.hex)];
const inked = (q) => q.grid.some((row) => row.some((v) => v !== 0));

/** Mean delta E between every (sampled) source pixel and the color its cell shows. */
function pixelDeltaE(img, crop, n, q) {
  const shown = colorsOf(q).map((h) => rgbToLab(hexRgb(h)));
  const cache = new Map();
  let sum = 0;
  let count = 0;
  for (let r = 0; r < n; r++) {
    const [y0, y1] = cellRange(r, n, crop.h);
    for (let c = 0; c < n; c++) {
      const [x0, x1] = cellRange(c, n, crop.w);
      const target = shown[q.grid[r][c]];
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const o = ((crop.y + y) * img.width + crop.x + x) * 4;
          const a = img.rgba[o + 3] / 255;
          const p = [0, 1, 2].map((k) => img.rgba[o + k] * a + 255 * (1 - a));
          const key = p.map(Math.round).join();
          let lab = cache.get(key);
          if (!lab) cache.set(key, (lab = rgbToLab(p)));
          sum += deltaE(lab, target);
          count += 1;
        }
      }
    }
  }
  return sum / count;
}

/** Share of cells with no edge neighbour of the same value: isolated specks. */
function speckle(grid) {
  const h = grid.length;
  const w = grid[0].length;
  let alone = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = grid[r][c];
      const same = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].some(([y, x]) => grid[y]?.[x] === v);
      if (!same) alone += 1;
    }
  }
  return alone / (w * h);
}

/** Symmetric mean distance between two palettes (blank included). */
function paletteShift(a, b) {
  const la = colorsOf(a).map((h) => rgbToLab(hexRgb(h)));
  const lb = colorsOf(b).map((h) => rgbToLab(hexRgb(h)));
  const one = (xs, ys) =>
    xs.reduce((s, x) => s + Math.min(...ys.map((y) => deltaE(x, y))), 0) / xs.length;
  return (one(la, lb) + one(lb, la)) / 2;
}

function minPalette(q) {
  const labs = colorsOf(q).map((h) => rgbToLab(hexRgb(h)));
  let m = Infinity;
  for (let i = 0; i < labs.length; i++)
    for (let j = i + 1; j < labs.length; j++) m = Math.min(m, deltaE(labs[i], labs[j]));
  return m;
}

function measure(img, n, k, build) {
  const crop = centerCrop(img.width, img.height);
  const q = build(img, crop, n, k);
  const { rows, cols } = puzzleClues(q.grid);
  const lines = [...rows, ...cols];
  const res = inked(q)
    ? solve({ width: n, height: n, rows, cols }, { budget: BUDGET })
    : { status: 'empty' };
  // Stability: the same picture with the crop moved 3% right and down.
  const s = Math.max(1, Math.round(crop.w * 0.03));
  const moved = build(img, { x: crop.x + s, y: crop.y + s, w: crop.w - s, h: crop.h - s }, n, k);
  return {
    empty: !inked(q),
    fair: res.status.startsWith('unique'),
    line: res.status === 'unique-line-solvable',
    colors: colorsOf(q).length,
    pdE: pixelDeltaE(img, crop, n, q),
    speckle: speckle(q.grid),
    shift: paletteShift(q, moved),
    minPal: q.palette.length && inked(q) ? minPalette(q) : null,
    clues: lines.reduce((t, l) => t + l.length, 0),
    maxLine: Math.max(...lines.map((l) => l.length)),
    q,
  };
}

// ---- run ------------------------------------------------------------------

const results = []; // {group, image, approach, n, k, ...metrics}
for (const img of images) {
  const sheet = [];
  for (const n of sizes) {
    for (const k of KS) {
      for (const [approach, build] of Object.entries(APPROACHES)) {
        const m = measure(img, n, k, build);
        results.push({ group: img.group, image: img.name, approach, n, k, ...m });
        if (preview && k === 4 && n === sizes[sizes.length - 1]) sheet.push(m.q);
      }
    }
  }
  if (preview) writeSheet(img, sizes[sizes.length - 1], sheet);
}

function writeSheet(img, n, qs) {
  const crop = centerCrop(img.width, img.height);
  const px = 10;
  const gap = 12;
  const src = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (__, c) => {
      const [y0, y1] = cellRange(r, n, crop.h);
      const [x0, x1] = cellRange(c, n, crop.w);
      const o =
        ((crop.y + Math.floor((y0 + y1) / 2)) * img.width + crop.x + Math.floor((x0 + x1) / 2)) * 4;
      return [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
    }),
  );
  const panels = [
    src,
    ...qs.map((q) => q.grid.map((row) => row.map((v) => hexRgb(colorsOf(q)[v])))),
  ];
  const W = panels.length * (n * px + gap) + gap;
  const H = n * px + 2 * gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  panels.forEach((grid, p) =>
    grid.forEach((row, r) =>
      row.forEach((color, c) => {
        for (let y = 0; y < px; y++) {
          for (let x = 0; x < px; x++) {
            const o = ((gap + r * px + y) * W + gap + p * (n * px + gap) + c * px + x) * 3;
            rgb.set(color, o);
          }
        }
      }),
    ),
  );
  const dir = join(ROOT, 'research', 'color', 'out');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `cluster-${img.group}-${img.name}-${n}.png`.replace(/[^\w.-]+/g, '_')),
    encodePng(W, H, rgb),
  );
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (xs, key) => {
  const live = xs.filter((x) => !x.empty);
  return `${live.filter((x) => x[key]).length}/${live.length}`;
};
const fix = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');

console.log('# Color clustering comparison (D28)');
console.log(
  `images: ${images.length}; sizes ${sizes.join(', ')}; k ${KS.join(', ')}; solver budget ${BUDGET}. ` +
    'Each row pools every image in the group, every size and every k. fair/line count non-empty puzzles. ' +
    "pdE = mean delta E, source pixel to its cell's shown color (blank shown in its own color). " +
    'speckle = share of cells with no same-color neighbour. shift = palette change when the crop moves 3%. ' +
    'minpal = closest pair of colors, blank included.',
);
for (const group of [...new Set(results.map((r) => r.group))]) {
  const nImg = new Set(results.filter((r) => r.group === group).map((r) => r.image)).size;
  console.log(`\n## ${group} (${nImg} images)\n`);
  console.log(
    '| approach | fair | line | empty | colors | pdE | speckle % | shift | minpal | clues | max/line |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const approach of Object.keys(APPROACHES)) {
    const xs = results.filter((r) => r.group === group && r.approach === approach);
    const live = xs.filter((x) => !x.empty);
    console.log(
      `| ${approach} | ${pct(xs, 'fair')} | ${pct(xs, 'line')} | ${xs.length - live.length} | ${fix(mean(live.map((x) => x.colors)))} | ${fix(mean(xs.map((x) => x.pdE)))} | ${fix(100 * mean(live.map((x) => x.speckle)))} | ${fix(mean(xs.map((x) => x.shift)))} | ${fix(Math.min(...live.map((x) => x.minPal ?? Infinity)))} | ${fix(mean(live.map((x) => x.clues)), 0)} | ${fix(mean(live.map((x) => x.maxLine)))} |`,
    );
  }
}
if (detail) {
  console.log('\n## Detail\n');
  console.log(
    '| group | image | n | k | approach | fair | colors | pdE | speckle % | shift | minpal |',
  );
  console.log('|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|');
  for (const r of results) {
    console.log(
      `| ${r.group} | ${r.image} | ${r.n} | ${r.k} | ${r.approach} | ${r.empty ? 'empty' : r.line ? 'L' : r.fair ? 'G' : 'no'} | ${r.colors} | ${fix(r.pdE)} | ${fix(100 * r.speckle)} | ${fix(r.shift)} | ${fix(r.minPal ?? NaN)} |`,
    );
  }
}
console.log(`\nelapsed ${((Date.now() - started) / 1000).toFixed(1)} s`);
