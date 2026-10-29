// Play view: persistence module (load, snapshot, save, export and import).
import { elc } from '../dom.js';
import { sameGrid } from './util.js';
import {
  MAX_HEARTS,
  createHistory,
  crossEmptyLines,
  fillFullPuzzle,
  isSolved,
  restartCells,
} from '../../game.js';
import { validateSave, idMatches } from '../../format.js';
import { serializeSaveFile, parseSaveFile, importWrites } from '../../save.js';
import { rateImports } from '../../backup.js';
import { createSolverClient, ratePuzzleWith } from '../../solver-client.js';

/**
 * The load block: builds the initial state from the stored save, if any, and
 * returns the loaded save record (or null). Called once, before the context exists.
 * @param {{ puzzle: any, store: any, state: any, rules: any, clues: any }} parts
 * @param {Record<string, string>} prefKeys
 */
export function loadSave({ puzzle, store, state, rules, clues }, prefKeys) {
  state.cells = restartCells(clues, puzzle.width, puzzle.height); // a fresh game starts where Restart does
  state.elapsedMs = 0;
  state.solvedAt = null;
  state.hearts = MAX_HEARTS;
  state.hints = 0; // reveals used on this play-through; undo doesn't refund them (D18)
  state.wrongMark = null; // [r, c] of the last wrong fill; memory only, cleared on the next move
  state.dirty = false;
  const existing = store ? store.get('save', puzzle.id) : null;
  const loaded = existing && validateSave(existing, puzzle).ok ? existing : null;
  // No save yet: the rule switches start from what the player last chose (D16).
  // A hand-edited pref can't break play: Zen needs a literal true, and Auto-cross
  // a literal false to turn off.
  if (!loaded && store) {
    rules.zen = store.getPref(prefKeys.zen, false) === true;
    // Auto-cross is on unless the player turned it off (D19).
    rules.autoCross = store.getPref(prefKeys.autoCross, true) !== false;
  }
  if (loaded) {
    state.cells = loaded.cells.map((row) => row.slice());
    state.elapsedMs = loaded.elapsedMs;
    state.solvedAt = loaded.solvedAt;
    state.hearts = loaded.hearts ?? MAX_HEARTS;
    state.hints = loaded.hints ?? 0;
    for (const key of Object.keys(rules)) rules[key] = loaded.rules[key] === true;
  }
  // A loaded save gets empty lines crossed too (v1 saves had none), and an
  // all-filled puzzle filled (D24), before the history, so they are not an
  // undo step. It does not mark the save dirty. A save that ran out of hearts
  // is not filled: that would turn a lost game into a solve.
  state.cells = crossEmptyLines(state.cells, clues);
  const lost = loaded && rules.zen !== true && state.hearts === 0 && state.solvedAt === null;
  if (!lost) state.cells = fillFullPuzzle(state.cells, clues);
  // The clock starts with the first move, so opening or restarting a puzzle and
  // looking at it leaves it "not started" in the library.
  state.started =
    state.elapsedMs > 0 || !sameGrid(state.cells, restartCells(clues, puzzle.width, puzzle.height));
  state.history = createHistory(state.cells);
  // A puzzle can be satisfied before any move: an all-blank or all-filled tile.
  // Count it solved on open.
  if (state.solvedAt === null && isSolved(state.cells, clues)) {
    state.solvedAt = Date.now();
    state.dirty = true;
  }
  return loaded;
}

/**
 * @param {import('./context.js').PlayContext} ctx
 */
export function createPersist(ctx) {
  const { puzzle, store, state, rules, refs } = ctx;
  const loaded = ctx.loaded;
  const { pendingNotes, clearPersistNow, remount } = ctx;
  const { exportBtn, importBtn, fileInput, message } = refs;

  const snapshot = () => ({
    puzzleId: puzzle.id,
    cells: state.cells,
    elapsedMs: state.elapsedMs,
    rules: { ...rules },
    solvedAt: state.solvedAt,
    hearts: state.hearts,
    hints: state.hints,
  });
  function persist() {
    if (!store || !(state.dirty || loaded)) return;
    try {
      store.put('save', snapshot());
    } catch {
      // Storage full or unavailable: play on; the next save may succeed.
    }
  }

  function attachHandlers() {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([serializeSaveFile(puzzle, snapshot())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = elc('a');
      a.href = url;
      a.download = `${(puzzle.title || 'puzzle').replace(/[^\w-]+/g, '-')}.nng.json`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (!store) {
        message.textContent = 'Import failed: storage unavailable';
        return;
      }
      // A player who leaves mid-import must not have this handler clear the next
      // view's save hook or navigate them back.
      const gen = ctx.generation();
      const live = () => gen === ctx.generation();
      const parsed = parseSaveFile(await file.text());
      if (!live()) return;
      if (!parsed.ok) {
        message.textContent = `Import failed: ${parsed.error}`;
        return;
      }
      const idOk = await idMatches(parsed.puzzle);
      if (!live()) return;
      if (!idOk) {
        message.textContent = 'Import failed: puzzle id does not match its content';
        return;
      }
      if (
        store.get('save', parsed.puzzle.id) &&
        !confirm('Replace your saved progress on this puzzle?')
      ) {
        return;
      }
      let writes = importWrites(parsed, store);
      const addsPuzzle = writes[0].kind === 'puzzle';
      // The file's verdict is only a claim: re-solve a puzzle before it is stored.
      if (writes[0].kind === 'puzzle') {
        message.textContent = 'Checking the imported puzzle…';
        // Created inside the try: `new Worker` can throw synchronously.
        let solver;
        try {
          solver = createSolverClient();
          const [rated] = await rateImports([writes[0].record], ratePuzzleWith(solver));
          writes = [{ kind: 'puzzle', record: rated }, ...writes.slice(1)];
        } catch {
          if (live()) message.textContent = 'Import failed: the solver could not check the puzzle';
          return;
        } finally {
          solver?.terminate();
        }
      }
      // The replace was confirmed, so the import is written even if the player has
      // left; only the page updates below need this mount.
      try {
        for (const w of writes) store.put(w.kind, w.record);
      } catch {
        if (live()) message.textContent = 'Import failed: could not write to storage';
        return;
      }
      if (!live()) return;
      // Drop the live state so unmount does not overwrite the imported save.
      clearPersistNow();
      // Only a puzzle this import added can have lost its picture: an existing one keeps its own.
      if (addsPuzzle && parsed.artDropped) {
        pendingNotes.set(
          parsed.puzzle.id,
          "The imported puzzle's picture was dropped (not a small JPEG).",
        );
      }
      const target = `#/play/${encodeURIComponent(parsed.puzzle.id)}`;
      if (location.hash === target) {
        remount({ id: parsed.puzzle.id });
      } else {
        location.hash = target;
      }
    });
  }

  return { snapshot, persist, attachHandlers };
}
