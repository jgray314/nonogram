// Image to color puzzle. Pure, no DOM.
// The cells are averaged in sRGB, clustered in CIELAB with seeded k-means, and
// clusters closer than MERGE_DE are merged. The cluster that covers the most
// cells is the blank; every other cluster is an ink, ordered by how many cells
// it covers. Research and numbers: docs/color-research.md.
import { cellRange } from './image.js';

/** Colors offered in Create, counting the blank. */
export const COLOR_COUNTS = [3, 4, 5];
/** Two colors closer than this (CIE76 delta E) are merged: players could not tell them apart in a small cell. */
export const MERGE_DE = 15;
const SEED = 1;
const ITERATIONS = 40;

// ---- color spaces -------------------------------------------------------

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);

/**
 * sRGB 0..255 -> CIELAB (D65).
 * @param {number[]} rgb [r, g, b]
 */
export function rgbToLab(rgb) {
  const [r, g, b] = rgb;
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 delta E: Euclidean distance in Lab. */
export function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** [r, g, b] (any numbers) -> '#rrggbb'. */
export function hexOf(rgb) {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

const rgbOfHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Hex per ink (index v - 1) when `palette` ({hex}[]) is a color palette, else
 * null: no palette, or a single black ink (a two-tone puzzle).
 * @param {{ hex: string }[] | null | undefined} palette
 */
export function inkColors(palette) {
  if (!Array.isArray(palette) || palette.length === 0) return null;
  if (palette.length === 1 && palette[0].hex.toLowerCase() === '#000000') return null;
  return palette.map((p) => p.hex);
}

/** Text color for a number drawn on an ink chip: black on light inks, white on dark. */
export function inkText(hex) {
  return rgbToLab(rgbOfHex(hex))[0] > 60 ? '#000000' : '#ffffff';
}

// ---- cell sampling ------------------------------------------------------

/**
 * Average sRGB color per cell over the `crop` rect {x, y, w, h}, alpha
 * composited over white (the color twin of cellLuminance). Rows of [r, g, b].
 */
export function cellColors(rgba, imgW, crop, cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const [y0, y1] = cellRange(r, rows, crop.h);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const [x0, x1] = cellRange(c, cols, crop.w);
      const sum = [0, 0, 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = ((crop.y + y) * imgW + crop.x + x) * 4;
          const a = rgba[o + 3] / 255;
          for (let k = 0; k < 3; k++) sum[k] += rgba[o + k] * a + 255 * (1 - a);
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      row.push(sum.map((s) => s / n));
    }
    out.push(row);
  }
  return out;
}

// ---- clustering ---------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Seeded k-means++ then Lloyd iterations. Returns assign[i] in 0..k-1. */
function kmeans(points, k) {
  const rand = mulberry32(SEED);
  const cents = [points[Math.floor(rand() * points.length)].slice()];
  while (cents.length < k) {
    const w = points.map((p) => Math.min(...cents.map((c) => d2(p, c))));
    const total = w.reduce((s, x) => s + x, 0);
    if (total === 0) break; // fewer distinct colors than k
    let t = rand() * total;
    let pick = points.length - 1;
    for (let i = 0; i < w.length; i++) {
      t -= w[i];
      if (t <= 0) {
        pick = i;
        break;
      }
    }
    cents.push(points[pick].slice());
  }
  let assign = points.map(() => -1);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let changed = false;
    assign = points.map((p, i) => {
      let best = 0;
      let bd = Infinity;
      cents.forEach((c, j) => {
        const d = d2(p, c);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      if (best !== assign[i]) changed = true;
      return best;
    });
    cents.forEach((_, j) => {
      const members = points.filter((__, i) => assign[i] === j);
      if (members.length) cents[j] = [0, 1, 2].map((d) => mean(members.map((m) => m[d])));
    });
    if (!changed) break;
  }
  return assign;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Quantize cells (rows of [r, g, b]) to at most `k` colors in total.
 * Returns {grid, palette, blank}: grid values are 0 (blank) or 1..n (ink),
 * palette is the n inks as {name, hex} for the puzzle record, and blank is the
 * blank color's hex (shown nowhere in play; useful for previews). An image of
 * one color gives an all-blank grid and a one-entry palette, so the record
 * stays valid.
 */
export function quantizeColors(cells, k) {
  const rgb = cells.flat();
  const lab = rgb.map(rgbToLab);
  const assign = kmeans(lab, k);
  // One cluster per used label: members, mean sRGB color and its Lab.
  let clusters = [...new Set(assign)].map((label) => {
    const members = assign.flatMap((a, i) => (a === label ? [i] : []));
    return clusterOf(members, rgb);
  });
  // Merge the closest pair until every pair is at least MERGE_DE apart.
  for (;;) {
    let best = null;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = deltaE(clusters[i].lab, clusters[j].lab);
        if (d < MERGE_DE && (!best || d < best.d)) best = { i, j, d };
      }
    }
    if (!best) break;
    const merged = clusterOf([...clusters[best.i].members, ...clusters[best.j].members], rgb);
    clusters = clusters.filter((_, x) => x !== best.i && x !== best.j).concat(merged);
  }
  // Most cells first; ties go to the cluster that reaches the first cell first.
  clusters.sort((a, b) => b.members.length - a.members.length || a.first - b.first);
  const value = new Array(rgb.length);
  clusters.forEach((cl, v) => cl.members.forEach((i) => (value[i] = v)));
  const width = cells[0].length;
  const grid = cells.map((row, r) => row.map((_, c) => value[r * width + c]));
  const blank = hexOf(clusters[0].rgb);
  const inks = clusters.slice(1);
  const palette = inks.length
    ? inks.map((cl, i) => ({ name: `color-${i + 1}`, hex: hexOf(cl.rgb) }))
    : [{ name: 'color-1', hex: blank }];
  return { grid, palette, blank };
}

function clusterOf(members, rgb) {
  const color = [0, 1, 2].map((d) => mean(members.map((i) => rgb[i][d])));
  // Lab of the rounded color, so the merge test matches the stored hex.
  const rounded = rgbOfHex(hexOf(color));
  return { members, rgb: rounded, lab: rgbToLab(rounded), first: Math.min(...members) };
}

/**
 * Image to color grid, as Create uses it: the palette comes from the pixels and
 * each cell takes its majority color (pixelColorGrid, D28).
 */
export function colorGrid(rgba, imgW, crop, cols, rows, k) {
  return pixelColorGrid(rgba, imgW, crop, cols, rows, k);
}

/** The D25 method, kept for the research comparison: average each cell, then quantize the averages. */
export function cellColorGrid(rgba, imgW, crop, cols, rows, k) {
  return quantizeColors(cellColors(rgba, imgW, crop, cols, rows), k);
}

// ---- pixel-palette quantizer (D28 research) -----------------------------

/**
 * CIELAB (D65) -> sRGB 0..255, clamped.
 * @param {number[]} lab [L, a, b]
 */
export function labToRgb(lab) {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const gam = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [gam(R), gam(G), gam(B)];
}

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
