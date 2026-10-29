// What the solver worker should have stored for a puzzle, computed here with the
// pure solver on the puzzle's own solution. The pipeline checks compare the
// stored verdict to this, so a worker that returns a plausible constant (or the
// right shape with wrong content) is caught; the worker path is what is tested,
// not the solver.
import { puzzleClues } from '../../src/clues.js';
import { solveAndRate } from '../../src/personas.js';

/**
 * The verdict Create and import should store for `puzzle`: the solver's status
 * and sweeps, plus the persona tier when it has one. Spelled out here rather
 * than through `verdictOf`, so a bug in `verdictOf` (a dropped field) is caught.
 */
export function expectedVerdict(puzzle) {
  const { rows, cols } = puzzleClues(puzzle.solution);
  const r = solveAndRate({ width: puzzle.width, height: puzzle.height, rows, cols }, {});
  return { status: r.status, sweeps: r.sweeps, ...(r.tier ? { tier: r.tier } : {}) };
}

/** Key-sorted JSON, so two equal verdicts compare equal whatever their key order. */
const stable = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

/** Throws unless `puzzle.verdict` equals the expected verdict: status, sweeps and tier. */
export function assertWorkerVerdict(puzzle, label = 'puzzle') {
  const want = expectedVerdict(puzzle);
  const got = puzzle.verdict;
  if (stable(got) !== stable(want)) {
    throw new Error(`${label} verdict is ${stable(got)}, the solver says ${stable(want)}`);
  }
  return want;
}
