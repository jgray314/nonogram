// Split one image into an R x C set of independent puzzles (PLAN.md step 12b).
import { cellLuminance, otsu, binarize } from './image.js';
import { puzzleId } from './format.js';

/**
 * Binarize the whole crop once, then slice. A single threshold over the whole
 * image is deliberate: a threshold per tile would show seams in the mosaic.
 */
export function tileGrid(
  rgba,
  imgW,
  imgH,
  crop,
  tileW,
  tileH,
  R,
  C,
  { threshold, invert } = /** @type {{ threshold?: number, invert?: boolean }} */ ({}),
) {
  const lum = cellLuminance(rgba, imgW, imgH, crop, C * tileW, R * tileH);
  const t = threshold ?? otsu(lum.flat());
  const full = binarize(lum, t, invert);
  const tiles = [];
  for (let r = 0; r < R; r++) {
    const rowTiles = [];
    for (let c = 0; c < C; c++) {
      rowTiles.push(
        full.slice(r * tileH, (r + 1) * tileH).map((row) => row.slice(c * tileW, (c + 1) * tileW)),
      );
    }
    tiles.push(rowTiles);
  }
  return { full, tiles };
}

async function sha16(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/**
 * Build the set record and one puzzle record per tile (row-major). `blank`,
 * when given, is the color puzzle's blank color (D29), on every tile.
 */
export async function makeSet({ title, tiles, palette, blank = null }) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const full = [];
  for (let r = 0; r < rows; r++) {
    for (let y = 0; y < tiles[r][0].length; y++) {
      full.push(tiles[r].flatMap((tile) => tile[y]));
    }
  }
  // setId is deterministic: first 16 hex chars of SHA-256 over the JSON of
  // {title, rows, cols, full grid}, so re-creating the same set from the same
  // image yields the same id instead of a duplicate library entry.
  const setId = await sha16(JSON.stringify({ title, rows, cols, full }));

  const puzzles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const solution = tiles[row][col];
      const puzzle = {
        v: 1,
        id: '',
        title: `${title} r${row + 1}c${col + 1}`,
        width: solution[0].length,
        height: solution.length,
        palette,
        solution,
        verdict: null,
        set: { id: setId, row, col },
      };
      if (blank) puzzle.blank = blank;
      puzzle.id = await puzzleId(puzzle);
      puzzles.push(puzzle);
    }
  }
  const set = { v: 1, setId, title, rows, cols, tileIds: puzzles.map((p) => p.id) };
  return { set, puzzles };
}

export function tileFlags(tile) {
  const cells = tile.flat();
  if (cells.every((v) => v === 0)) return 'blank';
  if (cells.every((v) => v !== 0)) return 'full';
  return null;
}
