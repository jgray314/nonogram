import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues } from '../src/clues.js';
import { propagate, solve, solveLine } from '../src/solver.js';
import { lineClues } from '../src/clues.js';

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
  const solutions = (masksBySignature.get(signature(problem)) ?? []).map(gridFromMask);
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

// ---- Step 4b: verification -------------------------------------------------

const N4 = 4;
const gridFromMask = (m) =>
  Array.from({ length: N4 }, (_, r) =>
    Array.from({ length: N4 }, (_, c) => (m >> (r * N4 + c)) & 1),
  );
const signature = (p) => JSON.stringify([p.rows, p.cols]);

/** Seeded PRNG so "random" fixtures are reproducible. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every 4x4 grid, grouped by clue signature: the true solutions of each clue set.
const masksBySignature = new Map();
for (let m = 0; m < 1 << 16; m += 1) {
  const key = signature(puzzleClues(gridFromMask(m)));
  if (!masksBySignature.has(key)) masksBySignature.set(key, []);
  masksBySignature.get(key).push(m);
}

function checkVerdict(m) {
  const p = problemFrom(gridFromMask(m));
  const truth = masksBySignature.get(signature(p)).length;
  const r = solve(p, { budget: 100000 });
  if (truth === 1) {
    assert.ok(
      r.status === 'unique-line-solvable' || r.status === 'unique-needs-guessing',
      `mask ${m}: expected unique, got ${r.status}`,
    );
  } else {
    assert.equal(r.status, 'multiple', `mask ${m}`);
  }
}

// The full 65,536-grid version lives in test/slow/solver.exhaustive.test.js.
test('seeded 4x4 cross-check sample', () => {
  const rand = mulberry32(12345);
  for (let i = 0; i < 500; i += 1) checkVerdict(Math.floor(rand() * 65536));
});

test('capped search reports unknown, never unique', () => {
  const rand = mulberry32(777);
  let sawUnknown = false;
  for (let i = 0; i < 500; i += 1) {
    const m = Math.floor(rand() * 65536);
    const p = problemFrom(gridFromMask(m));
    const r = solve(p, { budget: 0 });
    assert.notEqual(r.status, 'unique-needs-guessing');
    assert.notEqual(r.status, 'multiple');
    if (r.status === 'unknown') {
      sawUnknown = true;
      assert.ok(r.unresolved.length > 0);
    }
  }
  assert.ok(sawUnknown);
  assert.equal(solve(problemFrom(GUESS), { budget: 1 }).status, 'unknown');
});

/** Naive oracle: try all 2^n fillings of a line against clues and known cells. */
function bruteLine(clues, known) {
  const n = known.length;
  const want = JSON.stringify(clues);
  const options = [];
  for (let m = 0; m < 1 << n; m += 1) {
    const line = Array.from({ length: n }, (_, i) => (m >> i) & 1);
    if (known.some((k, i) => k !== null && k !== line[i])) continue;
    if (JSON.stringify(lineClues(line)) === want) options.push(line);
  }
  if (options.length === 0) return null;
  return known.map((_, i) => (options.every((o) => o[i] === options[0][i]) ? options[0][i] : null));
}

function bruteFixpoint(p) {
  const g = Array.from({ length: p.height }, () => Array(p.width).fill(null));
  for (let changed = true; changed;) {
    changed = false;
    for (let r = 0; r < p.height; r += 1) {
      const res = bruteLine(p.rows[r], g[r]);
      if (!res) return { contradiction: true };
      res.forEach((v, c) => {
        if (g[r][c] !== v) ((g[r][c] = v), (changed = true));
      });
    }
    for (let c = 0; c < p.width; c += 1) {
      const res = bruteLine(
        p.cols[c],
        g.map((row) => row[c]),
      );
      if (!res) return { contradiction: true };
      res.forEach((v, r) => {
        if (g[r][c] !== v) ((g[r][c] = v), (changed = true));
      });
    }
  }
  return { contradiction: false, grid: g };
}

// The full all-4x4 version lives in test/slow/solver.exhaustive.test.js.
test('brute line oracle agrees on all 4x4 (sample)', () => {
  const seen = new Set();
  const pick = mulberry32(4242);
  for (let i = 0; i < 150; i += 1) {
    const m = Math.floor(pick() * 65536);
    const p = problemFrom(gridFromMask(m));
    const key = signature(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const oracle = bruteFixpoint(p);
    const dp = propagate(p);
    assert.equal(dp.contradiction, oracle.contradiction, `mask ${m}`);
    if (!oracle.contradiction) assert.deepEqual(dp.grid, oracle.grid, `mask ${m}`);
  }
  // Single lines, including partially known ones.
  const rand = mulberry32(99);
  for (let i = 0; i < 1000; i += 1) {
    const line = Array.from({ length: 6 }, () => (rand() < 0.5 ? 1 : 0));
    const known = line.map((v) => (rand() < 0.3 ? v : null));
    assert.deepEqual(solveLine(lineClues(line), known), bruteLine(lineClues(line), known));
  }
});

test('25x25 line-solvable rings solve in under 1s', () => {
  // Concentric rings: hand-made rule, line-solvable.
  const rings = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 25 }, (_, c) => (Math.min(r, c, 24 - r, 24 - c) % 2 === 0 ? 1 : 0)),
  );
  const t0 = performance.now();
  const easy = solve(problemFrom(rings));
  assert.ok(performance.now() - t0 < 1000);
  assert.equal(easy.status, 'unique-line-solvable');
  assert.deepEqual(easy.grid, rings);
});

// The 25x25 noise timing guard at the app's budget lives in test/slow/solver.perf.test.js.
