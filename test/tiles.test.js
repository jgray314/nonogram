import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileGrid, makeSet, tileFlags } from '../src/tiles.js';
import { validatePuzzle, validateSet } from '../src/format.js';

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
const PALETTE = [{ name: 'ink', hex: '#000000' }];

// 2 x 3 tiles of 4 x 3 cells, one pixel per cell: a diagonal-ish pattern.
const R = 2;
const C = 3;
const TW = 4;
const TH = 3;
const W = C * TW;
const H = R * TH;
const patterned = () => makeImage(W, H, (x, y) => ((x * 7 + y * 3) % 5 < 2 ? gray(0) : gray(255)));
const wholeCrop = { x: 0, y: 0, w: W, h: H };

test('tiles reassemble to the full grid', () => {
  const { full, tiles } = tileGrid(patterned(), W, H, wholeCrop, TW, TH, R, C);
  assert.equal(full.length, H);
  assert.equal(full[0].length, W);
  assert.equal(tiles.length, R);
  assert.equal(tiles[0].length, C);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      assert.equal(tiles[r][c].length, TH);
      assert.equal(tiles[r][c][0].length, TW);
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          assert.equal(tiles[r][c][y][x], full[r * TH + y][c * TW + x]);
        }
      }
    }
  }
});

test('identical tiles get distinct ids', async () => {
  const white = makeImage(W, H, () => gray(255));
  const { tiles } = tileGrid(white, W, H, wholeCrop, TW, TH, R, C);
  const { puzzles } = await makeSet({ title: 'Sky', tiles, palette: PALETTE });
  assert.equal(puzzles.length, R * C);
  assert.equal(new Set(puzzles.map((p) => p.id)).size, R * C);
});

test('set lists tile ids row-major', async () => {
  const { tiles } = tileGrid(patterned(), W, H, wholeCrop, TW, TH, R, C);
  const { set, puzzles } = await makeSet({ title: 'Pat', tiles, palette: PALETTE });
  assert.equal(set.rows, R);
  assert.equal(set.cols, C);
  assert.deepEqual(
    set.tileIds,
    puzzles.map((p) => p.id),
  );
  puzzles.forEach((p, i) => {
    assert.equal(p.set.row, Math.floor(i / C));
    assert.equal(p.set.col, i % C);
    assert.equal(p.set.id, set.setId);
    assert.equal(p.title, `Pat r${p.set.row + 1}c${p.set.col + 1}`);
  });
});

test('single threshold across tiles', () => {
  // Left half mid-gray, right half dark. Two tiles side by side, 4x4 cells each.
  const w = 16;
  const h = 8;
  const img = makeImage(w, h, (x) => (x < 8 ? gray(120) : gray(20)));
  const crop = { x: 0, y: 0, w, h };
  const { tiles } = tileGrid(img, w, h, crop, 4, 4, 2, 2);
  // Global Otsu separates gray from dark; a per-tile Otsu on the gray tile
  // alone would return 128 and fill it.
  assert.ok(tiles[0][0].flat().every((v) => v === 0));
  assert.ok(tiles[0][1].flat().every((v) => v === 1));
  // An explicit threshold and invert are honored.
  const forced = tileGrid(img, w, h, crop, 4, 4, 2, 2, { threshold: 128 });
  assert.ok(forced.tiles[0][0].flat().every((v) => v === 1));
  const inv = tileGrid(img, w, h, crop, 4, 4, 2, 2, { invert: true });
  assert.ok(inv.tiles[0][0].flat().every((v) => v === 1));
});

test('tile flags blank and full', () => {
  assert.equal(
    tileFlags([
      [0, 0],
      [0, 0],
    ]),
    'blank',
  );
  assert.equal(
    tileFlags([
      [1, 1],
      [1, 1],
    ]),
    'full',
  );
  assert.equal(
    tileFlags([
      [1, 0],
      [1, 1],
    ]),
    null,
  );
});

test('records pass validators', async () => {
  const { tiles } = tileGrid(patterned(), W, H, wholeCrop, TW, TH, R, C);
  const { set, puzzles } = await makeSet({ title: 'Pat', tiles, palette: PALETTE });
  assert.deepEqual(validateSet(set), { ok: true });
  for (const p of puzzles) assert.deepEqual(validatePuzzle(p), { ok: true });
  assert.match(set.setId, /^[0-9a-f]{16}$/);
  // Deterministic: same input, same set id.
  const again = await makeSet({ title: 'Pat', tiles, palette: PALETTE });
  assert.equal(again.set.setId, set.setId);
});
