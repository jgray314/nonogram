// Pure game logic for the play view. No DOM.
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { lineClues } from './clues.js';

const copy = (cells) => cells.map((row) => row.slice());
const asLine = (cells) => cells.map((v) => (v >= 1 ? v : 0));

/** True when the filled runs of a line (crosses and unknowns are empty) equal `clues`. */
export function lineSatisfied(lineCells, clues) {
  const runs = lineClues(asLine(lineCells));
  return (
    runs.length === clues.length && runs.every((r, i) => r.n === clues[i].n && r.c === clues[i].c)
  );
}

const column = (cells, c) => cells.map((row) => row[c]);

/** Per-line satisfaction: {rows: bool[], cols: bool[]}. */
export function satisfiedLines(cells, clues) {
  const rows = clues.rows.map((cl, r) => lineSatisfied(cells[r], cl));
  const cols = clues.cols.map((cl, c) => lineSatisfied(column(cells, c), cl));
  return { rows, cols };
}

/** Solved means every clue is satisfied, so an alternate solution counts. */
export function isSolved(cells, clues) {
  const { rows, cols } = satisfiedLines(cells, clues);
  return rows.every(Boolean) && cols.every(Boolean);
}

/** Undo/redo stack of grids. One pushed grid is one undo step. */
export function createHistory(cells) {
  const stack = [copy(cells)];
  let at = 0;
  return {
    push(next) {
      stack.length = at + 1;
      stack.push(copy(next));
      at += 1;
    },
    undo() {
      if (at > 0) at -= 1;
      return copy(stack[at]);
    },
    redo() {
      if (at < stack.length - 1) at += 1;
      return copy(stack[at]);
    },
    current() {
      return copy(stack[at]);
    },
  };
}
