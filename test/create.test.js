import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZES,
  defaultSize,
  centerCrop,
  loadScale,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
} from '../src/create-logic.js';

test('defaultSize picks closest aspect', () => {
  assert.deepEqual(defaultSize(800, 800), { width: 15, height: 15 });
  // 2:1 -> short 7.5, a tie between 5 and 10 goes to the larger
  assert.deepEqual(defaultSize(1000, 500), { width: 15, height: 10 });
  // 3:2 -> short 10
  assert.deepEqual(defaultSize(600, 400), { width: 15, height: 10 });
  // tall 1:3 -> short 5, long side is height
  assert.deepEqual(defaultSize(100, 300), { width: 5, height: 15 });
  // very wide: minimum 5
  assert.deepEqual(defaultSize(5000, 100), { width: 15, height: 5 });
  // every result is from SIZES
  for (const [w, h] of [
    [640, 480],
    [333, 500],
    [900, 1000],
  ]) {
    const s = defaultSize(w, h);
    assert.ok(SIZES.includes(s.width) && SIZES.includes(s.height));
  }
});

test('crop stays inside image bounds', () => {
  const W = 400;
  const H = 300;
  const offsets = [-9999, -50, 0, 50, 9999];
  for (const [gw, gh] of [
    [15, 15],
    [20, 5],
    [5, 25],
    [15, 10],
  ]) {
    for (const dx of offsets) {
      for (const dy of offsets) {
        const c = centerCrop(W, H, gw, gh, { dx, dy });
        for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(c[k]), k);
        assert.ok(c.x >= 0 && c.y >= 0, `${gw}x${gh} ${dx},${dy}`);
        assert.ok(c.x + c.w <= W && c.y + c.h <= H);
        assert.ok(c.w >= 1 && c.h >= 1);
      }
    }
  }
  // centered by default; square grid on a wide image
  assert.deepEqual(centerCrop(400, 300, 15, 15), { x: 50, y: 0, w: 300, h: 300 });
  // offset shifts, then clamps
  assert.deepEqual(centerCrop(400, 300, 15, 15, { dx: 20, dy: 0 }), {
    x: 70,
    y: 0,
    w: 300,
    h: 300,
  });
  assert.deepEqual(centerCrop(400, 300, 15, 15, { dx: 999, dy: 0 }), {
    x: 100,
    y: 0,
    w: 300,
    h: 300,
  });
});

test('load scale caps long side at 1024', () => {
  assert.equal(loadScale(500, 400), 1);
  assert.equal(loadScale(1024, 1024), 1);
  assert.equal(loadScale(2048, 1000), 0.5);
  assert.equal(loadScale(1000, 4096), 0.25);
  assert.ok(Math.round(3000 * loadScale(3000, 2000)) <= 1024);
});

test('blank grid has chosen size', () => {
  const g = blankGrid(10, 5);
  assert.equal(g.length, 5);
  assert.ok(g.every((row) => row.length === 10 && row.every((v) => v === 0)));
  const s = newEditorState({ width: 20, height: 15 });
  assert.equal(s.width, 20);
  assert.equal(s.height, 15);
  assert.equal(s.grid.length, 15);
  assert.equal(s.grid[0].length, 20);
  assert.equal(s.hasImage, false);
  assert.equal(s.manualEdits, false);
  // rows are independent arrays
  g[0][0] = 1;
  assert.equal(g[1][0], 0);
});

test('regenerateNeedsConfirm only when manual edits exist', () => {
  assert.equal(regenerateNeedsConfirm(true), true);
  assert.equal(regenerateNeedsConfirm(false), false);
});
