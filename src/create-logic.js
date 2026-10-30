// Pure helpers for the creator view. No DOM. Verdicts and save logic live in
// create-verdict.js and create-save-logic.js, re-exported at the foot of this file.

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

/** A string that changes whenever the saved-or-not content of the editor changes. */
export function gridSig(st) {
  return JSON.stringify([st.tileRows, st.tileCols, st.grid, st.palette ?? null]);
}

/**
 * True while the editor holds work that was not saved: a loaded image or filled
 * cells, and not exactly what the last successful save wrote (`savedSig`).
 */
export function hasUnsavedWork(st, savedSig) {
  return (st.hasImage || hasFilledCell(st.grid)) && gridSig(st) !== savedSig;
}

/** The stored puzzle's title when `id` is already in the library, else null. */
export function existingPuzzle(store, id) {
  const found = store.get('puzzle', id);
  return found ? String(found.title ?? '') : null;
}

const CLUE_W = 22; // css/base.css --clue-w
const GRID_CHROME = 20; // the grid's padding and a little slack

/**
 * Cell size (px) that fits a grid into `availWidth` on a narrow screen: the
 * width left after the clue columns, split across the cells; 12 to 24.
 */
export function narrowCellSize(availWidth, cols, clueCols) {
  const fit = Math.floor((availWidth - clueCols * CLUE_W - GRID_CHROME) / cols);
  return clamp(fit, 12, 24);
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
 * Editor state shape (owned by views/create/index.js, which mutates it):
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
    // Color (D25): colors is 0 for two-tone, or 3 to 5 in total with the
    // blank; palette is the inks from the image ({name, hex}[]), null for two-tone;
    // brush is the ink a left-drag paints; blank is the image's blank color
    // ('#rrggbb', D29), null for two-tone.
    colors: 0,
    palette: null,
    blank: null,
    brush: 1,
  };
}

/** Regenerating from the image would discard hand edits: ask first. */
export function regenerateNeedsConfirm(hasManualEdits) {
  return Boolean(hasManualEdits);
}

export * from './create-verdict.js';
export * from './create-save-logic.js';
