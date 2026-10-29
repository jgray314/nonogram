import { el } from '../dom.js';
import { puzzleId, validatePuzzle, validateSet } from '../../format.js';
import { makeSet } from '../../tiles.js';
import { createStore } from '../../store.js';
import {
  gridSig,
  artSize,
  tileCropRect,
  pickArt,
  withArts,
  buildPuzzleRecord,
  canSave,
  DEFAULT_PALETTE,
  sliceTiles,
  canSaveSet,
  withVerdicts,
  setWrites,
  rollbackTargets,
  existingPuzzle,
} from '../../create-logic.js';

/** @param {import('./context.js').CreateContext} ctx */
export function createSave(ctx) {
  const { st, state, refs } = ctx;
  const { titleInput, saveMsg } = refs;

  function showSaveMessage(text, links = []) {
    saveMsg.replaceChildren(text);
    links.forEach(([label, href], i) => {
      saveMsg.append(i === 0 ? ' ' : ' · ', el('a', { href, text: label }));
    });
  }

  /**
   * The source crop for tile (row, col) as a small JPEG data URL (D14), or
   * undefined for a blank-grid puzzle or when no attempt fits the size limit.
   */
  function artFor(row, col) {
    if (!state.image) return undefined;
    const rect = tileCropRect(ctx.imageSource.currentCrop(), st.tileRows, st.tileCols, row, col);
    return pickArt((side, quality) => {
      const size = artSize(rect.w, rect.h, side);
      const canvas = el('canvas', { width: size.width, height: size.height });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // JPEG has no alpha: transparent pixels would turn black
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingEnabled = size.width <= rect.w; // upscaled pixel art stays blocky
      ctx.drawImage(
        state.image.canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        size.width,
        size.height,
      );
      return canvas.toDataURL('image/jpeg', quality);
    });
  }

  function onSave() {
    return ctx.shell.tiled() ? saveSet() : saveSingle();
  }

  async function saveSingle() {
    const run = state.reportRun;
    if (!canSave(state.reports[0])) return;
    const puzzle = buildPuzzleRecord(
      st.grid,
      titleInput.value,
      state.reports[0].result,
      artFor(0, 0),
      st.palette ?? DEFAULT_PALETTE,
      st.blank ?? undefined,
    );
    puzzle.id = await puzzleId(puzzle);
    // The grid may have changed while the id was computed: never save a verdict
    // that does not match the current grid.
    if (run !== state.reportRun || !canSave(state.reports[0])) return;
    const check = validatePuzzle(puzzle);
    if (!check.ok) {
      showSaveMessage('Could not save: ' + check.error);
      return;
    }
    try {
      const store = createStore();
      // The id is a hash of the grid: the same grid is the same puzzle. Never
      // overwrite it, so a sample keeps its title, verdict and art.
      const have = existingPuzzle(store, puzzle.id);
      if (have !== null) {
        showSaveMessage(`This grid is already in your library as '${have}'.`, [
          ['Open it', '#/play/' + encodeURIComponent(puzzle.id)],
        ]);
        return;
      }
      store.put('puzzle', puzzle);
    } catch {
      showSaveMessage('Could not save: browser storage is full or unavailable.');
      return;
    }
    state.savedSig = gridSig(st);
    showSaveMessage('Saved.', [
      ['Play it', '#/play/' + encodeURIComponent(puzzle.id)],
      ['Library', '#/library'],
    ]);
  }

  /** Save every tile puzzle, then the set record (see setWrites). */
  async function saveSet() {
    const run = state.reportRun;
    if (!canSaveSet(state.reports)) return;
    const title = titleInput.value.trim() || 'Untitled';
    const tiles = sliceTiles(st.grid, st.tileRows, st.tileCols);
    const palette = (st.palette ?? DEFAULT_PALETTE).map((p) => ({ ...p }));
    const made = await makeSet({ title, tiles, palette, blank: st.blank });
    if (run !== state.reportRun || !canSaveSet(state.reports)) return;
    const arts = made.puzzles.map((_, i) => artFor(Math.floor(i / st.tileCols), i % st.tileCols));
    const puzzles = withArts(withVerdicts(made.puzzles, state.reports), arts);
    const bad = puzzles.map(validatePuzzle).find((v) => !v.ok) ?? validateSet(made.set);
    if (!bad.ok) {
      showSaveMessage('Could not save: ' + bad.error);
      return;
    }
    const store = createStore();
    const written = [];
    const writes = setWrites(made.set, puzzles);
    const before = new Set(
      writes
        .filter(({ kind, record }) => store.get(kind, kind === 'set' ? record.setId : record.id))
        .map(({ kind, record }) => `${kind}:${kind === 'set' ? record.setId : record.id}`),
    );
    try {
      for (const { kind, record } of writes) {
        store.put(kind, record);
        written.push({ kind, record });
      }
    } catch {
      // Leave no half-written set behind.
      for (const [kind, id] of rollbackTargets(written, (k, i) => before.has(`${k}:${i}`))) {
        try {
          store.remove(kind, id);
        } catch {
          // best effort
        }
      }
      showSaveMessage('Could not save: browser storage is full or unavailable.');
      return;
    }
    state.savedSig = gridSig(st);
    showSaveMessage('Saved set.', [['Library', '#/library']]);
  }

  return { onSave };
}
