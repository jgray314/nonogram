// Pure helpers for the creator view. No DOM.

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
 *   width, height   chosen grid size (from SIZES)
 *   grid            height x width, 0 empty / 1 filled (the future solution)
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
