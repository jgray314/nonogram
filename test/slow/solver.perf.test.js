import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues } from '../../src/clues.js';
import { solve, DEFAULT_BUDGET } from '../../src/solver.js';

/** Seeded PRNG so the noise grids are the same every run. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Timing guard at the budget the app actually uses (an earlier version ran at
// budget 50 and accepted any status, so it guarded only the clock). Noise
// grids are the realistic worst case for the creator's live report and for
// re-solving imports.
test('25x25 noise at the default budget finishes under 1s per grid', () => {
  const rand = mulberry32(2025);
  for (const density of [0.5, 0.6, 0.7]) {
    for (let k = 0; k < 3; k++) {
      const noise = Array.from({ length: 25 }, () =>
        Array.from({ length: 25 }, () => (rand() < density ? 1 : 0)),
      );
      const { rows, cols } = puzzleClues(noise);
      const t0 = performance.now();
      const result = solve({ width: 25, height: 25, rows, cols }, { budget: DEFAULT_BUDGET });
      const ms = performance.now() - t0;
      assert.ok(ms < 1000, `density ${density} grid ${k} took ${Math.round(ms)}ms`);
      assert.notEqual(result.status, 'none', 'a grid built from real cells always has a solution');
    }
  }
});
