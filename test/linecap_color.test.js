// Closes the mutation survivors of src/color.js listed in
// docs/plans/line-cap-300-audit-color.md (C01-C47) and in
// docs/plans/line-cap-300-audit-color-2.md (C48 on), ahead of splitting the file.
//
// Expected values are literals worked out by hand from the image (colors,
// counts, rounding) unless a test says "snapshot". Snapshot cases are tiny
// images where the k-means result is a local choice that cannot be worked out
// by hand; their literals were taken once from the current code and are there
// to fail when a seed, an iteration count or a falloff changes.
//
// Accepted survivors (no test, one reason each):
// - C06: lin() is continuous at 0.04045 to 5 decimals; the two branches agree, so `<` and `<=` are equivalent.
// - C17: inkColors compares against '#000000', which has no letters, so toLowerCase() cannot change the answer.
// - C87: dropping `|| a - b` from the final sort changes nothing, because Array.sort is stable and the
//   candidates start in palette-index order.
// - C65, C67, C68, C75, C76, C97, C98 (extra sweep): no change in the result on 4000 random strips each,
//   and each is an equivalent or unreachable-in-practice change (an empty cluster cannot arise from
//   distinct bin seeds; re-running a converged Lloyd loop is idempotent; the zero-weight and exact-tie
//   guards need equal distances to the last bit; a one-pixel cluster has the same color either way; the
//   random generator's divisor differs by 2e-10 relative).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellColorGrid,
  cellColors,
  colorGrid,
  deltaE,
  hexOf,
  inkColors,
  inkText,
  labToRgb,
  pixelColorGrid,
  quantizeColors,
  rgbToLab,
} from '../src/color.js';

/** RGBA array from a per-pixel function (x, y) -> [r, g, b, a?]. */
function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      data.set([r, g, b, a], (y * w + x) * 4);
    }
  }
  return data;
}
/** A one-row image from a list of colors. */
const strip = (cols) => image(cols.length, 1, (x) => cols[x]);
const whole = (w, h) => ({ x: 0, y: 0, w, h });
const grey = (v) => [v, v, v];
const near = (actual, expected, msg) => {
  assert.equal(actual.length, expected.length, msg);
  actual.forEach((v, i) =>
    assert.ok(Math.abs(v - expected[i]) < 1e-9, `${msg}: ${actual} vs ${expected}`),
  );
};

// ---- hexOf, labToRgb ---------------------------------------------------------

test('hexOf clamps both ends, rounds, and pads to two digits (C13, C14, C15)', () => {
  assert.equal(hexOf([300, -5, 0]), '#ff0000');
  assert.equal(hexOf([-1, 256, 255.4]), '#00ffff');
  assert.equal(hexOf([0, 0, 0]), '#000000');
  assert.equal(hexOf([1, 10, 15.4]), '#010a0f');
  assert.equal(hexOf([0.4, 0.6, 254.5]), '#0001ff');
});

test('labToRgb: black, white, a very dark grey, and out-of-gamut clamping (C41, C42)', () => {
  assert.deepEqual(labToRgb([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(labToRgb([100, 0, 0]), [255, 255, 255]);
  // L 1: Y = 1/903.3 = 0.001107, in the linear toe (c <= 0.0031308), so
  // 12.92 * 0.001107 * 255 = 3.65 -> 4. The power-law branch would give 2.
  assert.deepEqual(labToRgb([1, 0, 0]), [4, 4, 4]);
  // Far outside sRGB: red above 255 and green below 0 must clamp.
  const out = labToRgb([50, 120, 0]);
  assert.equal(out[0], 255);
  assert.equal(out[1], 0);
  assert.ok(Number.isInteger(out[2]) && out[2] >= 0 && out[2] <= 255);
  const dark = labToRgb([20, -120, 100]);
  assert.ok(
    dark.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
    `dark ${dark}`,
  );
  assert.equal(dark[0], 0, 'a strongly green Lab has no red');
});

test('rgbToLab -> labToRgb round-trips, including near-black', () => {
  for (const c of [
    [3, 3, 3],
    [5, 5, 5],
    [10, 200, 30],
    [255, 0, 0],
    [0, 0, 0],
    [240, 230, 210],
  ]) {
    assert.deepEqual(labToRgb(rgbToLab(c)), c);
  }
});

// ---- inkColors, inkText ------------------------------------------------------

test('inkColors: null for no palette, an empty one or a single black ink (C16, C17)', () => {
  assert.equal(inkColors(null), null);
  assert.equal(inkColors(undefined), null);
  assert.equal(inkColors([]), null);
  assert.equal(inkColors([{ hex: '#000000' }]), null);
  assert.equal(inkColors(/** @type {any} */ ('#000000')), null, 'not an array');
});

test('inkColors: any other palette gives its hexes in order (C18)', () => {
  assert.deepEqual(inkColors([{ hex: '#ff0000' }]), ['#ff0000']);
  assert.deepEqual(inkColors([{ hex: '#000001' }]), ['#000001']);
  assert.deepEqual(inkColors([{ hex: '#000000' }, { hex: '#ffffff' }]), ['#000000', '#ffffff']);
});

test('inkText: black above L 60, white at or below, with greys on both sides of the cutoff (C19-C21)', () => {
  // L of the greys, worked from the sRGB curve: #777777 ~50, #8a8a8a ~57.4, #959595 ~61.7, #999999 ~63.2.
  assert.equal(inkText('#000000'), '#ffffff');
  assert.equal(inkText('#777777'), '#ffffff');
  assert.equal(inkText('#8a8a8a'), '#ffffff');
  assert.equal(inkText('#959595'), '#000000');
  assert.equal(inkText('#999999'), '#000000');
  assert.equal(inkText('#ffffff'), '#000000');
  assert.equal(inkText('#ff0000'), '#ffffff', 'red is L 53');
  assert.equal(inkText('#ffff00'), '#000000');
  assert.equal(inkText('#0000ff'), '#ffffff');
});

// ---- cellColors --------------------------------------------------------------

test('cellColors averages each cell in sRGB', () => {
  const img = image(
    4,
    2,
    (x, y) =>
      [
        [
          [10, 20, 30],
          [30, 40, 50],
          [100, 0, 0],
          [200, 0, 0],
        ],
        [
          [20, 20, 20],
          [40, 40, 40],
          [0, 0, 0],
          [100, 0, 0],
        ],
      ][y][x],
  );
  assert.deepEqual(cellColors(img, 4, whole(4, 2), 2, 1), [
    [
      [25, 30, 35],
      [100, 0, 0],
    ],
  ]);
});

test('cellColors reads only the crop, not the pixels left of or above it (C23)', () => {
  // Decoys: row 0 blue, columns 0-1 green. The crop starts at x 2, y 1.
  const img = image(6, 3, (x, y) =>
    y === 0 ? [0, 0, 255] : x < 2 ? [0, 200, 0] : x < 5 ? [255, 255, 255] : [255, 0, 0],
  );
  assert.deepEqual(cellColors(img, 6, { x: 2, y: 1, w: 4, h: 2 }, 4, 1), [
    [
      [255, 255, 255],
      [255, 255, 255],
      [255, 255, 255],
      [255, 0, 0],
    ],
  ]);
});

test('cellColors composites alpha over white (C22, C47)', () => {
  // Half-transparent red 255,0,0 at alpha 128: 255 * 128/255 + 255 * (1 - 128/255) = 255, 255 - 128 = 127.
  const img = image(
    3,
    1,
    (x) =>
      [
        [255, 0, 0, 128],
        [100, 100, 100, 0],
        [0, 0, 0, 255],
      ][x],
  );
  const out = cellColors(img, 3, whole(3, 1), 3, 1)[0];
  near(out[0], [255, 127, 127], 'half red');
  near(out[1], [255, 255, 255], 'transparent is white');
  near(out[2], [0, 0, 0], 'opaque black');
});

// ---- the pixel path (colorGrid) and the cell path (cellColorGrid) -----------------

test('both paths read a cropped image (crop.x and crop.y above 0)', () => {
  const img = image(6, 3, (x, y) =>
    y === 0 ? [0, 0, 255] : x < 2 ? [0, 200, 0] : x < 5 ? [255, 255, 255] : [255, 0, 0],
  );
  const crop = { x: 2, y: 1, w: 4, h: 2 };
  const want = {
    grid: [[0, 0, 0, 1]],
    palette: [{ name: 'color-1', hex: '#ff0000' }],
    blank: '#ffffff',
  };
  // k 2: the decoy blue row and green columns would take a palette slot if the histogram read them.
  assert.deepEqual(colorGrid(img, 6, crop, 4, 1, 2), want);
  assert.deepEqual(pixelColorGrid(img, 6, crop, 4, 1, 2, { cell: 'mean' }), want);
  assert.deepEqual(colorGrid(img, 6, crop, 4, 1, 3), want);
  assert.deepEqual(cellColorGrid(img, 6, crop, 4, 1, 3), want);
});

test('a half-transparent pixel is composited over white in both paths and in the cell mean (C47)', () => {
  const img = strip([
    [255, 0, 0, 128],
    [255, 255, 255, 255],
  ]);
  const want = { grid: [[0, 1]], palette: [{ name: 'color-1', hex: '#ffffff' }], blank: '#ff7f7f' };
  assert.deepEqual(colorGrid(img, 2, whole(2, 1), 2, 1, 3), want);
  assert.deepEqual(cellColorGrid(img, 2, whole(2, 1), 2, 1, 3), want);
  assert.deepEqual(pixelColorGrid(img, 2, whole(2, 1), 2, 1, 3, { cell: 'mean' }), want);
});

test('an image of one color asked for several gives one blank and a one-entry palette', () => {
  const img = image(4, 4, () => [240, 230, 210]);
  const want = {
    grid: [
      [0, 0],
      [0, 0],
    ],
    palette: [{ name: 'color-1', hex: '#f0e6d2' }],
    blank: '#f0e6d2',
  };
  assert.deepEqual(colorGrid(img, 4, whole(4, 4), 2, 2, 4), want);
  assert.deepEqual(cellColorGrid(img, 4, whole(4, 4), 2, 2, 4), want);
});

test('blank tie-break: the cell path takes the color that reaches the first cell first (C31, C32)', () => {
  const red = [255, 0, 0];
  const blue = [0, 0, 255];
  assert.deepEqual(cellColorGrid(strip([red, blue]), 2, whole(2, 1), 2, 1, 3), {
    grid: [[0, 1]],
    palette: [{ name: 'color-1', hex: '#0000ff' }],
    blank: '#ff0000',
  });
  assert.deepEqual(cellColorGrid(strip([blue, red]), 2, whole(2, 1), 2, 1, 3), {
    grid: [[0, 1]],
    palette: [{ name: 'color-1', hex: '#ff0000' }],
    blank: '#0000ff',
  });
});

test('blank tie-break: the pixel path orders equal counts by palette index, which follows bin key, not position', () => {
  // Blue's bin key (0x00f) sorts before red's (0xf00), so blue is palette entry 0 and the blank
  // whichever comes first in the image.
  const red = [255, 0, 0];
  const blue = [0, 0, 255];
  assert.deepEqual(colorGrid(strip([red, blue]), 2, whole(2, 1), 2, 1, 3), {
    grid: [[1, 0]],
    palette: [{ name: 'color-1', hex: '#ff0000' }],
    blank: '#0000ff',
  });
  assert.deepEqual(colorGrid(strip([blue, red]), 2, whole(2, 1), 2, 1, 3), {
    grid: [[0, 1]],
    palette: [{ name: 'color-1', hex: '#ff0000' }],
    blank: '#0000ff',
  });
});

// ---- merging ------------------------------------------------------------------

test('MERGE_DE: inks about 12 apart in Lab merge, about 18 apart stay separate (C02, C03)', () => {
  // Lab distances of grey 100 to 131 and to 144 (worked from the sRGB curve): ~12.4 and ~17.4.
  assert.ok(deltaE(rgbToLab(grey(100)), rgbToLab(grey(131))) < 15);
  assert.ok(deltaE(rgbToLab(grey(100)), rgbToLab(grey(144))) > 15);
  const img = (hi) => strip([grey(100), grey(100), grey(100), grey(hi)]);
  // Merged: one color, the 3:1 mean 107.75 -> 108 = 0x6c.
  const merged = {
    grid: [[0, 0, 0, 0]],
    palette: [{ name: 'color-1', hex: '#6c6c6c' }],
    blank: '#6c6c6c',
  };
  assert.deepEqual(colorGrid(img(131), 4, whole(4, 1), 4, 1, 3), merged);
  assert.deepEqual(cellColorGrid(img(131), 4, whole(4, 1), 4, 1, 3), merged);
  const apart = {
    grid: [[0, 0, 0, 1]],
    palette: [{ name: 'color-1', hex: '#909090' }],
    blank: '#646464',
  };
  assert.deepEqual(colorGrid(img(144), 4, whole(4, 1), 4, 1, 3), apart);
  assert.deepEqual(cellColorGrid(img(144), 4, whole(4, 1), 4, 1, 3), apart);
});

test('the merge test uses the rounded color, as stored (C35)', () => {
  // Cluster A is 71,71,71 and 72,71,71: mean 71.5, stored as 72,71,71. Cluster B is grey 107.
  // Unrounded, A to B is 15.02 (apart); rounded, 14.98 (merge). The stored hex decides.
  assert.ok(deltaE(rgbToLab([71.5, 71, 71]), rgbToLab(grey(107))) > 15);
  assert.ok(deltaE(rgbToLab([72, 71, 71]), rgbToLab(grey(107))) < 15);
  const cells = [[[71, 71, 71], [72, 71, 71], grey(107), grey(107)]];
  // Merged: mean of all four (89.25, 89, 89) -> #595959.
  assert.deepEqual(quantizeColors(cells, 2), {
    grid: [[0, 0, 0, 0]],
    palette: [{ name: 'color-1', hex: '#595959' }],
    blank: '#595959',
  });
});

// ---- seeds, iterations, falloff (snapshots) --------------------------------------

test('quantizeColors snapshot: seed and Lloyd iterations (C04, C05)', () => {
  // Needs the seed 1 start; seed 2 gives another grid.
  const a = [
    [
      [160, 0, 135],
      [251, 247, 71],
      [156, 184, 109],
      [254, 116, 125],
    ],
    [
      [35, 103, 63],
      [39, 125, 17],
      [101, 196, 73],
      [48, 10, 109],
    ],
    [
      [151, 204, 75],
      [52, 168, 139],
      [194, 49, 184],
      [116, 197, 254],
    ],
  ];
  assert.deepEqual(quantizeColors(a, 3), {
    grid: [
      [1, 0, 0, 1],
      [0, 0, 0, 2],
      [0, 0, 1, 2],
    ],
    palette: [
      { name: 'color-1', hex: '#cb3794' },
      { name: 'color-2', hex: '#5268b6' },
    ],
    blank: '#70af4e',
  });
  // Needs more than one Lloyd pass to settle.
  const b = [
    [
      [187, 83, 73],
      [137, 224, 161],
      [127, 91, 200],
      [29, 201, 51],
    ],
    [
      [108, 213, 148],
      [36, 172, 93],
      [248, 10, 234],
      [15, 32, 49],
    ],
    [
      [1, 240, 115],
      [162, 253, 59],
      [119, 89, 13],
      [133, 24, 14],
    ],
  ];
  assert.deepEqual(quantizeColors(b, 3), {
    grid: [
      [1, 0, 2, 0],
      [0, 0, 2, 1],
      [0, 0, 1, 1],
    ],
    palette: [
      { name: 'color-1', hex: '#723925' },
      { name: 'color-2', hex: '#bc33d9' },
    ],
    blank: '#4fd969',
  });
});

test('pixel path snapshot: weighted Lloyd iterations and the seed falloff (C05, C43)', () => {
  const it = [
    [214, 80, 95],
    [142, 1, 49],
    [246, 220, 61],
    [65, 11, 44],
    [146, 240, 171],
    [156, 37, 73],
    [14, 79, 19],
    [42, 38, 221],
  ];
  assert.deepEqual(colorGrid(strip(it), 8, whole(8, 1), 8, 1, 3), {
    grid: [[0, 0, 1, 0, 1, 0, 1, 2]],
    palette: [
      { name: 'color-1', hex: '#87b454' },
      { name: 'color-2', hex: '#2a26dd' },
    ],
    blank: '#902041',
  });
  const fall = [
    [40, 160, 76],
    [178, 149, 115],
    [209, 61, 129],
    [15, 131, 18],
    [145, 56, 41],
    [244, 177, 23],
    [32, 10, 142],
    [113, 192, 198],
  ];
  assert.deepEqual(colorGrid(strip(fall), 8, whole(8, 1), 8, 1, 3), {
    grid: [[0, 1, 2, 0, 1, 1, 2, 0]],
    palette: [
      { name: 'color-1', hex: '#bd7f3c' },
      { name: 'color-2', hex: '#782488' },
    ],
    blank: '#38a161',
  });
});

// ---- options ----------------------------------------------------------------------

test("seed 'far' keeps distant colors apart; 'heavy' takes the heaviest bins", () => {
  // 5 white, 4 light grey (204), 1 black. 'far' seeds white then black (grey is damped, being near
  // white); grey joins white's cluster (mean 232.3 -> #e8e8e8). 'heavy' seeds white and grey; black
  // joins grey's cluster (mean (4 * 204) / 5 = 163.2 -> #a3a3a3).
  const img = strip([...Array(5).fill(grey(255)), ...Array(4).fill(grey(204)), grey(0)]);
  assert.deepEqual(pixelColorGrid(img, 10, whole(10, 1), 10, 1, 2), {
    grid: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 1]],
    palette: [{ name: 'color-1', hex: '#000000' }],
    blank: '#e8e8e8',
  });
  assert.deepEqual(pixelColorGrid(img, 10, whole(10, 1), 10, 1, 2, { seed: 'heavy' }), {
    grid: [[0, 0, 0, 0, 0, 1, 1, 1, 1, 1]],
    palette: [{ name: 'color-1', hex: '#a3a3a3' }],
    blank: '#ffffff',
  });
});

test("cell 'mode' votes by pixel, 'mean' takes the cell's average color", () => {
  // Cells of 8 pixels: white, black, grey 128, then 5 white + 3 black (mean 159.4, nearest the grey).
  const img = image(32, 1, (x) => {
    const c = x >> 3;
    if (c === 0) return grey(255);
    if (c === 1) return grey(0);
    if (c === 2) return grey(128);
    return x % 8 < 5 ? grey(255) : grey(0);
  });
  const mode = pixelColorGrid(img, 32, whole(32, 1), 4, 1, 3);
  assert.deepEqual(mode, {
    grid: [[0, 1, 2, 0]],
    palette: [
      { name: 'color-1', hex: '#000000' },
      { name: 'color-2', hex: '#808080' },
    ],
    blank: '#ffffff',
  });
  assert.deepEqual(pixelColorGrid(img, 32, whole(32, 1), 4, 1, 3, { cell: 'mean' }), {
    grid: [[1, 2, 0, 0]],
    palette: [
      { name: 'color-1', hex: '#ffffff' },
      { name: 'color-2', hex: '#000000' },
    ],
    blank: '#808080',
  });
});

test('bins keep colors apart that differ in the green nibble alone (C49)', () => {
  // (0, 16, 0) and (0, 0, 128) have different bins (green bit 4, blue bit 3 of the key),
  // so two palette colors survive; a green shift of 3 would put both in one bin.
  const img = strip([
    [0, 16, 0],
    [0, 0, 128],
  ]);
  assert.deepEqual(colorGrid(img, 2, whole(2, 1), 2, 1, 3), {
    grid: [[1, 0]],
    palette: [{ name: 'color-1', hex: '#001000' }],
    blank: '#000080',
  });
});

// ---- extra sweep snapshots (docs/plans/line-cap-300-audit-color-2.md) ----------------
// Small noisy strips where the result depends on seed order, vivid weighting, saturate, the
// cell mean, merge weights and ties. Hand-working a weighted k-means is not practical, so these
// literals were taken from the current code and found by searching for strips on which the
// listed mutation changes the result.

const NOISY = {
  // C58: vivid weighting (the /50 divisor)
  vivid: {
    px: [
      [214, 20, 215, 165],
      [113, 194, 70, 145],
      [88, 224, 152, 140],
      [87, 226, 165, 148],
      [219, 27, 200, 133],
      [97, 211, 154, 204],
      [218, 26, 200, 153],
      [88, 207, 142, 138],
      [217, 26, 204, 223],
      [223, 33, 191, 174],
      [219, 25, 202, 206],
      [217, 19, 209, 176],
    ],
    cells: 6,
    k: 3,
    opts: { vivid: 1 },
    want: {
      grid: [[0, 0, 0, 0, 1, 1]],
      palette: [{ name: 'color-1', hex: '#e250db' }],
      blank: '#9ee5b8',
    },
  },
  // C69: nearest() ties; C77: order of merged centres
  tieSaturate: {
    px: [
      [91, 39, 250, 255],
      [248, 131, 28, 255],
      [248, 135, 29, 255],
      [7, 22, 210, 255],
      [88, 41, 250, 255],
      [9, 21, 210, 255],
      [0, 31, 210, 255],
      [92, 43, 255, 255],
      [6, 21, 209, 255],
    ],
    cells: 4,
    k: 3,
    opts: { saturate: 1.5 },
    want: {
      grid: [[0, 0, 0, 0]],
      palette: [{ name: 'color-1', hex: '#0000ff' }],
      blank: '#0000ff',
    },
  },
  // C73: weights of the merge pairs
  mergeWeights: {
    px: [
      [37, 146, 120, 255],
      [230, 195, 55, 255],
      [28, 159, 115, 255],
      [230, 205, 42, 255],
      [24, 158, 114, 255],
      [26, 158, 116, 255],
      [243, 219, 40, 255],
      [230, 208, 46, 255],
      [230, 208, 43, 255],
      [231, 205, 45, 255],
      [22, 154, 121, 255],
    ],
    cells: 5,
    k: 5,
    opts: { vivid: 1 },
    want: {
      grid: [[0, 0, 1, 0, 0]],
      palette: [{ name: 'color-1', hex: '#1b9b75' }],
      blank: '#e8cf2d',
    },
  },
  // C74: the merged centre is weighted by pixel count
  mean: {
    px: [
      [113, 75, 134, 167],
      [112, 132, 155, 184],
      [129, 131, 147, 167],
      [123, 120, 151, 218],
      [113, 66, 144, 142],
      [112, 75, 130, 167],
      [123, 119, 155, 186],
      [114, 76, 119, 199],
      [110, 74, 132, 211],
      [107, 113, 159, 193],
    ],
    cells: 5,
    k: 3,
    opts: { cell: 'mean' },
    want: {
      grid: [[1, 1, 0, 0, 0]],
      palette: [{ name: 'color-1', hex: '#a1a5b7' }],
      blank: '#9885aa',
    },
  },
  // C77: merged centre goes last
  merged: {
    px: [
      [91, 251, 234, 255],
      [158, 67, 224, 255],
      [203, 48, 104, 255],
      [88, 250, 234, 255],
      [100, 240, 232, 255],
      [153, 66, 228, 255],
      [158, 55, 240, 255],
      [191, 46, 99, 255],
    ],
    cells: 4,
    k: 4,
    opts: {},
    want: {
      grid: [[0, 0, 0, 1]],
      palette: [{ name: 'color-1', hex: '#c52f65' }],
      blank: '#5df7e9',
    },
  },
  // C80: saturate scales a and b; C86: a vote tie goes to the lower palette index
  saturate: {
    px: [
      [100, 157, 201, 255],
      [82, 8, 82, 255],
      [96, 169, 217, 255],
      [191, 98, 209, 255],
      [65, 178, 13, 255],
      [105, 155, 190, 255],
      [90, 145, 216, 255],
      [104, 166, 202, 255],
      [61, 166, 1, 255],
    ],
    cells: 4,
    k: 2,
    opts: { seed: 'heavy', saturate: 1.5 },
    want: {
      grid: [[0, 0, 0, 0]],
      palette: [{ name: 'color-1', hex: '#5780da' }],
      blank: '#5780da',
    },
  },
  // C81: cells are assigned against the colors as stored; C93, C96: bins are keyed on the rounded color
  stored: {
    px: [
      [74, 222, 90, 131],
      [186, 90, 250, 146],
      [174, 82, 255, 148],
      [188, 30, 162, 137],
      [94, 230, 82, 180],
      [184, 55, 174, 157],
      [195, 39, 164, 154],
    ],
    cells: 3,
    k: 4,
    opts: { seed: 'heavy', saturate: 1.5, vivid: 1 },
    want: { grid: [[0, 0, 0]], palette: [{ name: 'color-1', hex: '#e090ff' }], blank: '#e090ff' },
  },
};

for (const [name, c] of Object.entries(NOISY)) {
  test(`pixel path snapshot: ${name}`, () => {
    const n = c.px.length;
    assert.deepEqual(pixelColorGrid(strip(c.px), n, whole(n, 1), c.cells, 1, c.k, c.opts), c.want);
  });
}

test('the sampling grid and palette bins of a big crop; vote sampling on the same grid (C53, C54, C84, C85)', () => {
  // 300 x 300 -> step 2, so only (even x, even y) pixels are read. Top-left cell red; elsewhere
  // white on even x + y and blue on odd x + y, which the step-2 grid never sees. k 2: with the
  // blue seen, the palette would be white and blue and the red cell would turn white.
  const img = image(300, 300, (x, y) =>
    x < 150 && y < 150 ? [255, 0, 0] : (x + y) % 2 ? [0, 0, 255] : [255, 255, 255],
  );
  assert.deepEqual(colorGrid(img, 300, whole(300, 300), 2, 2, 2), {
    grid: [
      [1, 0],
      [0, 0],
    ],
    palette: [{ name: 'color-1', hex: '#ff0000' }],
    blank: '#ffffff',
  });
  // Votes: light red (255,60,60) fills every odd x or y and the (2 mod 4, 2 mod 4) pixels, so the
  // step-2 grid sees 3/4 white and 1/4 light red in a white cell. Reading every row (or every
  // column) in the votes would see 5/8 light red, which is nearest the red palette color, and the
  // white cells would turn red.
  const votes = image(300, 300, (x, y) => {
    if (x < 150 && y < 150) return [255, 0, 0];
    return x % 2 || y % 2 || (x % 4 === 2 && y % 4 === 2) ? [255, 60, 60] : [255, 255, 255];
  });
  const got = colorGrid(votes, 300, whole(300, 300), 2, 2, 2);
  assert.deepEqual(got.grid, [
    [1, 0],
    [0, 0],
  ]);
  assert.equal(got.blank, '#ffffff');
  assert.equal(got.palette.length, 1);
  // The red entry is the mean of the red block and the light red the grid sees: (0.57 * 0 + 0.43 * 60) ~ 26 green.
  assert.match(got.palette[0].hex, /^#ff1[0-9a-f]1[0-9a-f]$/);
});

// ---- large crops ------------------------------------------------------------------

test('a crop above 65536 pixels is sampled on a grid; one at the limit is not (C44, C45)', () => {
  // Odd columns red, even columns white. 300 x 300 = 90000 pixels: step ceil(sqrt(90000 / 65536)) = 2
  // lands on even x and y only, so only white is seen. 256 x 256 = 65536: step 1, both colors seen.
  const stripes = (n) => image(n, n, (x) => (x % 2 ? [255, 0, 0] : [255, 255, 255]));
  assert.deepEqual(colorGrid(stripes(300), 300, whole(300, 300), 2, 2, 3), {
    grid: [
      [0, 0],
      [0, 0],
    ],
    palette: [{ name: 'color-1', hex: '#ffffff' }],
    blank: '#ffffff',
  });
  // 256 x 256: the left half is red; in the right half white fills odd x and x % 4 = 0, red x % 4 = 2.
  // At step 1 the right cells are 3/4 white. At step 2 (even x only) red and white tie and red, the
  // lower palette index, wins, which would leave one color.
  const limit = image(256, 256, (x) => (x < 128 || x % 4 === 2 ? [255, 0, 0] : [255, 255, 255]));
  assert.deepEqual(colorGrid(limit, 256, whole(256, 256), 2, 2, 3), {
    grid: [
      [0, 1],
      [0, 1],
    ],
    palette: [{ name: 'color-1', hex: '#ffffff' }],
    blank: '#ff0000',
  });
});
