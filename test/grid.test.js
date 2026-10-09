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

test('layout: a puzzle with no lines has a zero gutter', () => {
  assert.deepEqual(gutterSize({ rows: [], cols: [] }), { top: 0, left: 0 });
});

test('with zeroClues, an empty line shows a 0 clue, so it counts as gutter depth 1', () => {
  // Row 1 and column 1 are empty.
  const clues = puzzleClues([
    [1, 0],
    [0, 0],
  ]);
  assert.deepEqual(clues.rows[1], []);
  assert.deepEqual(gutterSize(clues, { zeroClues: true }), { top: 1, left: 1 });
  // A completely blank puzzle has a gutter of one for the "0"s, not zero.
  assert.deepEqual(gutterSize(puzzleClues([[0, 0]]), { zeroClues: true }), { top: 1, left: 1 });
});

test('without zeroClues (Create, Print), empty lines add no gutter', () => {
  // Create passes all-empty lists for a tile set on purpose (gate pass 3, M1).
  const blank = { rows: [[], []], cols: [[], []] };
  assert.deepEqual(gutterSize(blank), { top: 0, left: 0 });
});
