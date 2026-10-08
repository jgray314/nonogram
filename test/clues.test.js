import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineClues, puzzleClues } from '../src/clues.js';

test('mono runs', () => {
  assert.deepEqual(lineClues([1, 1, 0, 1, 0, 0, 1, 1, 1]), [
    { n: 2, c: 1 },
    { n: 1, c: 1 },
    { n: 3, c: 1 },
  ]);
});

test('empty line gives []', () => {
  assert.deepEqual(lineClues([]), []);
  assert.deepEqual(lineClues([0, 0, 0]), []);
});

test('adjacent different-color runs are separate clues', () => {
  assert.deepEqual(lineClues([1, 1, 2, 2, 2]), [
    { n: 2, c: 1 },
    { n: 3, c: 2 },
  ]);
});

test('same color runs split by gap', () => {
  assert.deepEqual(lineClues([2, 0, 2, 2]), [
    { n: 1, c: 2 },
    { n: 2, c: 2 },
  ]);
});

test('puzzleClues rows and cols', () => {
  // 2 rows x 3 cols
  const { rows, cols } = puzzleClues([
    [1, 0, 1],
    [1, 1, 1],
  ]);
  assert.deepEqual(rows, [
    [
      { n: 1, c: 1 },
      { n: 1, c: 1 },
    ],
    [{ n: 3, c: 1 }],
  ]);
  assert.deepEqual(cols, [[{ n: 2, c: 1 }], [{ n: 1, c: 1 }], [{ n: 2, c: 1 }]]);
});
