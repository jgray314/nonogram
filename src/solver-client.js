// Promise wrapper over the solver Web Worker, shared by Create (live report) and
// the import paths (re-rating imported puzzles).
import { puzzleClues } from './clues.js';
import { verdictOf } from './create-logic.js';

/** Thin promise wrapper over the solver Web Worker. */
export function createSolverClient() {
  const worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let nextId = 0;
  worker.onmessage = (e) => {
    const entry = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    entry?.resolve(e.data.result);
  };
  worker.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error('solver failed'));
    waiting.clear();
  };
  return {
    solve(input) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, input, opts: {} });
      });
    },
    terminate() {
      worker.terminate();
      for (const entry of waiting.values()) entry.reject(new Error('cancelled'));
      waiting.clear();
    },
  };
}

/**
 * A `rate(puzzle) → Promise<verdict>` over a solver client: the same input and
 * verdict shape Create saves (status, sweeps, and the persona tier when set).
 */
export function ratePuzzleWith(solver) {
  return async (puzzle) => {
    const { rows, cols } = puzzleClues(puzzle.solution);
    const result = await solver.solve({ width: puzzle.width, height: puzzle.height, rows, cols });
    return verdictOf(result);
  };
}
