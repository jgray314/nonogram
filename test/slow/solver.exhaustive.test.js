import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues, lineClues } from '../../src/clues.js';
import { propagate, solve } from '../../src/solver.js';

const N = 4;
const gridFromMask = (m) =>
  Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (m >> (r * N + c)) & 1));
const problemFor = (g) => ({
  width: N,
  height: N,
  ...puzzleClues(g),
});
const signature = (p) => JSON.stringify([p.rows, p.cols]);

test('exhaustive 4x4 cross-check', () => {
  // True solution count per clue signature, over every 4x4 grid.
  const counts = new Map();
  for (let m = 0; m < 1 << 16; m += 1) {
    const key = signature(puzzleClues(gridFromMask(m)));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let m = 0; m < 1 << 16; m += 1) {
    const p = problemFor(gridFromMask(m));
    const truth = counts.get(signature(p));
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
        if (g[r][c] !== v) {
          g[r][c] = v;
          changed = true;
        }
      });
    }
    for (let c = 0; c < p.width; c += 1) {
      const res = bruteLine(
        p.cols[c],
        g.map((row) => row[c]),
      );
      if (!res) return { contradiction: true };
      res.forEach((v, r) => {
        if (g[r][c] !== v) {
          g[r][c] = v;
          changed = true;
        }
      });
    }
  }
  return { contradiction: false, grid: g };
}

test('brute line oracle agrees on all 4x4', () => {
  const seen = new Set();
  for (let m = 0; m < 1 << 16; m += 1) {
    const p = problemFor(gridFromMask(m));
    const key = signature(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const oracle = bruteFixpoint(p);
    const dp = propagate(p);
    assert.equal(dp.contradiction, oracle.contradiction, `mask ${m}`);
    if (!oracle.contradiction) {
      assert.deepEqual(dp.grid, oracle.grid, `mask ${m}`);
    }
  }
});
