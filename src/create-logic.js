// Pure helpers for the creator view. No DOM.
import { difficultyLabel } from './difficulty.js';

export const SIZES = [5, 10, 15, 20, 25];
export const LONG_SIDE = 15;
export const MAX_LOAD_SIDE = 1024;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Closest SIZES value to `target`; ties go to the larger one. */
function nearestSize(target) {
  let best = SIZES[0];
  for (const s of SIZES) {
    if (Math.abs(s - target) <= Math.abs(best - target)) best = s;
  }
  return best;
}

/** Long side 15; short side the SIZES value closest to 15 * short / long (min 5). */
export function defaultSize(imgW, imgH) {
  const long = Math.max(imgW, imgH);
  const short = Math.min(imgW, imgH);
  const s = Math.max(5, nearestSize((LONG_SIDE * short) / long));
  return imgW >= imgH ? { width: LONG_SIDE, height: s } : { width: s, height: LONG_SIDE };
}

/**
 * Largest crop with the grid's aspect ratio, centered then shifted by offset
 * pixels and clamped inside the image. Integer pixels.
 */
export function centerCrop(imgW, imgH, gridW, gridH, offset = { dx: 0, dy: 0 }) {
  let w;
  let h;
  if (imgW * gridH >= imgH * gridW) {
    h = imgH;
    w = Math.max(1, Math.min(imgW, Math.floor((imgH * gridW) / gridH)));
  } else {
    w = imgW;
    h = Math.max(1, Math.min(imgH, Math.floor((imgW * gridH) / gridW)));
  }
  const x = clamp(Math.round((imgW - w) / 2 + (offset.dx ?? 0)), 0, imgW - w);
  const y = clamp(Math.round((imgH - h) / 2 + (offset.dy ?? 0)), 0, imgH - h);
  return { x, y, w, h };
}

/** Scale (<= 1) that caps the long side at 1024 px. */
export function loadScale(w, h) {
  const long = Math.max(w, h);
  return long > MAX_LOAD_SIDE ? MAX_LOAD_SIDE / long : 1;
}

/** All-zero grid, `height` rows of `width` cells. */
export function blankGrid(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(0));
}

/**
 * Editor state shape (owned by views/create.js, which mutates it):
 *   width, height   chosen size (from SIZES); per-tile size when tiles > 1
 *   tileRows, tileCols  tile counts (1 to 4); 1x1 is a normal single puzzle
 *   grid            full grid, (tileRows x height) by (tileCols x width) of 0/1
 *                   (the future solution; for 1x1 it is height x width)
 *   hasImage        true once an image has been decoded
 *   manualEdits     true when cells were hand-edited since the last regeneration
 *   offset          {dx, dy} crop shift in image pixels
 *   threshold       0..255 luminance cutoff
 *   autoThreshold   true while the threshold follows otsu
 *   invert          boolean
 */
export function newEditorState({ width = 15, height = 15 } = {}) {
  return {
    width,
    height,
    grid: blankGrid(width, height),
    hasImage: false,
    manualEdits: false,
    tileRows: 1,
    tileCols: 1,
    offset: { dx: 0, dy: 0 },
    threshold: 128,
    autoThreshold: true,
    invert: false,
  };
}

/** Regenerating from the image would discard hand edits: ask first. */
export function regenerateNeedsConfirm(hasManualEdits) {
  return Boolean(hasManualEdits);
}

const STATUS_TEXT = {
  'unique-line-solvable': 'One solution, solvable by line logic alone.',
  'unique-needs-guessing': 'One solution, but solving needs guessing.',
  multiple: 'More than one solution. Highlighted cells differ between two of them.',
  none: 'No solution fits these clues.',
  unknown: 'Could not decide: the search ran out of budget.',
};

/**
 * Turn a solver result (or null while checking) into what the report shows:
 * {text, label, highlight}. `highlight` is the cells to mark: the differing
 * cells for `multiple`, the unresolved cells for `unique-needs-guessing`.
 */
export function reportView(result) {
  if (!result) return { text: 'Checking...', label: 'Unchecked', highlight: [] };
  const label = difficultyLabel({ status: result.status, sweeps: result.sweeps });
  let highlight = [];
  if (result.status === 'multiple') highlight = result.differing;
  else if (result.status === 'unique-needs-guessing') highlight = result.unresolved;
  return {
    text: STATUS_TEXT[result.status] ?? result.status,
    label,
    highlight: highlight.map(([r, c]) => [r, c]),
  };
}

export const DEFAULT_PALETTE = [{ name: 'black', hex: '#000000' }];

/**
 * Puzzle record for a grid and the solver result it was checked with. `id` is
 * left empty: the caller fills it with `await puzzleId(record)`.
 */
export function buildPuzzleRecord(grid, title, report) {
  return {
    v: 1,
    id: '',
    title: title.trim() || 'Untitled',
    width: grid[0].length,
    height: grid.length,
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    solution: grid.map((row) => row.slice()),
    verdict: { status: report.status, sweeps: report.sweeps },
  };
}

/**
 * Saving is allowed only when a result for the current grid has arrived:
 * `{phase, result}` with phase 'fresh'. Never a pending, stale or failed one.
 */
export function canSave({ phase, result }) {
  return phase === 'fresh' && Boolean(result);
}

// --- tile sets (step 12c) ---

/** Allowed values for the tile rows / columns pickers. */
export const TILE_COUNTS = [1, 2, 3, 4];

/** Size of the full grid when `width` x `height` is the per-tile size. */
export function fullSize(width, height, rows, cols) {
  return { width: width * cols, height: height * rows };
}

/** Slice a full grid into tiles[row][col]; tile size is grid size / count. */
export function sliceTiles(grid, rows, cols) {
  const tileH = grid.length / rows;
  const tileW = grid[0].length / cols;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      grid.slice(r * tileH, (r + 1) * tileH).map((row) => row.slice(c * tileW, (c + 1) * tileW)),
    ),
  );
}

/** One line of the per-tile status list, e.g. "r2c1: Not fair (blank)". */
export function tileStatusLine(row, col, result, flag) {
  const name = `r${row + 1}c${col + 1}`;
  if (!result) return `${name}: checking...`;
  const label = difficultyLabel({ status: result.status, sweeps: result.sweeps });
  return flag ? `${name}: ${label} (${flag})` : `${name}: ${label}`;
}

/** A set can be saved only when every tile has a fresh report. */
export function canSaveSet(reports) {
  return reports.length > 0 && reports.every(canSave);
}

/** Copies of the row-major `puzzles` with each tile's verdict filled in. */
export function withVerdicts(puzzles, reports) {
  return puzzles.map((p, i) => ({
    ...p,
    verdict: { status: reports[i].result.status, sweeps: reports[i].result.sweeps },
  }));
}

/**
 * Ordered writes for saving a set: every tile puzzle first, then the set
 * record, so a half-written set never points at missing tiles.
 */
export function setWrites(set, puzzles) {
  return [...puzzles.map((record) => ({ kind: 'puzzle', record })), { kind: 'set', record: set }];
}

/**
 * Which of a half-finished set save's writes to undo. Records that existed
 * before the save (a re-saved identical set reuses ids) are kept, along with
 * the progress saved against them (gate pass 1, M4).
 */
export function rollbackTargets(written, existedBefore) {
  return written
    .map(({ kind, record }) => [kind, kind === 'set' ? record.setId : record.id])
    .filter(([kind, id]) => !existedBefore(kind, id));
}
