import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStroke, strokeCells } from '../src/play-state.js';

const grid = (rows, cols, v = 0) => Array.from({ length: rows }, () => Array(cols).fill(v));
const withCell = (g, r, c, v) => {
  const n = g.map((row) => row.slice());
  n[r][c] = v;
  return n;
};

test('left on unknown fills', () => {
  const out = applyStroke(grid(3, 3), {
    button: 'left',
    path: [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  });
  assert.deepEqual(out[1], [1, 1, 1]);
  assert.deepEqual(out[0], [0, 0, 0]);
});

test('left on filled clears', () => {
  const g = grid(1, 3, 1);
  const out = applyStroke(g, {
    button: 'left',
    path: [
      [0, 0],
      [0, 1],
    ],
  });
  assert.deepEqual(out[0], [0, 0, 1]);
});

test('left on crossed does nothing', () => {
  const g = withCell(grid(1, 3), 0, 0, -1);
  const out = applyStroke(g, {
    button: 'left',
    path: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  });
  assert.deepEqual(out, g);
});

test('right on unknown crosses', () => {
  const out = applyStroke(grid(1, 3), {
    button: 'right',
    path: [
      [0, 0],
      [0, 1],
    ],
  });
  assert.deepEqual(out[0], [-1, -1, 0]);
});

test('right on crossed clears', () => {
  const g = grid(1, 3, -1);
  const out = applyStroke(g, {
    button: 'right',
    path: [
      [0, 0],
      [0, 1],
    ],
  });
  assert.deepEqual(out[0], [0, 0, -1]);
});

test('right on filled does nothing', () => {
  const g = withCell(grid(1, 3), 0, 0, 1);
  const out = applyStroke(g, {
    button: 'right',
    path: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  });
  assert.deepEqual(out, g);
});

test('fill stroke skips crossed cells', () => {
  const g = withCell(grid(1, 4), 0, 2, -1);
  const out = applyStroke(g, {
    button: 'left',
    path: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  });
  assert.deepEqual(out[0], [1, 1, -1, 1]);
});

test('stroke locks to axis', () => {
  const out = applyStroke(grid(3, 5), {
    button: 'left',
    path: [
      [1, 0],
      [1, 1],
      [2, 2],
      [0, 3],
      [1, 4],
    ],
  });
  assert.deepEqual(out[1], [1, 1, 1, 1, 1]);
  assert.deepEqual(out[0], [0, 0, 0, 0, 0]);
  assert.deepEqual(out[2], [0, 0, 0, 0, 0]);
});

test('stroke lock: vertical, diagonal larger delta, tie goes horizontal', () => {
  const g = grid(5, 5);
  assert.deepEqual(
    strokeCells(g, {
      button: 'left',
      path: [
        [0, 2],
        [1, 2],
        [2, 3],
      ],
    }),
    [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  );
  assert.deepEqual(
    strokeCells(g, {
      button: 'left',
      path: [
        [0, 0],
        [3, 1],
      ],
    }),
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  );
  assert.deepEqual(
    strokeCells(g, {
      button: 'left',
      path: [
        [0, 0],
        [1, 1],
      ],
    }),
    [
      [0, 0],
      [0, 1],
    ],
  );
});

test('fast stroke fills skipped cells', () => {
  const out = applyStroke(grid(1, 6), {
    button: 'left',
    path: [
      [0, 0],
      [0, 5],
    ],
  });
  assert.deepEqual(out[0], [1, 1, 1, 1, 1, 1]);
});

test('stroke clamps points outside the grid', () => {
  const out = applyStroke(grid(1, 3), {
    button: 'left',
    path: [
      [0, 1],
      [0, 2],
      [0, 9],
    ],
  });
  assert.deepEqual(out[0], [0, 1, 1]);
});

test('outside start is no-op', () => {
  const g = grid(2, 2);
  const s = (path) => applyStroke(g, { button: 'left', path });
  assert.deepEqual(
    s([
      [-1, 0],
      [0, 0],
    ]),
    g,
  );
  assert.deepEqual(s([[5, 5]]), g);
  assert.deepEqual(s([]), g);
  assert.notEqual(s([]), g);
});

test('input grid not mutated', () => {
  const g = grid(2, 3);
  const snap = JSON.stringify(g);
  const out = applyStroke(g, {
    button: 'left',
    path: [
      [0, 0],
      [0, 2],
    ],
  });
  assert.equal(JSON.stringify(g), snap);
  assert.notEqual(out, g);
  assert.notEqual(out[0], g[0]);
});

test('strokeCells dedupes and orders', () => {
  const cells = strokeCells(grid(1, 5), {
    button: 'left',
    path: [
      [0, 1],
      [0, 1],
      [0, 3],
      [0, 2],
      [0, 3],
    ],
  });
  assert.deepEqual(cells, [
    [0, 1],
    [0, 2],
    [0, 3],
  ]);
});
