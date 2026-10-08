import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues } from '../src/clues.js';
import { propagate } from '../src/solver.js';

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
