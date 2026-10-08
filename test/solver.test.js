import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues } from '../src/clues.js';
import { propagate, solve } from '../src/solver.js';

/** Parse a picture ('X' filled, anything else empty) into a solution grid. */
function pic(lines) {
  return lines.map((l) => [...l].map((ch) => (ch === 'X' ? 1 : 0)));
}

function problemFrom(solution) {
  const { rows, cols } = puzzleClues(solution);
  return { width: solution[0].length, height: solution.length, rows, cols };
}

// Hand-drawn 10x10 (a rounded blob with two eyes and a mouth).
const BLOB = pic([
  '..XXXXXX..',
  '.XXXXXXXX.',
  'XXX.XX.XXX',
  'XXXXXXXXXX',
  'XXXXXXXXXX',
  'XX.XXXX.XX',
  'XXX....XXX',
  '.XXXXXXXX.',
  '..XXXXXX..',
  '...XXXX...',
]);

test('solves known line-solvable 10x10', () => {
  const r = propagate(problemFrom(BLOB));
  assert.equal(r.contradiction, false);
  assert.deepEqual(r.grid, BLOB);
});

test('2x2 diagonal stalls with 4 unknown', () => {
  const r = propagate(problemFrom(pic(['X.', '.X'])));
  assert.equal(r.contradiction, false);
  assert.deepEqual(r.grid, [
    [null, null],
    [null, null],
  ]);
  assert.equal(r.sweeps, 0);
});

test('contradiction detected', () => {
  // Row says the cell is filled, column says it is empty.
  const one = propagate({
    width: 1,
    height: 1,
    rows: [[{ n: 1, c: 1 }]],
    cols: [[]],
  });
  assert.equal(one.contradiction, true);
  // A run that cannot fit in the line.
  const tooLong = propagate({
    width: 2,
    height: 1,
    rows: [[{ n: 3, c: 1 }]],
    cols: [[], []],
  });
  assert.equal(tooLong.contradiction, true);
});

test('reports sweep count', () => {
  const full = propagate(problemFrom(pic(['XXX', 'XXX', 'XXX'])));
  assert.equal(full.sweeps, 1);
  // The blob needs the columns to finish what the rows start.
  const blob = propagate(problemFrom(BLOB));
  assert.ok(blob.sweeps >= 2, `expected >= 2 sweeps, got ${blob.sweeps}`);
});

const sortCells = (cells) => [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

test('status unique-line-solvable', () => {
  const r = solve(problemFrom(BLOB));
  assert.equal(r.status, 'unique-line-solvable');
  assert.deepEqual(r.grid, BLOB);
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(r.differing, []);
  assert.ok(r.sweeps >= 2);
});

// Unique, but the line solver alone stalls: rows 1,1 / 2 / empty / empty and
// every column holds exactly one cell.
const GUESS = pic(['X..X', '.XX.', '....', '....']);

test('status unique-needs-guessing', () => {
  const r = solve(problemFrom(GUESS));
  assert.equal(r.status, 'unique-needs-guessing');
  assert.ok(r.unresolved.length > 0);
  assert.deepEqual(r.differing, []);
  // The grid is the line solver's fixed point: unresolved cells are null.
  for (const [row, col] of r.unresolved) assert.equal(r.grid[row][col], null);
});

test('status multiple', () => {
  const r = solve(problemFrom(pic(['X.', '.X'])));
  assert.equal(r.status, 'multiple');
});

test('multiple reports differing cells', () => {
  const r = solve(problemFrom(pic(['X.', '.X'])));
  assert.deepEqual(sortCells(r.differing), [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
  // On a larger ambiguous grid, check against brute force: every reported
  // cell must really vary between solutions, and there must be at least one.
  const picture = pic(['X...', '.X..', '..XX', '..XX']);
  const problem = problemFrom(picture);
  const key = JSON.stringify([problem.rows, problem.cols]);
  const solutions = [];
  for (let m = 0; m < 1 << 16; m += 1) {
    const g = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => (m >> (r * 4 + c)) & 1),
    );
    const q = puzzleClues(g);
    if (JSON.stringify([q.rows, q.cols]) === key) solutions.push(g);
  }
  assert.ok(solutions.length > 1);
  const amb = solve(problem);
  assert.equal(amb.status, 'multiple');
  assert.ok(amb.differing.length > 0);
  for (const [r0, c0] of amb.differing) {
    assert.ok(new Set(solutions.map((g) => g[r0][c0])).size > 1);
  }
});

test('status none from line contradiction', () => {
  const r = solve({
    width: 1,
    height: 1,
    rows: [[{ n: 1, c: 1 }]],
    cols: [[]],
  });
  assert.equal(r.status, 'none');
});

test('status none found only by search', () => {
  // Column and row totals disagree (3 vs 4 filled cells); every line is
  // individually satisfiable, so propagation alone does not notice.
  const one = (n) => [{ n, c: 1 }];
  const problem = {
    width: 4,
    height: 4,
    rows: [[...one(1), ...one(1)], one(1), [], []],
    cols: [one(1), one(1), one(1), one(1)],
  };
  assert.equal(propagate(problem).contradiction, false);
  assert.equal(solve(problem).status, 'none');
});

test('status unknown when budget is exhausted', () => {
  const r = solve(problemFrom(GUESS), { budget: 1 });
  assert.equal(r.status, 'unknown');
  assert.ok(r.unresolved.length > 0);
});
