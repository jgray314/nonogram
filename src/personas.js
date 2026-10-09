/**
 * Difficulty personas (difficulty-personas.md). Each persona is a solver that
 * knows only some techniques; a puzzle's tier is the least skilled persona who
 * finishes it without guessing. Monochrome only: the line techniques read run
 * lengths and ignore color (color mode is backlog).
 */
import { propagate } from './solver.js';

export const TIERS = ['newcomer', 'casual', 'regular', 'expert', 'guess'];

// Trial propagations the Expert may spend before giving up (one-cell trials).
// Past it the tier is 'guess': the harder label, never a false Easy.
export const PROBE_BUDGET = 4000;

const sum = (ns) => ns.reduce((a, b) => a + b, 0);

/** Overlap (simple boxes) and unreachable cells (simple spaces) for runs packed into [lo, hi). */
function overlap(ns, lo, hi, out) {
  if (ns.length === 0) {
    for (let x = lo; x < hi; x += 1) if (out[x] === null) out[x] = 0;
    return;
  }
  const slack = hi - lo - (sum(ns) + ns.length - 1);
  if (slack < 0) return;
  const cover = new Array(hi - lo).fill(false);
  let start = 0;
  for (const n of ns) {
    for (let x = start + slack; x < start + n; x += 1) if (out[lo + x] === null) out[lo + x] = 1;
    for (let x = start; x < start + n + slack; x += 1) cover[x] = true;
    start += n + 1;
  }
  cover.forEach((c, x) => {
    if (!c && out[lo + x] === null) out[lo + x] = 0;
  });
}

/** Every fill placed: cross the rest (what auto-cross, D19, does for the player). */
function crossWhenFilled(ns, out) {
  if (out.filter((v) => v === 1).length !== sum(ns)) return out;
  return out.map((v) => (v === null ? 0 : v));
}

/** Newcomer: overlap on a blank line (which also settles empty and full lines), cross when filled. */
function newcomerLine(clues, known) {
  const ns = clues.map((cl) => cl.n);
  const out = known.slice();
  if (known.every((v) => v === null)) overlap(ns, 0, known.length, out);
  return crossWhenFilled(ns, out);
}

/**
 * Casual: the Newcomer, plus trimming crossed cells off both ends and redoing
 * overlap on what's left, and growing the first or last run from a filled cell
 * at the edge of that span.
 */
function casualLine(clues, known) {
  const ns = clues.map((cl) => cl.n);
  let out = newcomerLine(clues, known);
  for (let pass = 0; pass < 4 && ns.length > 0; pass += 1) {
    let lo = 0;
    let hi = out.length;
    while (lo < hi && out[lo] === 0) lo += 1;
    while (hi > lo && out[hi - 1] === 0) hi -= 1;
    overlap(ns, lo, hi, out);
    const first = ns[0];
    if (out[lo] === 1) {
      for (let x = lo; x < lo + first && x < hi; x += 1) out[x] = 1;
      if (lo + first < out.length && out[lo + first] === null) out[lo + first] = 0;
    }
    const last = ns[ns.length - 1];
    if (out[hi - 1] === 1) {
      for (let x = hi - 1; x >= hi - last && x >= lo; x -= 1) out[x] = 1;
      if (hi - last - 1 >= 0 && out[hi - last - 1] === null) out[hi - last - 1] = 0;
    }
    out = crossWhenFilled(ns, out);
  }
  return out;
}

/** Sweep rows then columns with `lineFn` until nothing changes; true when every cell is decided. */
function finishes(problem, lineFn) {
  const { width, height, rows, cols } = problem;
  const grid = Array.from({ length: height }, () => new Array(width).fill(null));
  for (let changed = true; changed;) {
    changed = false;
    for (let r = 0; r < height; r += 1) {
      const res = lineFn(rows[r], grid[r]);
      for (let c = 0; c < width; c += 1)
        if (grid[r][c] !== res[c]) {
          grid[r][c] = res[c];
          changed = true;
        }
    }
    for (let c = 0; c < width; c += 1) {
      const res = lineFn(
        cols[c],
        grid.map((row) => row[c]),
      );
      for (let r = 0; r < height; r += 1)
        if (grid[r][c] !== res[r]) {
          grid[r][c] = res[r];
          changed = true;
        }
    }
  }
  return grid.every((row) => !row.includes(null));
}

/**
 * Expert: full line logic plus one-cell trials. Assume a value, line-solve, and
 * when that contradicts, the cell is the other value. True when that finishes
 * within PROBE_BUDGET trials.
 */
function expertFinishes(problem) {
  let { grid } = propagate(problem);
  let trials = 0;
  for (let progress = true; progress;) {
    progress = false;
    for (let r = 0; r < problem.height; r += 1) {
      for (let c = 0; c < problem.width; c += 1) {
        if (grid[r][c] !== null) continue;
        for (const v of [1, 0]) {
          if (trials >= PROBE_BUDGET) return false;
          trials += 1;
          const trial = grid.map((row) => row.slice());
          trial[r][c] = v;
          if (!propagate(problem, trial).contradiction) continue;
          const next = grid.map((row) => row.slice());
          next[r][c] = v === 1 ? 0 : 1;
          grid = propagate(problem, next).grid;
          progress = true;
          break;
        }
      }
    }
  }
  return grid.every((row) => !row.includes(null));
}

/**
 * Tier for a solved puzzle: `problem` is {width, height, rows, cols} (clues as
 * {n, c}), `status` the solver's verdict status. null when the puzzle isn't
 * fair. A line-solvable puzzle is at most 'regular' (the app's line solver is
 * the Regular persona), so only needs-guessing puzzles pay for the Expert.
 */
export function personaTier(problem, status) {
  if (status === 'unique-line-solvable') {
    if (finishes(problem, newcomerLine)) return 'newcomer';
    if (finishes(problem, casualLine)) return 'casual';
    return 'regular';
  }
  if (status === 'unique-needs-guessing') return expertFinishes(problem) ? 'expert' : 'guess';
  return null;
}

// Line techniques, exported for tests.
export { newcomerLine, casualLine };
