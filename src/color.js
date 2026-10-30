// Image to color puzzle: the entry point (colorGrid) and the pixel-palette path
// (D28). Pure, no DOM. The palette comes from the crop's pixels, clustered in
// CIELAB with seeded k-means; clusters closer than MERGE_DE are merged. The
// cluster that covers the most cells is the blank; every other cluster is an
// ink, ordered by how many cells it covers. Research and numbers:
// docs/color-research.md.
//
// The module is split three ways: color-space.js (conversions and shared
// helpers, a leaf), color-cells.js (the older D25 cell-averaging path) and this
// file. The names the other two own are re-exported here BY NAME, not with
// `export *`, because color-space.js exports helpers (SEED, mulberry32, ...)
// that callers of this path never saw.
import { cellRange } from './image.js';
import { ITERATIONS, MERGE_DE, d2, deltaE, hexOf, labToRgb, rgbToLab } from './color-space.js';

export {
  COLOR_COUNTS,
  MERGE_DE,
  deltaE,
  hexOf,
  inkColors,
  inkText,
  labToRgb,
  rgbToLab,
} from './color-space.js';
export { cellColorGrid, cellColors, quantizeColors } from './color-cells.js';

/**
 * Image to color grid, as Create uses it: the palette comes from the pixels and
 * each cell takes its majority color (pixelColorGrid, D28).
 */
export function colorGrid(rgba, imgW, crop, cols, rows, k) {
  return pixelColorGrid(rgba, imgW, crop, cols, rows, k);
}

// ---- pixel-palette quantizer (D28 research) -----------------------------

/** Chang et al. 2015: the falloff (Lab units) when seeding colors far apart. */
export const SEED_FALLOFF = 80;
/** At most this many pixels feed the palette; larger crops are sampled on a grid. */
const MAX_PALETTE_PIXELS = 65536;

/** Pixel color at (x, y) of the image, alpha composited over white. */
function pixelAt(rgba, imgW, x, y) {
  const o = (y * imgW + x) * 4;
  const a = rgba[o + 3] / 255;
  return [0, 1, 2].map((k) => rgba[o + k] * a + 255 * (1 - a));
}

/** @param {number[]} rgb rounded [r, g, b] */
const binKey = (rgb) => ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);

/**
 * Color histogram of the crop in 16 x 16 x 16 sRGB bins (Chang et al. 2015):
 * [{key, rgb: mean color, lab, n: pixel count}].
 */
const sampleStep = (crop) =>
  Math.max(1, Math.ceil(Math.sqrt((crop.w * crop.h) / MAX_PALETTE_PIXELS)));

function histogram(rgba, imgW, crop) {
  const step = sampleStep(crop);
  const bins = new Map();
  for (let y = 0; y < crop.h; y += step) {
    for (let x = 0; x < crop.w; x += step) {
      const p = pixelAt(rgba, imgW, crop.x + x, crop.y + y);
      const key = binKey(p.map(Math.round));
      const bin = bins.get(key) ?? { key, sum: [0, 0, 0], n: 0 };
      bin.n += 1;
      for (let k = 0; k < 3; k++) bin.sum[k] += p[k];
      bins.set(key, bin);
    }
  }
  return [...bins.values()]
    .sort((a, b) => a.key - b.key)
    .map((b) => {
      const rgb = b.sum.map((s) => s / b.n);
      return { key: b.key, rgb, lab: rgbToLab(rgb), n: b.n };
    });
}

/**
 * Seeds for weighted k-means over bins. 'far' (Chang et al. 2015): the heaviest
 * bin, then repeatedly the heaviest after every weight is damped by
 * 1 - exp(-d^2 / SEED_FALLOFF^2) for its distance d to each chosen seed.
 * 'heavy': simply the k heaviest bins. Deterministic either way.
 */
function seeds(bins, k, how, vivid = 0) {
  if (how === 'heavy')
    return [...bins]
      .sort((a, b) => b.n - a.n)
      .slice(0, k)
      .map((b) => b.lab);
  // `vivid` > 0 favours saturated colors when seeding: weight x (1 + vivid x chroma / 50).
  const w = bins.map((b) => b.n * (1 + (vivid * Math.hypot(b.lab[1], b.lab[2])) / 50));
  const out = [];
  while (out.length < k) {
    let best = -1;
    for (let i = 0; i < bins.length; i++) if (w[i] > 0 && (best < 0 || w[i] > w[best])) best = i;
    if (best < 0) break;
    const c = bins[best].lab;
    out.push(c);
    bins.forEach((b, i) => (w[i] *= 1 - Math.exp(-d2(b.lab, c) / SEED_FALLOFF ** 2)));
  }
  return out;
}

/** Weighted Lloyd iterations over bins. Returns centroids (Lab) of non-empty clusters. */
function weightedKmeans(bins, cents) {
  let c = cents.map((x) => x.slice());
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const sum = c.map(() => [0, 0, 0, 0]);
    for (const b of bins) {
      const j = nearest(b.lab, c);
      for (let d = 0; d < 3; d++) sum[j][d] += b.lab[d] * b.n;
      sum[j][3] += b.n;
    }
    const next = sum.filter((s) => s[3] > 0).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
    const moved = next.length !== c.length || next.some((x, j) => d2(x, c[j]) > 1e-6);
    c = next;
    if (!moved) break;
  }
  return c;
}

function nearest(lab, cents) {
  let best = 0;
  let bd = Infinity;
  cents.forEach((c, j) => {
    const d = d2(lab, c);
    if (d < bd) {
      bd = d;
      best = j;
    }
  });
  return best;
}

/**
 * Image to color grid with the palette taken from the pixels (D28). Options,
 * each defaulting to the shipped choice:
 * - seed: 'far' (Chang et al. 2015) or 'heavy'
 * - cell: 'mode' (each cell takes its most common palette color) or 'mean'
 *   (the cell's average color, then the nearest palette color)
 * - saturate: multiply the palette's a and b by this (Gerstner et al. 2012 use 1.1)
 * Colors closer than MERGE_DE merge; the color covering the most cells is the
 * blank. Same return shape as quantizeColors.
 */
export function pixelColorGrid(rgba, imgW, crop, cols, rows, k, opts = {}) {
  const { seed = 'far', cell = 'mode', saturate = 1, vivid = 0 } = opts;
  const step = sampleStep(crop);
  const bins = histogram(rgba, imgW, crop);
  let cents = weightedKmeans(bins, seeds(bins, k, seed, vivid));
  // Merge the closest pair (weighted by pixels) until all are MERGE_DE apart.
  const weightOf = (cs) => {
    const w = cs.map(() => 0);
    for (const b of bins) w[nearest(b.lab, cs)] += b.n;
    return w;
  };
  for (;;) {
    const w = weightOf(cents);
    let best = null;
    for (let i = 0; i < cents.length; i++) {
      for (let j = i + 1; j < cents.length; j++) {
        const d = deltaE(cents[i], cents[j]);
        if (d < MERGE_DE && (!best || d < best.d)) best = { i, j, d };
      }
    }
    if (!best) break;
    const { i, j } = best;
    const t = w[i] + w[j] || 1;
    const merged = [0, 1, 2].map((d) => (cents[i][d] * w[i] + cents[j][d] * w[j]) / t);
    cents = cents.filter((_, x) => x !== i && x !== j).concat([merged]);
  }
  // Each palette color is the mean (in sRGB) of the pixels nearest to it.
  const sums = cents.map(() => [0, 0, 0, 0]);
  for (const b of bins) {
    const j = nearest(b.lab, cents);
    for (let d = 0; d < 3; d++) sums[j][d] += b.rgb[d] * b.n;
    sums[j][3] += b.n;
  }
  const paletteLab = sums.map((s, j) => {
    const lab = s[3] ? rgbToLab([s[0] / s[3], s[1] / s[3], s[2] / s[3]]) : cents[j];
    return [lab[0], lab[1] * saturate, lab[2] * saturate];
  });
  const paletteRgb = paletteLab.map(labToRgb);
  const assignLab = paletteRgb.map(rgbToLab); // assign against the colors as stored
  // Cell values: by majority vote of the cell's pixels, or by the cell mean.
  const byBin = new Map();
  const colorOf = (p) => {
    const key = binKey(p.map(Math.round));
    if (!byBin.has(key)) byBin.set(key, nearest(rgbToLab(p), assignLab));
    return byBin.get(key);
  };
  const raw = [];
  for (let r = 0; r < rows; r++) {
    const [y0, y1] = cellRange(r, rows, crop.h);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const [x0, x1] = cellRange(c, cols, crop.w);
      if (cell === 'mean') {
        const sum = [0, 0, 0];
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const p = pixelAt(rgba, imgW, crop.x + x, crop.y + y);
            for (let d = 0; d < 3; d++) sum[d] += p[d];
          }
        }
        const n = (y1 - y0) * (x1 - x0);
        row.push(nearest(rgbToLab(sum.map((s) => s / n)), assignLab));
      } else {
        // Votes are sampled on the same grid as the palette, so a big crop stays fast.
        const votes = paletteRgb.map(() => 0);
        for (let y = y0; y < y1; y += step) {
          for (let x = x0; x < x1; x += step) {
            votes[colorOf(pixelAt(rgba, imgW, crop.x + x, crop.y + y))]++;
          }
        }
        let best = 0;
        votes.forEach((v, j) => {
          if (v > votes[best]) best = j;
        });
        row.push(best);
      }
    }
    raw.push(row);
  }
  // Order: the most cells first (that one is the blank), ties by palette index.
  const counts = paletteRgb.map((_, j) => raw.flat().filter((v) => v === j).length);
  const order = paletteRgb
    .map((_, j) => j)
    .filter((j) => counts[j] > 0)
    .sort((a, b) => counts[b] - counts[a] || a - b);
  const value = new Map(order.map((j, v) => [j, v]));
  const grid = raw.map((row) => row.map((j) => value.get(j)));
  const blank = hexOf(paletteRgb[order[0]]);
  const inks = order.slice(1);
  const palette = inks.length
    ? inks.map((j, i) => ({ name: `color-${i + 1}`, hex: hexOf(paletteRgb[j]) }))
    : [{ name: 'color-1', hex: blank }];
  return { grid, palette, blank };
}
