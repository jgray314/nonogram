// Color spaces and shared helpers for the color puzzle: sRGB <-> CIELAB, delta E,
// hex, the seeded generator, and the ink helpers. A leaf: imports nothing from
// the color family. Re-exported (by name) from color.js.

/** Colors offered in Create, counting the blank. */
export const COLOR_COUNTS = [3, 4, 5];
/** Two colors closer than this (CIE76 delta E) are merged: players could not tell them apart in a small cell. */
export const MERGE_DE = 15;
export const SEED = 1;
export const ITERATIONS = 40;

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

export const rgbOfHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

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

export const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

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
