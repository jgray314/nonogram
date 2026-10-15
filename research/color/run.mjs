// Color layering experiment. Usage:
//   node research/color/run.mjs [imageDir] [--detail] [--sizes=10,15,20] [--no-synthetic] [--preview]
// Default image dir is sample-images/. PNG only (8-bit, non-interlaced).
// Own images: put PNGs in research/color/photos/ (gitignored); they are picked
// up automatically as the "photos" group. An explicit imageDir is the "user" group.
// Imports the real clue and solver code from src/; everything else is local.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { puzzleClues } from '../../src/clues.js';
import { solve } from '../../src/solver.js';
import { cellLuminance, otsu, binarize } from '../../src/image.js';
import { decodePng, encodePng } from './png.mjs';
import {
  BLACK,
  WHITE,
  centerCrop,
  cellColors,
  ditherFS,
  deltaE,
  kmeans,
  luma,
  rgbToLab,
  syntheticImages,
} from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET = 300; // search nodes per puzzle; same for every approach
const SEED = 1;
const KS = [2, 3, 4];
const VARIANTS = ['w', 'a', 'b'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const sizes = (args.find((a) => a.startsWith('--sizes=')) ?? '--sizes=10,15,20')
  .slice(8)
  .split(',')
  .map(Number);
const userDir = args.find((a) => !a.startsWith('--'));
const detail = flag('--detail');
const preview = flag('--preview'); // contact sheets into research/color/out/
const started = Date.now();

// ---- load images --------------------------------------------------------

const images = []; // {name, group, width, height, rgba}
function loadDir(dir, group) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).sort()) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    try {
      const img = decodePng(readFileSync(join(dir, file)));
      images.push({ name: file.replace(/\.png$/i, ''), group, ...img });
    } catch (e) {
      console.log(`skipped ${file}: ${e.message}`);
    }
  }
}
loadDir(userDir ?? join(ROOT, 'sample-images'), userDir ? 'user' : 'samples');
loadDir(join(ROOT, 'research', 'color', 'photos'), 'photos');
if (!flag('--no-synthetic')) {
  for (const [name, img] of Object.entries(syntheticImages())) {
    images.push({ name, group: 'synthetic', ...img });
  }
}

// ---- approaches ---------------------------------------------------------
// Each builder returns {layers, shown}. layers: array of grids; a single color
// puzzle is one grid with values 0..k, a layer stack is several 0/1 grids.
// shown: per-cell [r, g, b] the finished puzzle shows (white = blank).

const flat = (grid) => grid.flat();
const shownFrom = (grid, palette) =>
  grid.map((row) => row.map((v) => (v === 0 ? WHITE : palette[v])));

/** Quantize cells to a palette. variant: w = white blank only; a = plus black as an ink; b = white and black both blank. */
function quantize(cells, variant, k) {
  const pts = flat(cells).map(rgbToLab);
  const anchors = variant === 'w' ? [WHITE] : [WHITE, BLACK];
  const { assign } = kmeans(pts, anchors.map(rgbToLab), k, SEED);
  const A = anchors.length;
  // Colors that exist in the finished puzzle, in index order.
  const colorOf = (j) => {
    if (variant === 'b') return j < 2 ? 0 : j - 1;
    return j === 0 ? 0 : j;
  };
  const nColors = variant === 'a' ? k + 1 : k;
  const palette = [null];
  const rgb = flat(cells);
  for (let c = 1; c <= nColors; c++) {
    const j = variant === 'b' ? c + 1 : c;
    const members = rgb.filter((_, i) => assign[i] === j);
    if (j < A) palette.push(anchors[j]);
    else if (members.length)
      palette.push(
        members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length),
      );
    else palette.push([128, 128, 128]);
  }
  const n = cells[0].length;
  const grid = cells.map((row, r) => row.map((_, c) => colorOf(assign[r * n + c])));
  return { grid, palette };
}

const splitLayers = (grid, nColors) =>
  Array.from({ length: nColors }, (_, i) =>
    grid.map((row) => row.map((v) => (v === i + 1 ? 1 : 0))),
  ).filter((l) => l.some((row) => row.includes(1)));

function buildApproaches(img, n) {
  const crop = centerCrop(img.width, img.height);
  const cells = cellColors(img.rgba, img.width, crop, n, n);
  const lum = cellLuminance(img.rgba, img.width, img.height, crop, n, n);
  const out = {};

  const mono = binarize(lum, otsu(lum.flat()));
  out['A mono'] = { layers: [mono], shown: shownFrom(mono, [null, BLACK]) };

  const dith = ditherFS(lum);
  out['F dither'] = { layers: [dith], shown: shownFrom(dith, [null, BLACK]) };

  for (const variant of VARIANTS) {
    for (const k of KS) {
      const { grid, palette } = quantize(cells, variant, k);
      out[`B1 k${k}${variant}`] = { layers: [grid], shown: shownFrom(grid, palette) };
      out[`D k${k}${variant}`] = {
        layers: splitLayers(grid, palette.length - 1),
        shown: shownFrom(grid, palette),
      };
    }
  }

  // C: threshold each channel; an inked cell removes that channel (white paper).
  const thr = [0, 1, 2].map((ch) => otsu(flat(cells).map((p) => p[ch])));
  const cl = [0, 1, 2].map((ch) => cells.map((row) => row.map((p) => (p[ch] < thr[ch] ? 1 : 0))));
  out['C rgb3'] = {
    layers: cl,
    shown: cells.map((row, r) => row.map((_, c) => cl.map((l) => (l[r][c] ? 0 : 255)))),
  };

  // E: gray shades as one color puzzle (white blank + k grays).
  for (const k of [2, 3]) {
    const { assign, centroids } = kmeans(
      flat(cells).map((p) => [luma(p)]),
      [[255]],
      k,
      SEED,
    );
    const grid = cells.map((row, r) => row.map((_, c) => assign[r * n + c]));
    const palette = centroids.map(([g]) => [g, g, g]);
    out[`E gray${k + 1}`] = { layers: [grid], shown: shownFrom(grid, palette) };
  }
  return { out, cells };
}

// ---- metrics ------------------------------------------------------------

function layerStats(grid) {
  const { rows, cols } = puzzleClues(grid);
  const lines = [...rows, ...cols];
  const res = solve({ width: grid[0].length, height: grid.length, rows, cols }, { budget: BUDGET });
  // Sanity check: a line-solvable result must reproduce the source grid.
  if (res.status === 'unique-line-solvable' && JSON.stringify(res.grid) !== JSON.stringify(grid)) {
    throw new Error('solver disagrees with the source grid');
  }
  return {
    status: res.status,
    sweeps: res.sweeps,
    clues: lines.reduce((s, l) => s + l.length, 0),
    maxLine: Math.max(...lines.map((l) => l.length)),
  };
}

function evaluate(build, cells) {
  const layers = build.layers.map(layerStats);
  const fairLayers = layers.filter((l) => l.status.startsWith('unique')).length;
  const lab = (p) => rgbToLab(p);
  let sum = 0;
  cells.forEach((row, r) =>
    row.forEach((p, c) => {
      sum += deltaE(lab(p), lab(build.shown[r][c]));
    }),
  );
  return {
    layers,
    allFair: layers.every((l) => l.status.startsWith('unique')),
    allLine: layers.every((l) => l.status === 'unique-line-solvable'),
    layerFair: layers.length ? fairLayers / layers.length : 1,
    clues: layers.reduce((s, l) => s + l.clues, 0),
    maxLine: Math.max(0, ...layers.map((l) => l.maxLine)),
    sweeps: layers.reduce((s, l) => s + l.sweeps, 0),
    dE: sum / (cells.length * cells[0].length),
  };
}

// results[group][approach][n] = [per-image metrics]
const SHEET = ['A mono', 'F dither', 'E gray4', 'B1 k3w', 'B1 k4a', 'C rgb3'];
/** Source and several finished puzzles side by side, one PNG per image. */
function writeSheet(name, n, cells, out) {
  const px = 10;
  const gap = 12;
  const panels = [cells, ...SHEET.map((k) => out[k].shown)];
  const W = panels.length * (n * px + gap) + gap;
  const H = n * px + 2 * gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  panels.forEach((grid, p) => {
    grid.forEach((row, r) =>
      row.forEach((color, c) => {
        for (let y = 0; y < px; y++) {
          for (let x = 0; x < px; x++) {
            const o = ((gap + r * px + y) * W + gap + p * (n * px + gap) + c * px + x) * 3;
            rgb[o] = color[0];
            rgb[o + 1] = color[1];
            rgb[o + 2] = color[2];
          }
        }
      }),
    );
  });
  const dir = join(ROOT, 'research', 'color', 'out');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}-${n}.png`), encodePng(W, H, rgb));
}

const results = {};
for (const img of images) {
  for (const n of sizes) {
    const { out, cells } = buildApproaches(img, n);
    for (const [approach, build] of Object.entries(out)) {
      const m = evaluate(build, cells);
      (((results[img.group] ??= {})[approach] ??= {})[n] ??= []).push({ image: img.name, ...m });
    }
    if (preview && n === sizes[sizes.length - 1]) writeSheet(img.name, n, cells, out);
  }
}

// ---- output -------------------------------------------------------------

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs, key) => `${Math.round(100 * mean(xs.map((x) => (x[key] ? 1 : 0))))}`;
const fix = (v, d = 1) => v.toFixed(d);

console.log(`# Color layering experiment`);
console.log(
  `images: ${images.length} (${Object.entries(Object.groupBy(images, (i) => i.group))
    .map(([g, l]) => `${g} ${l.length}`)
    .join(
      ', ',
    )}); grid sizes ${sizes.join(', ')}; solver budget ${BUDGET} nodes; k-means seed ${SEED}`,
);
console.log(`
Approach keys. A mono: luminance + Otsu (current). F dither: Floyd-Steinberg on cell luminance.
B1 kNx: one color puzzle, white blank + N colors. D kNx: same palette, one 0/1 layer per color.
C rgb3: Otsu threshold per R, G, B channel, 3 layers, an inked cell removes that channel.
E grayN: white blank + (N-1) gray shades, one color puzzle.
Suffix x: w = white is the only anchor (black is just a candidate color); a = black is an extra
always-present ink outside the N chosen colors (N+1 inks); b = white and black are both blank in
every layer (N inks; black cells are lost and show as white).
fair = unique solution (line-solvable or needs guessing). line = unique and line-solvable.
For layer stacks, fair/line mean every layer passes. layers = non-empty layers (mean over images).
dE = mean CIE76 delta E between each cell's source color and the color the finished puzzle shows.
`);

const approachOrder = [
  'A mono',
  'F dither',
  ...VARIANTS.flatMap((v) => KS.map((k) => `B1 k${k}${v}`)),
  'C rgb3',
  ...VARIANTS.flatMap((v) => KS.map((k) => `D k${k}${v}`)),
  'E gray3',
  'E gray4',
];

const mid = sizes.includes(15) ? 15 : sizes[Math.floor(sizes.length / 2)];
for (const [group, byApproach] of Object.entries(results)) {
  const nImg = Object.values(byApproach)[0][sizes[0]].length;
  console.log(`\n## Group: ${group} (${nImg} images)\n`);
  const head = [
    'approach',
    'layers',
    ...sizes.map((n) => `fair% ${n}`),
    ...sizes.map((n) => `line% ${n}`),
    ...sizes.map((n) => `layerfair% ${n}`),
    ...sizes.map((n) => `dE ${n}`),
    `clues ${mid}`,
    `max/line ${mid}`,
    `sweeps ${mid}`,
  ];
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`);
  for (const approach of approachOrder) {
    const per = byApproach[approach];
    const layers = mean(sizes.flatMap((n) => per[n].map((x) => x.layers.length)));
    const row = [
      approach,
      fix(layers),
      ...sizes.map((n) => pct(per[n], 'allFair')),
      ...sizes.map((n) => pct(per[n], 'allLine')),
      ...sizes.map((n) => `${Math.round(100 * mean(per[n].map((x) => x.layerFair)))}`),
      ...sizes.map((n) => fix(mean(per[n].map((x) => x.dE)))),
      fix(mean(per[mid].map((x) => x.clues)), 0),
      fix(mean(per[mid].map((x) => x.maxLine))),
      fix(mean(per[mid].map((x) => x.sweeps))),
    ];
    console.log(`| ${row.join(' | ')} |`);
  }
}

console.log(
  '\n## Layer status counts over all images and grid sizes (L line-solvable, G needs guessing, M multiple, ? unknown, X none)',
);
for (const [group, byApproach] of Object.entries(results)) {
  console.log(`\n### ${group}\n`);
  console.log('| approach | layers | L | G | M | ? | X |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const approach of approachOrder) {
    const layers = sizes.flatMap((n) => byApproach[approach][n].flatMap((x) => x.layers));
    const count = (st) => layers.filter((l) => l.status === st).length;
    const row = [
      approach,
      layers.length,
      ...['unique-line-solvable', 'unique-needs-guessing', 'multiple', 'unknown', 'none'].map(
        count,
      ),
    ];
    console.log(`| ${row.join(' | ')} |`);
  }
}

if (detail) {
  const short = {
    'unique-line-solvable': 'L',
    'unique-needs-guessing': 'G',
    multiple: 'M',
    unknown: '?',
    none: 'X',
  };
  console.log(
    `\n## Detail at grid size ${mid} (status per layer: L line-solvable, G needs guessing, M multiple, ? unknown, X none)\n`,
  );
  console.log('| group | image | approach | statuses | clues | max/line | dE |');
  console.log('|---|---|---|---|---:|---:|---:|');
  for (const [group, byApproach] of Object.entries(results)) {
    for (const approach of approachOrder) {
      for (const m of byApproach[approach][mid]) {
        const st = m.layers.map((l) => short[l.status]).join(' ');
        console.log(
          `| ${group} | ${m.image} | ${approach} | ${st} | ${m.clues} | ${m.maxLine} | ${fix(m.dE)} |`,
        );
      }
    }
  }
}

console.log(`\nelapsed ${((Date.now() - started) / 1000).toFixed(1)} s`);
