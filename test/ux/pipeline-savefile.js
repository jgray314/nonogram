// End-to-end save-file round trip through Play's Export save and Import save
// buttons. Both handlers have no unit test, so this is their safety net. The
// puzzle comes from the real Create flow; every expected value below comes from
// the clicks this check makes or from localStorage, never from the handlers.
import { createStore } from '../../src/store.js';
import { captureDownload, createAndSave, pickFile, resetStore, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const PUZZLE_IMAGE = 'sample-images/cat-15x15.png';
const OTHER_IMAGE = 'sample-images/banana-10x10.png';
const SIZE = 15;
// Moves, as [row, col]. In cat-15x15 (see pipeline-mono's golden) the first three
// are filled cells and the last two are blank. (0, 8) is a deliberately WRONG
// fill: the puzzle has a unique solution, so it costs one heart. (0, 9) is
// crossed by right-click.
const RIGHT_FILLS = [
  [2, 3],
  [2, 4],
  [3, 3],
];
const WRONG_FILL = [0, 8];
const CROSS = [0, 9];
const TOOLBAR_FILE = '.nng-toolbar input[type=file]';

export const SAVEFILE_CHECKS = [
  {
    id: 'pipeline-save-file-round-trip',
    name: 'Export save then Import save restores cells, hearts and time; a file adds a missing puzzle; a bad file is refused (pipeline)',
    async run(app) {
      const stored = (kind, id) => createStore(app.win().localStorage).get(kind, id);
      const raw = (kind, id) => app.win().localStorage.getItem(`nng:${kind}:${id}`);
      // The grid as the player sees it: 'f' filled, 'x' crossed, '.' unknown.
      const domGrid = () =>
        Array.from({ length: SIZE }, (_, r) =>
          Array.from({ length: SIZE }, (_, c) => {
            const n = app.cell(r, c);
            return n.classList.contains('nng-filled')
              ? 'f'
              : n.classList.contains('nng-crossed')
                ? 'x'
                : '.';
          }).join(''),
        );
      const savedGrid = (cells) =>
        cells.map((row) => row.map((v) => (v >= 1 ? 'f' : v === -1 ? 'x' : '.')).join(''));
      const showsGrid = (expected) => () =>
        app.$$('.nng-cell').length === SIZE * SIZE && domGrid().join('|') === expected.join('|');
      const msg = () => app.$('.nng-toolbar .nng-msg')?.textContent ?? '';
      const heartsShown = () => app.$$('.nng-hearts .nng-heart-full').length;

      // 1. Clean store, real Create flow, then play with known moves.
      await app.open('#/library');
      resetStore(app);
      const id = await createAndSave(app, PUZZLE_IMAGE);
      await app.open(`#/play/${id}`);
      await waitFor(() => app.$$('.nng-cell').length === SIZE * SIZE, 'play grid', 5000);
      assert(heartsShown() === 3, `expected 3 hearts at the start, saw ${heartsShown()}`);
      const fresh = domGrid(); // the starting grid: only auto-crossed empty lines
      for (const [r, c] of RIGHT_FILLS) {
        assert(fresh[r][c] === '.', `cell ${r},${c} should start unknown, was ${fresh[r][c]}`);
        app.stroke([[r, c]]);
      }
      app.stroke([WRONG_FILL]);
      app.stroke([CROSS], 2);
      for (const [r, c] of RIGHT_FILLS) {
        assert(domGrid()[r][c] === 'f', `cell ${r},${c} should be filled after the click`);
      }
      assert(domGrid()[CROSS[0]][CROSS[1]] === 'x', 'right-click should cross cell 0,9');
      assert(
        domGrid()[WRONG_FILL[0]][WRONG_FILL[1]] === 'x',
        'a wrong fill should be marked crossed',
      );
      assert(heartsShown() === 2, `one wrong fill should leave 2 hearts, saw ${heartsShown()}`);
      const played = domGrid();
      assert(played.join('|') !== fresh.join('|'), 'the moves changed nothing');
      await waitFor(() => stored('save', id), 'a stored save after the moves');
      const save1 = stored('save', id);
      assert(
        savedGrid(save1.cells).join('|') === played.join('|'),
        `the stored save differs from the grid on screen: ${savedGrid(save1.cells).join('|')}`,
      );
      assert(save1.hearts === 2, `stored hearts ${save1.hearts}, expected 2`);

      // 2. Export.
      const download = await captureDownload(app, () => app.buttonByText('Export save').click());
      assert(
        /\.nng\.json$/.test(download.name),
        `download name "${download.name}" is not *.nng.json`,
      );
      const exportedText = await download.text();
      const file = JSON.parse(exportedText);
      assert(file.kind === 'nng-save' && file.v === 1, `file kind/version: ${file.kind}/${file.v}`);
      assert(file.puzzle?.id === id, `file names puzzle ${file.puzzle?.id}, expected ${id}`);
      assert(
        file.save?.puzzleId === id,
        `file save names puzzle ${file.save?.puzzleId}, expected ${id}`,
      );
      assert(
        savedGrid(file.save.cells).join('|') === played.join('|'),
        `exported cells differ from the cells played: ${savedGrid(file.save.cells).join('|')}`,
      );
      assert(file.save.hearts === 2, `exported hearts ${file.save.hearts}, expected 2`);
      assert(
        typeof file.save.elapsedMs === 'number' && file.save.elapsedMs === save1.elapsedMs,
        `exported elapsedMs ${file.save.elapsedMs} differs from the stored ${save1.elapsedMs}`,
      );

      // 3. Restart (confirm answered yes): the grid is back to its start.
      const restarts = await app.withConfirm(true, async () =>
        app.buttonByText('Restart', '.nng-rules').click(),
      );
      assert(restarts === 1, `Restart asked ${restarts} confirms, expected 1`);
      assert(domGrid().join('|') === fresh.join('|'), 'Restart did not empty the grid');
      assert(heartsShown() === 3, `Restart left ${heartsShown()} hearts, expected 3`);
      assert(stored('save', id)?.hearts === 3, 'Restart should store 3 hearts');

      // 4. Import the exported file into the same puzzle. The save exists, so the
      // app asks before replacing it; the remount shows the imported cells.
      const blob = new (app.win().Blob)([exportedText], { type: 'application/json' });
      const asked = await app.withConfirm(true, async () => {
        pickFile(app, TOOLBAR_FILE, blob, 'mine.nng.json');
        await waitFor(showsGrid(played), 'the imported cells on screen', 10000);
      });
      assert(asked === 1, `Import asked ${asked} confirms about replacing, expected 1`);
      assert(heartsShown() === 2, `after import ${heartsShown()} hearts shown, expected 2`);
      const save2 = stored('save', id);
      assert(
        savedGrid(save2.cells).join('|') === played.join('|'),
        `stored cells after import: ${savedGrid(save2.cells).join('|')}`,
      );
      assert(save2.hearts === 2, `stored hearts after import ${save2.hearts}, expected 2`);
      assert(
        save2.elapsedMs >= file.save.elapsedMs,
        `stored elapsedMs ${save2.elapsedMs} is below the exported ${file.save.elapsedMs}`,
      );

      // 5. Wipe everything, play a different puzzle, import the same file: the
      // file carries its puzzle, so the app adds it and opens it with the cells.
      resetStore(app);
      await app.open('#/library');
      const otherId = await createAndSave(app, OTHER_IMAGE);
      assert(otherId !== id, 'the other puzzle should have a different id');
      await app.open(`#/play/${otherId}`);
      await waitFor(() => app.$$('.nng-cell').length > 0, 'the other puzzle grid', 5000);
      assert(!stored('puzzle', id) && !stored('save', id), 'the wipe left the first puzzle behind');
      const askedFresh = await app.withConfirm(false, async () => {
        pickFile(app, TOOLBAR_FILE, blob, 'mine.nng.json');
        await waitFor(() => stored('puzzle', id), 'the imported puzzle to be stored', 20000);
        await waitFor(showsGrid(played), 'the imported puzzle on screen with its cells', 10000);
      });
      assert(askedFresh === 0, `a new puzzle should not ask to replace, asked ${askedFresh}`);
      assert(
        app.win().location.hash === `#/play/${encodeURIComponent(id)}`,
        'import did not open the puzzle',
      );
      const added = stored('puzzle', id);
      assert(
        JSON.stringify(added.solution) === JSON.stringify(file.puzzle.solution) &&
          added.width === SIZE &&
          added.height === SIZE,
        'the added puzzle differs from the one in the file',
      );
      const save3 = stored('save', id);
      assert(
        savedGrid(save3.cells).join('|') === played.join('|') && save3.hearts === 2,
        'the stored save after adding the puzzle differs from the exported one',
      );
      assert(stored('puzzle', otherId), 'the other puzzle should be untouched');
      assert(!stored('save', otherId), 'the other puzzle should have no save');

      // 6. Bad files are refused and leave the stored state exactly as it was.
      const before = {
        puzzle: raw('puzzle', id),
        save: raw('save', id),
        other: raw('puzzle', otherId),
      };
      const badSave = JSON.parse(exportedText);
      badSave.save.cells[0][0] = 9; // not a value the puzzle allows
      const badId = JSON.parse(exportedText);
      badId.puzzle.solution[0][0] = badId.puzzle.solution[0][0] ? 0 : 1; // id no longer matches the content
      for (const [label, bad, expected] of [
        ['cells that do not fit', badSave, /^Import failed: save: /],
        ['a puzzle that does not match its id', badId, /^Import failed: puzzle id does not match/],
      ]) {
        const badBlob = new (app.win().Blob)([JSON.stringify(bad)], { type: 'application/json' });
        const askedBad = await app.withConfirm(true, async () => {
          app.$('.nng-toolbar .nng-msg').textContent = ''; // the previous refusal must not satisfy the wait
          pickFile(app, TOOLBAR_FILE, badBlob, 'bad.nng.json');
          await waitFor(() => /^Import failed/.test(msg()), `an error message for ${label}`, 10000);
        });
        assert(expected.test(msg()), `message for ${label} reads "${msg()}"`);
        assert(askedBad === 0, `${label}: asked to replace progress before refusing`);
        assert(raw('puzzle', id) === before.puzzle, `${label}: the puzzle record changed`);
        assert(raw('save', id) === before.save, `${label}: the save record changed`);
        assert(raw('puzzle', otherId) === before.other, `${label}: another puzzle changed`);
        assert(showsGrid(played)(), `${label}: the grid on screen changed`);
      }
    },
  },
];
