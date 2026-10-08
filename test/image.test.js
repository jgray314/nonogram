import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellLuminance, otsu, binarize } from '../src/image.js';

// Build an RGBA array from a per-pixel function (x, y) -> [r, g, b, a].
function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      data.set([r, g, b, a], (y * w + x) * 4);
    }
  }
  return data;
}

const gray = (v) => [v, v, v, 255];

test('half-dark image splits at midline', () => {
  const w = 8;
  const h = 4;
  const img = makeImage(w, h, (x) => (x < 4 ? gray(0) : gray(255)));
  const lum = cellLuminance(img, w, h, { x: 0, y: 0, w, h }, 4, 2);
  assert.equal(lum.length, 2);
  const t = otsu(lum.flat());
  assert.deepEqual(binarize(lum, t), [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
  ]);
});

test('otsu picks between two clusters', () => {
  const values = [40, 42, 38, 41, 200, 205, 198, 202];
  const t = otsu(values);
  assert.ok(t > 42 && t <= 198, `t=${t}`);
});

test('invert flips', () => {
  const lum = [
    [0, 255],
    [100, 200],
  ];
  assert.deepEqual(binarize(lum, 128), [
    [1, 0],
    [1, 0],
  ]);
  assert.deepEqual(binarize(lum, 128, true), [
    [0, 1],
    [0, 1],
  ]);
});

test('non-divisible sizes cover every pixel', () => {
  // 7x5 image into 3x2 cells. Pixel (x, y) has luminance 10*y + x, all distinct
  // and small, so each cell's average identifies exactly which pixels it took.
  const w = 7;
  const h = 5;
  const img = makeImage(w, h, (x, y) => gray(10 * y + x));
  const lum = cellLuminance(img, w, h, { x: 0, y: 0, w, h }, 3, 2);
  // x splits: [0,2) [2,4) [4,7); y splits: [0,2) [2,5)
  const xs = [
    [0, 2],
    [2, 4],
    [4, 7],
  ];
  const ys = [
    [0, 2],
    [2, 5],
  ];
  let totalPixels = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      let n = 0;
      for (let y = ys[r][0]; y < ys[r][1]; y++) {
        for (let x = xs[c][0]; x < xs[c][1]; x++) {
          sum += 10 * y + x;
          n++;
        }
      }
      totalPixels += n;
      assert.ok(Math.abs(lum[r][c] - sum / n) < 1e-9, `cell ${r},${c}`);
    }
  }
  assert.equal(totalPixels, w * h);
});

test('transparent pixels read as white', () => {
  const w = 2;
  const h = 1;
  // Fully transparent black pixel, then opaque black pixel.
  const img = makeImage(w, h, (x) => (x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
  const lum = cellLuminance(img, w, h, { x: 0, y: 0, w, h }, 2, 1);
  assert.ok(Math.abs(lum[0][0] - 255) < 1e-9);
  assert.ok(Math.abs(lum[0][1] - 0) < 1e-9);
  // Half-transparent black composites to mid gray.
  const half = makeImage(1, 1, () => [0, 0, 0, 128]);
  const l2 = cellLuminance(half, 1, 1, { x: 0, y: 0, w: 1, h: 1 }, 1, 1);
  assert.ok(Math.abs(l2[0][0] - 255 * (1 - 128 / 255)) < 1e-9);
});

test('crop smaller than grid still fills every cell', () => {
  const w = 6;
  const h = 6;
  const img = makeImage(w, h, (x, y) => gray(x * 20 + y));
  // 2x2 crop at (3, 2) into a 5x4 grid.
  const lum = cellLuminance(img, w, h, { x: 3, y: 2, w: 2, h: 2 }, 5, 4);
  assert.equal(lum.length, 4);
  for (const row of lum) {
    assert.equal(row.length, 5);
    for (const v of row) {
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 255);
    }
  }
  // Every value must come from a pixel inside the crop.
  const allowed = new Set([3 * 20 + 2, 4 * 20 + 2, 3 * 20 + 3, 4 * 20 + 3]);
  for (const v of lum.flat()) assert.ok(allowed.has(v), `value ${v}`);
});

test('uniform input gives 128', () => {
  assert.equal(otsu([77, 77, 77, 77]), 128);
  assert.equal(otsu([]), 128);
});
