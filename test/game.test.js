import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineSatisfied, satisfiedLines, isSolved, createHistory } from '../src/game.js';
import { puzzleClues } from '../src/clues.js';

const SOL = [
  [1, 1, 0],
  [0, 1, 0],
  [1, 0, 1],
];

test('satisfied clue flagged', () => {
  const clues = [{ n: 2, c: 1 }];
  assert.equal(lineSatisfied([1, 1, 0], clues), true);
  assert.equal(lineSatisfied([0, 1, 1], clues), true);
  assert.equal(lineSatisfied([1, 0, 1], clues), false);
  // crosses and unknowns both count as empty
  assert.equal(lineSatisfied([1, 1, -1], clues), true);
  assert.equal(lineSatisfied([0, 0, 0], []), true);
  assert.equal(lineSatisfied([1, 0, 0], []), false);

  const all = puzzleClues(SOL);
  const cells = [
    [1, 1, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const sat = satisfiedLines(cells, all);
  assert.deepEqual(sat.rows, [true, false, false]);
  assert.deepEqual(sat.cols, [false, false, false]);
});

test('solved detected', () => {
  const clues = puzzleClues(SOL);
  assert.equal(isSolved(SOL, clues), true);
  const crossed = SOL.map((row) => row.map((v) => (v === 0 ? -1 : v)));
  assert.equal(isSolved(crossed, clues), true);
  const almost = SOL.map((row) => row.slice());
  almost[2][2] = 0;
  assert.equal(isSolved(almost, clues), false);
});

test('alternate solution counts as solved', () => {
  // The 2x2 diagonal has two solutions with identical clues.
  const a = [
    [1, 0],
    [0, 1],
  ];
  const b = [
    [0, 1],
    [1, 0],
  ];
  const clues = puzzleClues(a);
  assert.deepEqual(puzzleClues(b), clues);
  assert.equal(isSolved(b, clues), true);
});

test('undo/redo restores', () => {
  const g0 = [[0, 0]];
  const g1 = [[1, 0]];
  const g2 = [[1, -1]];
  const h = createHistory(g0);
  assert.deepEqual(h.current(), g0);
  h.push(g1);
  h.push(g2);
  assert.deepEqual(h.current(), g2);
  assert.deepEqual(h.undo(), g1);
  assert.deepEqual(h.undo(), g0);
  assert.deepEqual(h.undo(), g0, 'undo at the start is a no-op');
  assert.deepEqual(h.redo(), g1);
  assert.deepEqual(h.redo(), g2);
  assert.deepEqual(h.redo(), g2, 'redo at the end is a no-op');
  h.undo();
  h.push([[0, 1]]);
  assert.deepEqual(h.redo(), [[0, 1]], 'push drops the redo branch');
});

test('history does not alias caller arrays', () => {
  const g = [[0, 0]];
  const h = createHistory(g);
  g[0][0] = 1;
  assert.deepEqual(h.current(), [[0, 0]]);
});
