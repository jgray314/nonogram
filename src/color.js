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

/** Image to color grid in one call: average the crop per cell, then quantize. */
export function colorGrid(rgba, imgW, crop, cols, rows, k) {
  return quantizeColors(cellColors(rgba, imgW, crop, cols, rows), k);
}
