// Pure helpers for saving from the creator view: source-crop art, puzzle records, tile sets. No DOM.
import { difficultyLabel } from './difficulty.js';
import { ART_PREFIX, MAX_ART_CHARS } from './format.js';
import { DEFAULT_PALETTE, verdictOf } from './create-verdict.js';

// --- source-crop art for the solve reveal (D14) ---

export const ART_MAX_SIDE = 320;
export const ART_MIN_SIDE = 160;
/** [long side, JPEG quality] to try in order until the data URL fits MAX_ART_CHARS. */
export const ART_ATTEMPTS = [
  [ART_MAX_SIDE, 0.8],
  [ART_MAX_SIDE, 0.6],
  [240, 0.6],
  [160, 0.5],
];

/**
 * Size of a w x h source scaled to at most `maxSide` on the long side. A tiny
 * source (pixel art) is scaled up to ART_MIN_SIDE, in whole steps so each pixel
 * stays a crisp block; otherwise it is never upscaled.
 */
export function artSize(w, h, maxSide = ART_MAX_SIDE) {
  const long = Math.max(w, h);
  const up =
    long < ART_MIN_SIDE ? Math.max(1, Math.floor(Math.min(ART_MIN_SIDE, maxSide) / long)) : 1;
  const scale = Math.min(up, maxSide / long);
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
 * given, is the optional source-crop JPEG data URL. `palette` defaults to black.
 * `blank`, when given, is a color puzzle's blank color (D29).
 */
export function buildPuzzleRecord(grid, title, report, art, palette = DEFAULT_PALETTE, blank) {
  const record = {
    v: 1,
    id: '',
    title: title.trim() || 'Untitled',
    width: grid[0].length,
    height: grid.length,
    palette: palette.map((p) => ({ name: p.name, hex: p.hex })),
    solution: grid.map((row) => row.slice()),
    verdict: verdictOf(report),
  };
  if (art) record.art = art;
  if (blank) record.blank = blank;
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
export function tileStatusLine(row, col, result, flag, size = null) {
  const name = `r${row + 1}c${col + 1}`;
  if (!result) return `${name}: checking...`;
  const label = difficultyLabel(verdictOf(result), size);
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
    verdict: verdictOf(reports[i].result),
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
 * the progress saved against them.
 */
export function rollbackTargets(written, existedBefore) {
  return written
    .map(({ kind, record }) => [kind, kind === 'set' ? record.setId : record.id])
    .filter(([kind, id]) => !existedBefore(kind, id));
}
