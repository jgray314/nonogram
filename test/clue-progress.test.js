import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clueProgress, solutionProgress } from '../src/clue-progress.js';

const k = (...ns) => ns.map((n) => ({ n, c: 1 }));
// One-row puzzle helper: row clues + the row, columns left empty-ish.
const row = (cells, ...ns) =>
  clueProgress([cells], { rows: [k(...ns)], cols: cells.map(() => []) }).rows[0];

test('closed run at the start marks the first number', () => {
  assert.deepEqual(row([1, 1, -1, 0, 0, 0], 2, 1), [true, false]);
});

test('run touching an unknown cell is not done', () => {
  assert.deepEqual(row([1, 1, 0, 0, 0, 0], 2, 1), [false, false]);
});

test('scan from the end marks the last number', () => {
  assert.deepEqual(row([0, 0, 0, -1, 1, 1], 1, 2), [false, true]);
});

test('wrong-length closed run stops the scan', () => {
  // The 1-run is closed but the first clue is 2, so the start scan stops there.
  // The 3 is still marked, by the scan from the end.
  assert.deepEqual(row([1, -1, 1, 1, 1, -1], 2, 3), [false, true]);
});

test('satisfied line marks every number', () => {
  assert.deepEqual(row([1, 0, 1, 1, 0], 1, 2), [true, true]);
});

test('empty clue line has no numbers', () => {
  const p = clueProgress([[-1, -1]], { rows: [[]], cols: [[], []] });
  assert.deepEqual(p.rows, [[]]);
  assert.deepEqual(p.cols, [[], []]);
});

test('scan from the start skips leading crosses', () => {
  assert.deepEqual(row([-1, -1, 1, -1, 0, 0], 1, 1), [true, false]);
});

test('one filled run never marks two numbers', () => {
  // Gate pass 2, M1: with no unknown cells both scans crossed the whole line
  // and matched the same run from each end. A wrong cross is free in hearts
  // mode, so this line is reachable in play.
  assert.deepEqual(row([1, -1, -1], 1, 1), [true, false]);
  assert.deepEqual(row([-1, 1, -1], 1, 1), [true, false]);
});

test('two-color runs: a closed run of the wrong color is not done', () => {
  const clues = {
    rows: [
      [
        { n: 1, c: 1 },
        { n: 1, c: 2 },
      ],
    ],
    cols: [[], [], [], []],
  };
  assert.deepEqual(clueProgress([[2, -1, 0, 0]], clues).rows[0], [false, false]);
  assert.deepEqual(clueProgress([[1, -1, 0, 0]], clues).rows[0], [true, false]);
});

test('adjacent runs of different colors are not closed by each other', () => {
  const clues = {
    rows: [
      [
        { n: 1, c: 1 },
        { n: 1, c: 2 },
        { n: 1, c: 1 },
      ],
    ],
    cols: [[], [], []],
  };
  assert.deepEqual(clueProgress([[1, 2, 0]], clues).rows[0], [false, false, false]);
});

test('columns are scanned too', () => {
  const clues = { rows: [[], [], []], cols: [k(1, 1)] };
  assert.deepEqual(clueProgress([[1], [-1], [0]], clues).cols[0], [true, false]);
});

// Hearts mode (D11): a number is done once its block in the solution is filled.
const SOL = [
  [1, 1, 0, 1],
  [0, 1, 0, 1],
];

test('hearts rule: a complete block is done without crosses around it', () => {
  const cells = [
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ];
  assert.deepEqual(solutionProgress(cells, SOL).rows[0], [true, false]);
});

test('hearts rule: a partly filled block is not done', () => {
  const cells = [
    [1, 0, 0, 1],
    [0, 0, 0, 0],
  ];
  assert.deepEqual(solutionProgress(cells, SOL).rows[0], [false, true]);
});

test('hearts rule: columns follow the same rule', () => {
  const cells = [
    [0, 1, 0, 1],
    [0, 1, 0, 0],
  ];
  // Columns of SOL: [1,0], [1,1], [0,0], [1,1].
  assert.deepEqual(solutionProgress(cells, SOL).cols, [[false], [true], [], [false]]);
});

test('hearts rule: a block filled with the wrong color is not done', () => {
  assert.deepEqual(solutionProgress([[2, 2]], [[1, 1]]).rows[0], [false]);
});
