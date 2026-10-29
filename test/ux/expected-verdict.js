// What the solver worker should have stored for a puzzle, computed here with the
// pure solver on the puzzle's own solution. The pipeline checks compare the
// stored verdict to this, so a worker that returns a plausible constant (or the
// right shape with wrong content) is caught; the worker path is what is tested,
// not the solver.
import { puzzleClues } from '../../src/clues.js';
import { verdictOf } from '../../src/create-logic.js';
import { solveAndRate } from '../../src/personas.js';

/** The verdict Create and import should store for `puzzle`, via the same steps as the worker. */
export function expectedVerdict(puzzle) {
  const { rows, cols } = puzzleClues(puzzle.solution);
  return verdictOf(solveAndRate({ width: puzzle.width, height: puzzle.height, rows, cols }, {}));
}

/** Throws unless `puzzle.verdict` has the expected status and sweep count. */
export function assertWorkerVerdict(puzzle, label = 'puzzle') {
  const want = expectedVerdict(puzzle);
  const got = puzzle.verdict;
  if (!got || got.status !== want.status || got.sweeps !== want.sweeps) {
    throw new Error(
      `${label} verdict is ${JSON.stringify(got)}, the solver says ${JSON.stringify(want)}`,
    );
  }
  return want;
}
