// The D25 path, kept for the research comparison: average each cell, then
// quantize the averages with seeded k-means in CIELAB.
import { cellRange } from './image.js';
import {
  ITERATIONS,
  MERGE_DE,
  SEED,
  d2,
  deltaE,
  hexOf,
  mean,
  mulberry32,
  rgbOfHex,
  rgbToLab,
} from './color-space.js';

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

/** The D25 method, kept for the research comparison: average each cell, then quantize the averages. */
export function cellColorGrid(rgba, imgW, crop, cols, rows, k) {
  return quantizeColors(cellColors(rgba, imgW, crop, cols, rows), k);
}
