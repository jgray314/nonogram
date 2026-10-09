// Per-number clue progress for the play view. Pure, no DOM.
// Two rules (D11, D13): with a unique solution, a number is done once its
// solution block is filled (solutionProgress); wrong fills are caught on the
// spot in both modes, so this reveals nothing. Without a unique solution there
// is no answer to compare against, so a number is done only when its block is
// closed in at the matching position from either edge (clueProgress).
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { lineSatisfied } from './game.js';

/**
 * Scan a line in one direction. Returns {done, used}: how many leading clues
 * (in scan order) are done, and how many cells the scan consumed. Crossed
 * cells are skipped, an unknown cell stops the scan, and a filled run counts
 * only if both sides are the line edge or a cross. `limit` caps `done`.
 */
function scan(line, clues, limit) {
  let done = 0;
  let i = 0;
  while (i < line.length && done < limit) {
    const v = line[i];
    if (v === -1) {
      i += 1;
      continue;
    }
    if (v === 0) break;
    let j = i;
    while (j < line.length && line[j] === v) j += 1;
    const closed = j === line.length || line[j] === -1; // the start side is an edge or a skipped cross
    const clue = clues[done];
    if (!closed || clue.n !== j - i || clue.c !== v) break;
    done += 1;
    i = j;
  }
  return { done, used: i };
}

function lineProgress(lineCells, clues) {
  const flags = clues.map(() => false);
  if (clues.length === 0) return flags;
  if (lineSatisfied(lineCells, clues)) return flags.fill(true);
  const start = scan(lineCells, clues, clues.length);
  const fromStart = start.done;
  // The end scan sees only cells the start scan did not consume, so one run
  // can never be matched from both ends. The first unconsumed cell is unknown,
  // or the start of a run the start scan rejected (with an edge or a cross
  // before it), so treating the cut as an edge closes nothing wrongly.
  const { done: fromEnd } = scan(
    lineCells.slice(start.used).reverse(),
    clues.slice().reverse(),
    clues.length - fromStart,
  );
  for (let k = 0; k < fromStart; k += 1) flags[k] = true;
  for (let k = 0; k < fromEnd; k += 1) flags[clues.length - 1 - k] = true;
  return flags;
}

/** {rows: boolean[][], cols: boolean[][]}: one flag per clue number. */
export function clueProgress(cells, clues) {
  const rows = clues.rows.map((cl, r) => lineProgress(cells[r], cl));
  const cols = clues.cols.map((cl, c) =>
    lineProgress(
      cells.map((row) => row[c]),
      cl,
    ),
  );
  return { rows, cols };
}

/** One flag per solution block in a line: true when every cell of the block is filled with its color. */
function blocksFilled(lineCells, lineSolution) {
  const flags = [];
  let i = 0;
  while (i < lineSolution.length) {
    const v = lineSolution[i];
    if (v === 0) {
      i += 1;
      continue;
    }
    let j = i;
    let filled = true;
    while (j < lineSolution.length && lineSolution[j] === v) {
      if (lineCells[j] !== v) filled = false;
      j += 1;
    }
    flags.push(filled);
    i = j;
  }
  return flags;
}

/** Hearts-mode progress, same shape as clueProgress: a number is done when its solution block is filled. */
export function solutionProgress(cells, solution) {
  const column = (grid, c) => grid.map((row) => row[c]);
  return {
    rows: solution.map((line, r) => blocksFilled(cells[r], line)),
    cols: solution[0].map((_, c) => blocksFilled(column(cells, c), column(solution, c))),
  };
}
