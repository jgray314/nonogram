// Prints FNV-1a hashes of pixelColorGrid and cellColorGrid output on fixed
// images, so a refactor of src/color.js can be compared before and after:
// `node scripts/color-probe.mjs > before.txt`, change, then diff. No timings;
// the images are generated here from a seed and from the sample puzzles, so
// two runs print identical text.
import { cellColorGrid, pixelColorGrid } from '../src/color.js';
import { colorSamplePuzzles, samplePuzzles } from '../src/samples.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Flat-color blobs on a background plus seeded noise (and some transparent pixels). */
function blobs(seed, w, h, palette, noise, holes = 0) {
  const rand = rng(seed);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const centers = palette.map(() => [rand() * w, rand() * h]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      let bd = Infinity;
      centers.forEach(([cx, cy], i) => {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) [bd, best] = [d, i];
      });
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) rgba[o + k] = clamp(palette[best][k] + (rand() - 0.5) * noise);
      rgba[o + 3] = rand() < holes ? 0 : 255;
    }
  }
  return { rgba, w, h };
}

function gradient(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = (x * 255) / (w - 1);
      rgba[o + 1] = (y * 255) / (h - 1);
      rgba[o + 2] = 128;
      rgba[o + 3] = 255;
    }
  }
  return { rgba, w, h };
}

function hexRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** A sample puzzle's solution drawn as an image, `scale` pixels per cell, 0 = white. */
function puzzleImage(puzzle, scale) {
  const w = puzzle.width * scale;
  const h = puzzle.height * scale;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = puzzle.solution[Math.floor(y / scale)][Math.floor(x / scale)];
      const rgb = v === 0 ? [255, 255, 255] : hexRgb(puzzle.palette[v - 1].hex);
      rgba.set([...rgb, 255], (y * w + x) * 4);
    }
  }
  return { rgba, w, h };
}

const cases = [
  [
    'blobs3-clean',
    blobs(
      1,
      60,
      48,
      [
        [220, 40, 40],
        [40, 160, 60],
        [240, 240, 230],
      ],
      0,
    ),
  ],
  [
    'blobs4-noisy',
    blobs(
      2,
      90,
      90,
      [
        [10, 10, 10],
        [250, 250, 250],
        [200, 30, 30],
        [30, 30, 200],
      ],
      40,
    ),
  ],
  [
    'blobs5-holes',
    blobs(
      3,
      75,
      50,
      [
        [255, 255, 0],
        [0, 0, 0],
        [128, 128, 128],
        [255, 128, 0],
        [0, 128, 255],
      ],
      24,
      0.1,
    ),
  ],
  [
    'two-tone',
    blobs(
      4,
      40,
      40,
      [
        [0, 0, 0],
        [255, 255, 255],
      ],
      10,
    ),
  ],
  [
    'tiny',
    blobs(
      5,
      7,
      5,
      [
        [200, 0, 0],
        [0, 0, 200],
        [255, 255, 255],
      ],
      0,
    ),
  ],
  ['gradient', gradient(64, 64)],
];
for (const p of await samplePuzzles()) cases.push([`sample ${p.title}`, puzzleImage(p, 6)]);
for (const p of await colorSamplePuzzles())
  cases.push([`color-sample ${p.title}`, puzzleImage(p, 6)]);

const sizes = [
  [10, 10],
  [15, 15],
  [20, 12],
];

const lines = [];
for (const [name, { rgba, w, h }] of cases) {
  // Full image, and an offset crop (exercises the crop origin).
  const crops = [
    ['full', { x: 0, y: 0, w, h }],
    [
      'crop',
      {
        x: Math.floor(w / 8),
        y: Math.floor(h / 8),
        w: Math.floor((w * 3) / 4),
        h: Math.floor((h * 3) / 4),
      },
    ],
  ];
  for (const [cropName, crop] of crops) {
    for (const [cols, rows] of sizes) {
      for (const k of [3, 4, 5]) {
        const pix = fnv(JSON.stringify(pixelColorGrid(rgba, w, crop, cols, rows, k)));
        const cell = fnv(JSON.stringify(cellColorGrid(rgba, w, crop, cols, rows, k)));
        lines.push(`${name} ${cropName} ${cols}x${rows} k=${k} pixel=${pix} cell=${cell}`);
      }
    }
  }
}
console.log(lines.join('\n'));
// One digest over everything above, for a single-line comparison.
console.log(`total ${lines.length} cases digest=${fnv(lines.join('\n'))}`);
