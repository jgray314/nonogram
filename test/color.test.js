import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_COUNTS,
  MERGE_DE,
  cellColors,
  colorGrid,
  deltaE,
  hexOf,
  inkText,
  labToRgb,
  quantizeColors,
  rgbToLab,
} from '../src/color.js';
import { validatePuzzle } from '../src/format.js';

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

const CREAM = [240, 230, 210];
const RED = [200, 40, 45];
const BLUE = [30, 70, 160];
const GREEN = [60, 150, 70];

/** cells[r][c] from a row-string map: '.' cream, 'r' red, 'b' blue, 'g' green. */
const cellsOf = (rows) =>
  rows.map((row) => [...row].map((ch) => ({ '.': CREAM, r: RED, b: BLUE, g: GREEN })[ch]));

test('offered color counts are 3 to 5 in total, blank included', () => {
  assert.deepEqual(COLOR_COUNTS, [3, 4, 5]);
});

test('Lab and delta E: white is L 100, and black to white is 100', () => {
  const [L, a, b] = rgbToLab([255, 255, 255]);
  assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
  assert.ok(Math.abs(deltaE(rgbToLab([0, 0, 0]), rgbToLab([255, 255, 255])) - 100) < 0.01);
});

test('the most common color is the blank, even when it is not white', () => {
  const cells = cellsOf(['..r..', '.rrr.', '..b..', '.....', 'bb...']);
  const { grid, palette, blank } = quantizeColors(cells, 3);
  assert.equal(blank, hexOf(CREAM));
  // Inks are ordered by how many cells they cover: red (4) before blue (3).
  assert.deepEqual(
    palette.map((p) => p.hex),
    [hexOf(RED), hexOf(BLUE)],
  );
  assert.deepEqual(grid, [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 2, 0, 0],
    [0, 0, 0, 0, 0],
    [2, 2, 0, 0, 0],
  ]);
});

test('a dark background that covers most cells becomes the blank', () => {
  const dark = [20, 20, 30];
  const cells = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r === c ? RED : c === 0 ? CREAM : dark)),
  );
  const { grid, blank } = quantizeColors(cells, 3);
  assert.equal(blank, hexOf(dark));
  assert.ok(grid.flat().filter((v) => v === 0).length >= 18);
});

test('the grid is never fully inked: the blank keeps at least 1/k of the cells', () => {
  for (const k of COLOR_COUNTS) {
    const cells = Array.from({ length: 10 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => [(r * 25) % 256, (c * 25) % 256, ((r + c) * 12) % 256]),
    );
    const { grid } = quantizeColors(cells, k);
    const blanks = grid.flat().filter((v) => v === 0).length;
    assert.ok(blanks >= 100 / k, `k=${k}: only ${blanks} blank cells`);
  }
});

test('near-identical colors merge, so a two-color image asked for 5 gives one ink', () => {
  const cells = cellsOf(['.....', '..r..', '.rrr.', '..r..', '.....']);
  // Tiny shading differences inside the red: k-means would split them apart.
  cells[2][2] = [204, 44, 49];
  cells[1][2] = [196, 38, 42];
  const { grid, palette } = quantizeColors(cells, 5);
  assert.equal(palette.length, 1);
  assert.equal(grid[2][2], 1);
  assert.equal(grid[0][0], 0);
});

test('every pair of kept colors, blank included, is at least MERGE_DE apart', () => {
  const cells = Array.from({ length: 12 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => [r * 20, c * 20, 100]),
  );
  const { palette, blank } = quantizeColors(cells, 5);
  assert.ok(palette.length >= 2, 'expected several inks from a wide gradient');
  const all = [blank, ...palette.map((p) => p.hex)].map((h) => rgbToLab(rgbOfHex(h)));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      assert.ok(deltaE(all[i], all[j]) >= MERGE_DE, `colors ${i} and ${j} too close`);
    }
  }
});

test('a single-color image gives an empty grid and a valid one-entry palette', () => {
  const cells = cellsOf(['...', '...', '...']);
  const { grid, palette } = quantizeColors(cells, 4);
  assert.deepEqual(grid.flat(), new Array(9).fill(0));
  assert.equal(palette.length, 1);
});

test('the result is deterministic', () => {
  const cells = Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => [(r * 37) % 256, (c * 53) % 256, (r * c) % 256]),
  );
  assert.deepEqual(quantizeColors(cells, 4), quantizeColors(cells, 4));
});

test('a quantized grid saves as a valid puzzle record', () => {
  const cells = cellsOf(['..r..', '.rgr.', '..b..', '.....', 'bb.g.']);
  const { grid, palette } = quantizeColors(cells, 4);
  const check = validatePuzzle({
    v: 1,
    id: 'x',
    title: 't',
    width: 5,
    height: 5,
    palette,
    solution: grid,
    verdict: null,
  });
  assert.ok(check.ok, check.error);
});

test('cellColors averages each cell and composites transparency over white', () => {
  const rgba = makeImage(4, 2, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  const cells = cellColors(rgba, 4, { x: 0, y: 0, w: 4, h: 2 }, 2, 1);
  assert.deepEqual(cells, [
    [
      [255, 0, 0],
      [255, 255, 255],
    ],
  ]);
});

test('colorGrid runs the whole image to grid path', () => {
  const rgba = makeImage(10, 10, (x, y) => (x < 2 ? RED : y < 2 ? BLUE : CREAM));
  const { grid, palette } = colorGrid(rgba, 10, { x: 0, y: 0, w: 10, h: 10 }, 5, 5, 3);
  assert.equal(grid.length, 5);
  assert.equal(palette.length, 2);
  assert.equal(grid[4][4], 0);
});

// ---- D28: palette from the pixels ----------------------------------------

const full = (w, h) => ({ x: 0, y: 0, w, h });
const softDisc = (w, h, cx, cy, r, ink, ground) =>
  makeImage(w, h, (x, y) => {
    // Antialiased edge: a 2px blend between ink and ground.
    const t = Math.max(0, Math.min(1, (r + 1 - Math.hypot(x - cx, y - cy)) / 2));
    return ink.map((v, i) => Math.round(v * t + ground[i] * (1 - t)));
  });

test('an antialiased two-color image gives one ink, not an extra edge color', () => {
  const rgba = softDisc(150, 150, 75, 75, 40, RED, CREAM);
  const { palette, blank, grid } = colorGrid(rgba, 150, full(150, 150), 15, 15, 5);
  assert.equal(palette.length, 1, `inks: ${palette.map((p) => p.hex).join(' ')}`);
  assert.ok(deltaE(rgbToLab(rgbOfHex(palette[0].hex)), rgbToLab(RED)) < 5, 'the ink is not red');
  assert.ok(deltaE(rgbToLab(rgbOfHex(blank)), rgbToLab(CREAM)) < 5, 'the blank is not cream');
  assert.equal(grid[7][7], 1);
});

test('a small vivid subject keeps its own color next to large soft areas', () => {
  // Brown top half, beige bottom half, a small red disc and a smaller green leaf.
  const rgba = makeImage(200, 200, (x, y) => {
    if (Math.hypot(x - 100, y - 100) < 22) return RED;
    if (Math.hypot(x - 112, y - 70) < 8) return GREEN;
    const shade = (x + y) / 400; // a soft gradient inside each area
    return y < 110 ? [130 - 20 * shade, 85, 55] : [225 - 20 * shade, 210, 185];
  });
  const { palette } = colorGrid(rgba, 200, full(200, 200), 20, 20, 5);
  const has = (rgb) => palette.some((p) => deltaE(rgbToLab(rgbOfHex(p.hex)), rgbToLab(rgb)) < 12);
  assert.ok(has(RED), 'the red subject lost its color');
  assert.ok(has(GREEN), 'the green leaf lost its color');
});

test('moving the crop a little barely changes the palette', () => {
  const rgba = makeImage(200, 200, (x, y) => {
    if (Math.hypot(x - 90, y - 110) < 35) return RED;
    if (y < 60) return [120 + x / 4, 160, 210]; // sky gradient
    return [90, 140 - y / 8, 70]; // grass gradient
  });
  const a = colorGrid(rgba, 200, full(200, 200), 15, 15, 4);
  const b = colorGrid(rgba, 200, { x: 6, y: 6, w: 194, h: 194 }, 15, 15, 4);
  const labs = (q) => [q.blank, ...q.palette.map((p) => p.hex)].map((h) => rgbToLab(rgbOfHex(h)));
  const near = (xs, ys) =>
    xs.reduce((s, x) => s + Math.min(...ys.map((y) => deltaE(x, y))), 0) / xs.length;
  const shift = (near(labs(a), labs(b)) + near(labs(b), labs(a))) / 2;
  assert.ok(shift < 2, `palette moved by ${shift.toFixed(1)}`);
});

test('labToRgb inverts rgbToLab', () => {
  for (const rgb of [RED, BLUE, GREEN, CREAM, [0, 0, 0], [255, 255, 255]]) {
    assert.deepEqual(labToRgb(rgbToLab(rgb)), rgb);
  }
});

test('clue text is dark on light inks and light on dark inks', () => {
  assert.equal(inkText('#f0e6d2'), '#000000');
  assert.equal(inkText('#1e46a0'), '#ffffff');
});

function rgbOfHex(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
