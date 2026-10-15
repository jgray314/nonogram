// Pure game logic for the play view. No DOM.
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { lineClues } from './clues.js';
import { isFair } from './difficulty.js';
import { applyStroke, strokeCells } from './play-state.js';

/** Hearts a fresh game starts with. */
export const MAX_HEARTS = 3;

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
    canUndo() {
      return at > 0;
    },
    canRedo() {
      return at < stack.length - 1;
    },
  };
}

/**
 * A cell to reveal (D17): always one the solution fills, never an empty cell.
 * It comes from the row or column with the fewest unknown cells that still has
 * an unfilled solution cell (ties: rows before columns, then the first line).
 * Returns {r, c, value: the solution color}, or null when every fill is done.
 */
export function hintCell(cells, solution) {
  const h = cells.length;
  const w = h ? cells[0].length : 0;
  const open = (r, c) => solution[r][c] >= 1 && cells[r][c] !== solution[r][c];
  let best = null;
  const consider = (positions) => {
    const first = positions.find(([r, c]) => open(r, c));
    if (!first) return;
    const unknown = positions.filter(([r, c]) => cells[r][c] === 0).length;
    if (!best || unknown < best.unknown) best = { unknown, r: first[0], c: first[1] };
  };
  for (let r = 0; r < h; r++) consider(Array.from({ length: w }, (_, c) => [r, c]));
  for (let c = 0; c < w; c++) consider(Array.from({ length: h }, (_, r) => [r, c]));
  return best && { r: best.r, c: best.c, value: solution[best.r][best.c] };
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

/** The [r, c] cells that differ between two same-size grids, in reading order. */
export function changedCells(a, b) {
  const out = [];
  a.forEach((row, r) => row.forEach((v, c) => v !== b[r][c] && out.push([r, c])));
  return out;
}

/** Mistake marks, hearts and hints compare against the stored solution, so they need a unique puzzle. */
export function helpersAvailability(verdict) {
  if (isFair(verdict)) return { enabled: true, note: '' };
  return {
    enabled: false,
    // Hearts share this requirement (heartsAvailable), so one note covers all three.
    note: 'Hearts, mistake marks and hints need a puzzle with a unique solution.',
  };
}

/** Cross every unknown cell in a line whose clue list is empty. Other cells are unchanged. */
export function crossEmptyLines(cells, clues) {
  const next = copy(cells);
  for (let r = 0; r < next.length; r++) {
    for (let c = 0; c < next[r].length; c++) {
      if (next[r][c] === 0 && (clues.rows[r].length === 0 || clues.cols[c].length === 0)) {
        next[r][c] = -1;
      }
    }
  }
  return next;
}

/**
 * Apply a stroke under the hearts rule. The mode comes from applyStroke; the
 * changed cells are walked in stroke order. A fill on a cell the solution
 * leaves empty becomes a cross instead and ends the walk, so cells before it
 * stay. Returns {next, wrong: [r, c] | null}. Monochrome only.
 */
export function heartsStroke(cells, stroke, solution) {
  const full = applyStroke(cells, stroke);
  const next = copy(cells);
  for (const [r, c] of strokeCells(cells, stroke)) {
    if (full[r][c] === cells[r][c]) continue;
    if (full[r][c] >= 1 && solution[r][c] === 0) {
      next[r][c] = -1;
      return { next, wrong: [r, c] };
    }
    next[r][c] = full[r][c];
  }
  return { next, wrong: null };
}

/** Hearts need the stored solution to be the only one. */
export function heartsAvailable(verdict) {
  return isFair(verdict);
}

/**
 * Fill every cell when every row is one run the full width: the all-filled
 * twin of an all-blank tile, so it starts solved (D24). Other grids unchanged.
 */
export function fillFullPuzzle(cells, clues) {
  const width = cells[0]?.length ?? 0;
  const full = clues.rows.every((runs) => runs.length === 1 && runs[0].n === width);
  if (!full) return cells;
  return cells.map((row, r) => row.map(() => clues.rows[r][0].c));
}

/** The starting grid for a fresh game and for Restart: blank, with empty lines crossed (or all filled, D24). */
export function restartCells(clues, width, height) {
  const blank = Array.from({ length: height }, () => new Array(width).fill(0));
  return fillFullPuzzle(crossEmptyLines(blank, clues), clues);
}

/** The Restart confirm text; it says only what resets in the current mode. */
export function restartPrompt(zen) {
  return zen
    ? "Restart this puzzle? The grid, timer and hints reset, and Zen mode stays on. This can't be undone."
    : "Restart this puzzle? The grid, timer, hearts and hints reset. This can't be undone.";
}

/** mm:ss for a play time in milliseconds. */
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** The solved line: the time, plus the hints used when there were any (D18). */
export function solvedSummary(elapsedMs, hints) {
  const base = `Solved in ${formatTime(elapsedMs)}`;
  return hints > 0 ? `${base} · ${hints} ${hints === 1 ? 'hint' : 'hints'}` : base;
}
