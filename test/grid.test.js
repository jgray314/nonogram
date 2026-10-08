import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gutterSize } from '../src/views/grid.js';
import { puzzleClues } from '../src/clues.js';

test('layout: gutter fits max clue count', () => {
  const solution = [
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
  ];
  const clues = puzzleClues(solution);
  // Row 0 has three runs; columns have at most one run each.
  assert.deepEqual(gutterSize(clues), { top: 1, left: 3 });

  const tall = puzzleClues([[1], [0], [1], [0], [1], [0], [1]]);
  assert.deepEqual(gutterSize(tall), { top: 4, left: 1 });
});

test('layout: empty clues give a gutter of zero', () => {
  assert.deepEqual(gutterSize({ rows: [], cols: [] }), { top: 0, left: 0 });
});
