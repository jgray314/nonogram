// Library tile-set rendering: a set's mosaic of tiles and its Delete set button.
import { tileSolved, tileFace } from '../library-logic.js';
import { elc } from './dom.js';
import { lib, button } from './library-state.js';

/** Draw a solved tile's solution as small cells on a canvas. */
function solutionCanvas(puzzle) {
  const scale = Math.max(1, Math.floor(96 / Math.max(puzzle.width, puzzle.height)));
  const canvas = document.createElement('canvas');
  canvas.width = puzzle.width * scale;
  canvas.height = puzzle.height * scale;
  const ctx = canvas.getContext('2d');
  puzzle.solution.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v < 1) return;
      ctx.fillStyle = puzzle.palette[v - 1].hex;
      ctx.fillRect(c * scale, r * scale, scale, scale);
    }),
  );
  return canvas;
}

function tileNode(set, index) {
  const id = set.tileIds[index];
  const row = Math.floor(index / set.cols);
  const col = index % set.cols;
  const puzzle = id === null ? undefined : set.tiles[id];
  const label = `${row + 1},${col + 1}`;
  if (!puzzle) {
    const missing = elc('div', 'nng-tile nng-tile-missing', `${label} missing`);
    return missing;
  }
  const solved = tileSolved(puzzle, set.saves[id]);
  const tile = elc('a', `nng-tile ${solved ? 'nng-tile-solved' : 'nng-tile-open'}`);
  tile.href = `#/play/${encodeURIComponent(id)}`;
  tile.title = `${set.title} tile ${label}`;
  // D24: a finished set shows the source photo, each tile its own crop, so
  // together they read as the whole image. A tile without a crop keeps its cells.
  const face = tileFace(puzzle, solved, set.progress.complete);
  if (face === 'art') {
    const img = elc('img', 'nng-tile-art');
    img.src = puzzle.art;
    img.alt = '';
    tile.append(img);
  } else if (face === 'cells') tile.append(solutionCanvas(puzzle));
  else tile.textContent = label;
  return tile;
}

/**
 * Tile box size: 96px on the longer side, at the tiles' aspect, so a finished
 * set has no letterboxing. Create slices evenly, so every tile in a set shares
 * the first tile's size.
 */
function tileBox(set) {
  const first = set.tiles[set.tileIds.find((id) => id !== null && set.tiles[id])];
  if (!first) return { w: 96, h: 96 };
  const s = 96 / Math.max(first.width, first.height);
  return { w: Math.round(first.width * s), h: Math.round(first.height * s) };
}

export function setNode(set) {
  const box = elc('div', 'nng-set');
  const head = elc('div', 'nng-set-head');
  head.append(
    elc('strong', null, set.title),
    elc('span', 'nng-lib-meta', `${set.rows} x ${set.cols}`),
    elc(
      'span',
      'nng-set-progress',
      set.progress.complete
        ? '✓ complete'
        : `${set.progress.solved} / ${set.progress.total} solved`,
    ),
  );
  const del = button('Delete set', () => deleteSet(set));
  head.append(del);
  // A finished set drops the gaps between tiles so it reads as one picture.
  const mosaic = elc('div', `nng-mosaic${set.progress.complete ? ' nng-mosaic-complete' : ''}`);
  if (set.progress.complete) {
    const { w, h } = tileBox(set);
    mosaic.style.setProperty('--tile-w', `${w}px`);
    mosaic.style.setProperty('--tile-h', `${h}px`);
  }
  mosaic.style.gridTemplateColumns = `repeat(${set.cols}, var(--tile-w, 96px))`;
  for (let i = 0; i < set.tileIds.length; i++) mosaic.append(tileNode(set, i));
  box.append(head, mosaic);
  return box;
}

function deleteSet(set) {
  if (!confirm(`Delete set "${set.title}", all its tiles and their progress?`)) return;
  for (const id of Object.keys(set.tiles)) lib.store.remove('puzzle', id);
  lib.store.remove('set', set.setId);
  lib.render();
}
