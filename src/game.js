// Pure game logic for the play view. No DOM.
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { lineClues } from './clues.js';
import { isFair } from './difficulty.js';

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

/** Filled cells whose solution value is empty. Wrong crosses are never flagged. */
export function wrongFills(cells, solution) {
  const out = [];
  cells.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v >= 1 && solution[r][c] === 0) out.push([r, c]);
    }),
  );
  return out;
}

/**
 * The first row-major cell whose state disagrees with the solution, with the
 * value that fixes it: the filled color, or -1 (crossed) for an empty cell.
 */
export function hintCell(cells, solution) {
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const want = solution[r][c] === 0 ? -1 : solution[r][c];
      if (cells[r][c] !== want) return { r, c, value: want };
    }
  }
  return null;
}

/**
 * Cross the unknown cells of satisfied lines. With `before`, only lines that
 * were not already satisfied in `before` count, so a cell the player cleared
 * in an older satisfied line is not crossed again.
 */
export function autoCross(cells, clues, before = null) {
  const now = satisfiedLines(cells, clues);
  const old = before ? satisfiedLines(before, clues) : null;
  const next = copy(cells);
  const wants = (flags, was, i) => flags[i] && !(was && was[i]);
  for (let r = 0; r < next.length; r++) {
    for (let c = 0; c < next[r].length; c++) {
      if (next[r][c] !== 0) continue;
      if (wants(now.rows, old?.rows, r) || wants(now.cols, old?.cols, c)) next[r][c] = -1;
    }
  }
  return next;
}

/** Check and hint compare against the stored solution, so they need a unique puzzle. */
export function helpersAvailability(verdict) {
  if (isFair(verdict)) return { enabled: true, note: '' };
  return {
    enabled: false,
    note: 'Check and hint need a puzzle with a unique solution.',
  };
}
