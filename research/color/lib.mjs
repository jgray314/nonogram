// Helpers for the color research script. Pure functions, no I/O.
// Anything here that proves useful would move into src/image.js in a build.

// ---- seeded randomness -------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- color spaces -------------------------------------------------------

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);

/** sRGB 0..255 -> CIELAB (D65). */
export function rgbToLab([r, g, b]) {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 delta E: Euclidean distance in Lab. */
export function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export const WHITE = [255, 255, 255];
export const BLACK = [0, 0, 0];

// ---- cell sampling ------------------------------------------------------

// Same pixel ranges as src/image.js cellRange (which is not exported).
function cellRange(k, n, len) {
  const start = Math.floor((k * len) / n);
  const end = Math.floor(((k + 1) * len) / n);
  if (end > start) return [start, end];
  const p = Math.min(Math.floor(((k + 0.5) * len) / n), len - 1);
  return [p, p + 1];
}

/** Largest centered square. */
export function centerCrop(w, h) {
  const s = Math.min(w, h);
  return { x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), w: s, h: s };
}

/**
 * Average sRGB color per cell (alpha composited over white), the color
 * counterpart of src/image.js cellLuminance. Returns rows of [r, g, b].
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

export const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---- k-means with fixed anchors ----------------------------------------

/**
 * k-means with `anchors` (fixed centroids that never move) plus `k` free
 * centroids. Seeded k-means++ start, then Lloyd iterations. Points are
 * equal-length number arrays. Returns {assign, centroids} where assign[i] is an
 * index into centroids (anchors first, then the k free ones, sorted by size
 * descending so the order is deterministic).
 */
export function kmeans(points, anchors, k, seed = 1) {
  const rand = mulberry32(seed);
  const d2 = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return s;
  };
  const cents = anchors.map((a) => a.slice());
  const nearestD = (p) => Math.min(...cents.map((c) => d2(p, c)));
  // k-means++: pick each new centroid proportional to squared distance.
  for (let j = 0; j < k; j++) {
    const w = points.map(nearestD);
    const total = w.reduce((a, b) => a + b, 0);
    let pick = points.length - 1;
    if (total > 0) {
      let t = rand() * total;
      for (let i = 0; i < w.length; i++) {
        t -= w[i];
        if (t <= 0) {
          pick = i;
          break;
        }
      }
    }
    cents.push(points[pick].slice());
  }
  const A = anchors.length;
  let assign = new Array(points.length).fill(0);
  for (let iter = 0; iter < 40; iter++) {
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
    for (let j = A; j < cents.length; j++) {
      const members = points.filter((_, i) => assign[i] === j);
      if (members.length === 0) continue;
      cents[j] = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    }
    if (!changed && iter > 0) break;
  }
  const sizes = cents.map((_, j) => assign.filter((a) => a === j).length);
  const order = cents
    .map((_, j) => j)
    .slice(A)
    .sort((a, b) => sizes[b] - sizes[a] || a - b);
  const remap = new Map(cents.slice(0, A).map((_, j) => [j, j]));
  order.forEach((old, i) => remap.set(old, A + i));
  return {
    assign: assign.map((a) => remap.get(a)),
    centroids: [...cents.slice(0, A), ...order.map((j) => cents[j])],
  };
}

// ---- dithering ----------------------------------------------------------

/** Floyd-Steinberg on a luminance grid; returns 1 (ink) / 0 (blank). */
export function ditherFS(lum) {
  const h = lum.length;
  const w = lum[0].length;
  const g = lum.map((r) => r.slice());
  const out = g.map((r) => r.map(() => 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const old = g[y][x];
      const v = old < 128 ? 0 : 255;
      out[y][x] = v === 0 ? 1 : 0;
      const e = old - v;
      if (x + 1 < w) g[y][x + 1] += (e * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) g[y + 1][x - 1] += (e * 3) / 16;
        g[y + 1][x] += (e * 5) / 16;
        if (x + 1 < w) g[y + 1][x + 1] += (e * 1) / 16;
      }
    }
  }
  return out;
}

// ---- synthetic images ---------------------------------------------------

const SIZE = 240;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function paint(fn, noise, seed) {
  const rand = mulberry32(seed);
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const col = fn(x / SIZE, y / SIZE);
      const n = (rand() + rand() + rand() - 1.5) * noise;
      const o = (y * SIZE + x) * 4;
      rgba[o] = clamp(col[0] + n);
      rgba[o + 1] = clamp(col[1] + n);
      rgba[o + 2] = clamp(col[2] + n);
      rgba[o + 3] = 255;
    }
  }
  return { width: SIZE, height: SIZE, rgba };
}

// Seeded fractal value noise in 0..1, for textured photo-like images.
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const G = 64;
  const lat = Array.from({ length: G * G }, () => rand());
  const at = (i, j) => lat[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const base = (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = smooth(x - i);
    const v = smooth(y - j);
    return (
      (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) +
      (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v
    );
  };
  return (x, y, octaves) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * base(x * freq, y * freq);
      norm += amp;
      amp /= 2;
      freq *= 2;
    }
    return sum / norm;
  };
}

/** Piecewise-linear blend through color stops [[t, rgb], ...] sorted by t. */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}

const soft = (d, r) => Math.max(0, Math.min(1, 1 - d / r));

const smooth01 = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** 1 inside, 0 outside, with an antialiased edge `e` wide (image units 0..1). */
const inside = (d, e = 0.012) => smooth01(0.5 - d / e);

/**
 * Photo-like scenes for the clustering research (D28): a small vivid subject on
 * a large soft background, shading, antialiased edges and sensor noise, which
 * are what made photo conversion feel janky. Name -> {width, height, rgba}.
 */
export function photoLikeImages() {
  const out = {};
  const n1 = makeNoise(101);
  // Red apple with a leaf on a wooden table against a warm wall.
  out['photo-apple'] = paint(
    (x, y) => {
      let c = mix([228, 214, 190], [196, 176, 150], y);
      const table = inside(0.66 - y + 0.01 * Math.sin(x * 9), 0.01);
      const grain = 0.85 + 0.3 * n1(x * 3, y * 40, 3);
      c = mix(c, [128 * grain, 84 * grain, 52 * grain], 1 - table);
      const shadow = inside(Math.hypot((x - 0.55) / 0.3, (y - 0.74) / 0.06) - 1, 0.3);
      c = mix(c, [60, 40, 30], 0.45 * shadow * (1 - table));
      const d = Math.hypot(x - 0.5, y - 0.5) - 0.22;
      const shade = 0.75 + 0.35 * (1 - Math.hypot(x - 0.42, y - 0.42) / 0.3);
      c = mix(c, [205 * shade, 30 * shade, 38 * shade], inside(d));
      const hl = inside(Math.hypot(x - 0.42, y - 0.4) - 0.03, 0.03);
      c = mix(c, [250, 220, 215], 0.7 * hl * inside(d));
      const leaf = Math.hypot((x - 0.6) / 0.09, (y - 0.25) / 0.035) - 1;
      c = mix(c, [70, 140, 50], inside(leaf, 0.08));
      const stem = Math.abs(x - 0.51) - 0.008;
      return mix(c, [90, 60, 30], inside(stem, 0.006) * (y > 0.22 && y < 0.3 ? 1 : 0));
    },
    7,
    202,
  );
  // Sunset: orange-to-purple sky, a sun, dark hills with a tree.
  out['photo-sunset'] = paint(
    (x, y) => {
      let c = ramp(
        [
          [0, [70, 50, 120]],
          [0.35, [200, 90, 110]],
          [0.62, [245, 160, 70]],
          [1, [250, 200, 120]],
        ],
        y,
      );
      c = mix(c, [255, 235, 160], inside(Math.hypot(x - 0.62, y - 0.55) - 0.08));
      const hill = 0.7 + 0.06 * Math.sin(x * 7 + 1) + 0.03 * n1(x * 4, 3, 3);
      const trunk = inside(Math.abs(x - 0.25) - 0.01, 0.006) * (y > 0.5 ? 1 : 0);
      const crown = inside(Math.hypot((x - 0.25) / 0.08, (y - 0.48) / 0.07) - 1, 0.2);
      return mix(c, [30, 22, 40], Math.max(inside(hill - y, 0.008), trunk, crown));
    },
    6,
    303,
  );
  // Small blue bird with an orange breast on a branch, blurred green background.
  out['photo-bird'] = paint(
    (x, y) => {
      const b = n1(x * 2.5 + 7, y * 2.5, 4);
      let c = mix([60, 110, 50], [150, 190, 110], b);
      const branch = Math.abs(y - (0.72 - 0.25 * x)) - 0.025;
      c = mix(c, [95, 70, 45], inside(branch, 0.01));
      const body = Math.hypot((x - 0.5) / 0.13, (y - 0.5) / 0.09) - 1;
      c = mix(c, [40, 90, 190], inside(body, 0.1));
      const breast = Math.hypot((x - 0.55) / 0.07, (y - 0.54) / 0.05) - 1;
      c = mix(c, [235, 130, 40], inside(breast, 0.12));
      const head = Math.hypot(x - 0.6, y - 0.4) - 0.06;
      c = mix(c, [40, 90, 190], inside(head));
      return mix(c, [15, 15, 20], inside(Math.hypot(x - 0.62, y - 0.39) - 0.012, 0.006));
    },
    6,
    404,
  );
  // Person in a red shirt against a grey-blue wall, light from the left.
  out['photo-person'] = paint(
    (x, y) => {
      let c = mix([150, 165, 180], [110, 120, 135], x);
      const shirt = Math.hypot((x - 0.5) / 0.32, (y - 1.05) / 0.38) - 1;
      const light = 1.1 - 0.4 * x;
      c = mix(c, [190 * light, 40 * light, 45 * light], inside(shirt, 0.05));
      const neck = inside(Math.abs(x - 0.5) - 0.05, 0.01) * (y > 0.5 && y < 0.7 ? 1 : 0);
      const face = Math.hypot((x - 0.5) / 0.15, (y - 0.4) / 0.2) - 1;
      const skin = [225 * light, 180 * light, 150 * light];
      c = mix(c, skin, Math.max(inside(face, 0.08), neck));
      const hair = Math.hypot((x - 0.5) / 0.17, (y - 0.3) / 0.15) - 1;
      return mix(c, [60, 40, 30], inside(hair, 0.08) * (y < 0.32 ? 1 : 0.0));
    },
    6,
    505,
  );
  return out;
}

/** Name -> {width, height, rgba}. Fixed seeds, so the output is reproducible. */
export function syntheticImages() {
  const out = {};
  // Soft, low-contrast "landscape": sky gradient, hazy hills, muted sun.
  out['synth-soft-landscape'] = paint(
    (x, y) => {
      let c = mix([170, 195, 215], [225, 205, 175], y);
      const sun = soft(Math.hypot(x - 0.7, y - 0.3), 0.18);
      c = mix(c, [235, 215, 150], sun * 0.8);
      const hill = y > 0.55 + 0.08 * Math.sin(x * 6) ? 1 : 0;
      c = mix(c, [120, 150, 110], hill * 0.6 * (0.7 + 0.3 * y));
      const hill2 = y > 0.75 + 0.05 * Math.cos(x * 9) ? 1 : 0;
      return mix(c, [95, 120, 90], hill2 * 0.7);
    },
    6,
    11,
  );
  // Soft "portrait": skin-tone ellipse, darker hair, mid-tone background.
  out['synth-soft-portrait'] = paint(
    (x, y) => {
      let c = mix([150, 160, 170], [120, 125, 140], y);
      const hair = Math.hypot((x - 0.5) / 0.3, (y - 0.4) / 0.36);
      if (hair < 1) c = mix(c, [70, 55, 50], soft(hair, 1.4) * 0.9);
      const face = Math.hypot((x - 0.5) / 0.2, (y - 0.46) / 0.26);
      if (face < 1) c = mix(c, [215, 170, 140], 0.9 - 0.3 * face);
      const shoulders = y > 0.82 ? 1 : 0;
      return mix(c, [60, 80, 120], shoulders * 0.8);
    },
    5,
    22,
  );
  // Flag-like: three flat colors plus a small emblem, low noise.
  out['synth-flag-3color'] = paint(
    (x, y) => {
      if (Math.hypot(x - 0.5, y - 0.5) < 0.12) return [245, 200, 40];
      if (x < 1 / 3) return [30, 70, 160];
      if (x < 2 / 3) return [245, 245, 245];
      return [200, 40, 45];
    },
    3,
    33,
  );
  // Colorful shapes on a light ground: a mid-contrast "illustration".
  out['synth-shapes'] = paint(
    (x, y) => {
      if (Math.hypot(x - 0.3, y - 0.4) < 0.18) return [210, 50, 50];
      if (Math.abs(x - 0.68) + Math.abs(y - 0.35) < 0.2) return [60, 150, 70];
      if (x > 0.2 && x < 0.8 && y > 0.7 && y < 0.85) return [40, 90, 190];
      if (Math.hypot(x - 0.75, y - 0.72) < 0.07) return [240, 200, 40];
      return [238, 232, 222];
    },
    4,
    44,
  );
  // Textured terrain: several hues, continuous tones, detail at every scale.
  const n1 = makeNoise(55);
  const terrain = [
    [0, [40, 80, 150]],
    [0.4, [70, 130, 170]],
    [0.46, [215, 200, 150]],
    [0.52, [90, 150, 70]],
    [0.68, [60, 105, 55]],
    [0.8, [120, 110, 100]],
    [1, [240, 240, 240]],
  ];
  out['synth-texture-terrain'] = paint((x, y) => ramp(terrain, n1(x * 6, y * 6, 5)), 6, 66);
  // Textured clouds: low contrast and busy, the worst case for thresholding.
  const n2 = makeNoise(77);
  const sky = [
    [0, [120, 150, 195]],
    [0.5, [175, 195, 220]],
    [1, [235, 235, 240]],
  ];
  out['synth-texture-clouds'] = paint((x, y) => ramp(sky, n2(x * 5, y * 5, 6)), 5, 88);
  return out;
}
