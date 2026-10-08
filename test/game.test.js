import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lineSatisfied,
  satisfiedLines,
  isSolved,
  createHistory,
  wrongFills,
  hintCell,
  autoCross,
  helpersAvailability,
} from '../src/game.js';
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

test('check flags only wrong fills', () => {
  const cells = [
    [1, 1, -1], // correct fills; a cross on an empty solution cell
    [-1, 0, 0], // a cross on an empty solution cell
    [-1, 1, 1], // wrong cross at (2,0) is not flagged; wrong fill at (2,1) is
  ];
  assert.deepEqual(wrongFills(cells, SOL), [[2, 1]]);
  assert.deepEqual(wrongFills(SOL, SOL), []);
});

test('hint reveals an unsolved cell', () => {
  const blank = SOL.map((row) => row.map(() => 0));
  // First row-major cell is solution 1: filled.
  assert.deepEqual(hintCell(blank, SOL), { r: 0, c: 0, value: 1 });
  // Unknown cell whose solution is empty gets a cross.
  const a = [
    [1, 1, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  assert.deepEqual(hintCell(a, SOL), { r: 0, c: 2, value: -1 });
  // A wrong fill is corrected to a cross; a wrong cross to a fill.
  const b = SOL.map((row) => row.map((v) => (v === 0 ? -1 : v)));
  b[1][1] = -1;
  assert.deepEqual(hintCell(b, SOL), { r: 1, c: 1, value: 1 });
  b[1][1] = 1;
  b[0][2] = 1;
  assert.deepEqual(hintCell(b, SOL), { r: 0, c: 2, value: -1 });
  // Nothing to reveal when every cell agrees.
  assert.equal(
    hintCell(
      b.map((row, r) => row.map((_, c) => (SOL[r][c] === 0 ? -1 : 1))),
      SOL,
    ),
    null,
  );
});

test('check disabled when not unique', () => {
  assert.equal(helpersAvailability({ status: 'unique-line-solvable', sweeps: 2 }).enabled, true);
  assert.equal(helpersAvailability({ status: 'unique-needs-guessing', sweeps: 3 }).enabled, true);
  for (const verdict of [
    null,
    { status: 'multiple', sweeps: 1 },
    { status: 'unknown', sweeps: 0 },
  ]) {
    const out = helpersAvailability(verdict);
    assert.equal(out.enabled, false);
    assert.match(out.note, /unique/i);
  }
  assert.equal(helpersAvailability({ status: 'unique-line-solvable', sweeps: 1 }).note, '');
});

test('auto-cross fills satisfied line', () => {
  const clues = puzzleClues(SOL);
  const cells = [
    [1, 1, 0], // row 0 satisfied: its unknown cell is crossed
    [0, 0, 0],
    [0, 0, 0],
  ];
  const out = autoCross(cells, clues);
  assert.deepEqual(out[0], [1, 1, -1]);
  // Column 2 is not satisfied and column 1 is not either, so rows 1 and 2 stay unknown
  // except where a satisfied column crosses them.
  assert.deepEqual(out[1], [0, 0, 0]);
  assert.deepEqual(cells[0], [1, 1, 0], 'input is not mutated');
  // With `before`, only lines that became satisfied are crossed.
  assert.deepEqual(autoCross(cells, clues, cells)[0], [1, 1, 0]);
  const before = [
    [1, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  assert.deepEqual(autoCross(cells, clues, before)[0], [1, 1, -1]);
});
