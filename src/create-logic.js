// Pure helpers for the creator view. No DOM.
import { difficultyLabel } from './difficulty.js';
import { createHistory } from './game.js';
import { ART_PREFIX, MAX_ART_CHARS } from './format.js';

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

/**
 * A source whose own size is a preset on both sides (pixel art) keeps it.
 * Otherwise: long side 15; short side the SIZES value closest to 15 * short / long (min 5).
 */
export function defaultSize(imgW, imgH) {
  if (SIZES.includes(imgW) && SIZES.includes(imgH)) return { width: imgW, height: imgH };
  const long = Math.max(imgW, imgH);
  const short = Math.min(imgW, imgH);
  const s = Math.max(5, nearestSize((LONG_SIDE * short) / long));
  return imgW >= imgH ? { width: LONG_SIDE, height: s } : { width: s, height: LONG_SIDE };
}

/**
 * Undo/redo for hand edits: game.js's createHistory plus what the Undo and Redo
 * buttons need to know. A regenerate (threshold, size, invert) makes a new one.
 */
export function createEditHistory(grid) {
  const inner = createHistory(grid);
  let at = 0;
  let last = 0;
  return {
    push(next) {
      inner.push(next);
      at += 1;
      last = at;
    },
    undo() {
      if (at > 0) at -= 1;
      return inner.undo();
    },
    redo() {
      if (at < last) at += 1;
      return inner.redo();
    },
    current: () => inner.current(),
    canUndo: () => at > 0,
    canRedo: () => at < last,
  };
}

/** A string that changes whenever the saved-or-not content of the editor changes. */
export function gridSig(st) {
  return JSON.stringify([st.tileRows, st.tileCols, st.grid]);
}

/**
 * True while the editor holds work that was not saved: a loaded image or filled
 * cells, and not exactly what the last successful save wrote (`savedSig`).
 */
export function hasUnsavedWork(st, savedSig) {
  return (st.hasImage || hasFilledCell(st.grid)) && gridSig(st) !== savedSig;
}

const MAX_TITLE = 60;

/** A puzzle title from a file name: extension dropped, `-` and `_` become spaces. */
export function titleFromFile(name) {
  const base = String(name ?? '')
    .trim()
    .replace(/\.[^./\\]*$/, '')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE)
    .trim();
  return base || 'Untitled';
}

/** True when at least one cell of the grid is filled. */
export function hasFilledCell(grid) {
  return grid.some((row) => row.some((v) => v !== 0));
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

// --- source-crop art for the solve reveal (D14) ---

export const ART_MAX_SIDE = 320;
/** [long side, JPEG quality] to try in order until the data URL fits MAX_ART_CHARS. */
export const ART_ATTEMPTS = [
  [ART_MAX_SIDE, 0.8],
  [ART_MAX_SIDE, 0.6],
  [240, 0.6],
  [160, 0.5],
];

/** Size of a w x h source scaled to at most `maxSide` on the long side, never upscaled. */
export function artSize(w, h, maxSide = ART_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** The part of the `crop` rect {x, y, w, h} that one tile of a rows x cols set covers. */
export function tileCropRect(crop, rows, cols, row, col) {
  const edge = (start, len, n, i) => start + Math.round((len * i) / n);
  const x0 = edge(crop.x, crop.w, cols, col);
  const x1 = edge(crop.x, crop.w, cols, col + 1);
  const y0 = edge(crop.y, crop.h, rows, row);
  const y1 = edge(crop.y, crop.h, rows, row + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * First JPEG data URL from `encode(longSide, quality)` that fits the art
 * contract, trying smaller and lower quality each time. undefined when none
 * fits: the puzzle is then saved without art.
 */
export function pickArt(encode) {
  for (const [side, quality] of ART_ATTEMPTS) {
    const url = encode(side, quality);
    if (typeof url === 'string' && url.startsWith(ART_PREFIX) && url.length <= MAX_ART_CHARS) {
      return url;
    }
  }
  return undefined;
}

/** Copies of `puzzles` with `arts[i]` set as each one's art, where there is one. */
export function withArts(puzzles, arts) {
  return puzzles.map((p, i) => (arts[i] ? { ...p, art: arts[i] } : { ...p }));
}

/**
 * Puzzle record for a grid and the solver result it was checked with. `id` is
 * left empty: the caller fills it with `await puzzleId(record)`. `art`, when
 * given, is the optional source-crop JPEG data URL.
 */
export function buildPuzzleRecord(grid, title, report, art) {
  const record = {
    v: 1,
    id: '',
    title: title.trim() || 'Untitled',
    width: grid[0].length,
    height: grid.length,
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    solution: grid.map((row) => row.slice()),
    verdict: { status: report.status, sweeps: report.sweeps },
  };
  if (art) record.art = art;
  return record;
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
