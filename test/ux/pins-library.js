// Pin checks for the Library view (found unchecked by mutating it before it was
// split, docs/plans/line-cap-300-audit-library.md). It has no unit test, so these
// drive the real view. Expected
// values come from records built in harness-library.js, from storage and from
// the downloaded file, never from the code under test.
import { captureDownload, pause, resetStore, waitFor } from './harness.js';
import { assertWorkerVerdict } from './expected-verdict.js';
import {
  TWO_INKS,
  backupText,
  failNthWrite,
  hookWorker,
  importDone,
  importText,
  makePuzzle,
  makeSave,
  makeSet,
  nngKeys,
  openLibraryWith,
  rawOf,
  statusText,
  storeOf,
  toolbarButtons,
  trapErrors,
  withFalseVerdict,
} from './harness-library.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const MONO_A = ['10110', '01101', '11011', '00100', '10011'];
const MONO_D = ['11000', '01100', '00110', '00011', '10001'];
const MONO_E = ['00100', '01110', '11111', '01110', '00100'];
const COLOR_C = ['12012', '21021', '01210', '12102', '20121'];
const TILE_1 = ['101', '010', '101'];
const TILE_2 = ['110', '011', '101'];

const bare = (rec) => JSON.stringify({ ...rec, verdict: undefined });
const noToolbarLeft = (app) => toolbarButtons(app).every((b) => !b.disabled);

async function libraryParts() {
  const a = await makePuzzle('Linecap A', MONO_A);
  const c = await makePuzzle('Linecap C', COLOR_C, { palette: TWO_INKS, blank: '#f4f4f4' });
  return { a, c };
}

async function setParts() {
  const set = { id: 'set-linecap', row: 0, col: 0 };
  const t1 = await makePuzzle('Linecap tile 1', TILE_1, { set });
  const t2 = await makePuzzle('Linecap tile 2', TILE_2, { set: { ...set, col: 1 } });
  return { t1, t2, record: makeSet('set-linecap', 'Linecap set', [t1, t2], 2) };
}

export const PINS_LIBRARY_CHECKS = [
  {
    id: 'pin-library-forged-import',
    name: 'Importing a backup drops a puzzle whose id does not match, and its save, says so, and re-rates the genuine records (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      const saveA = makeSave(a);
      const forged = { ...a, id: '0123456789abcdef', title: 'Linecap forged' };
      const saveForged = { ...makeSave(a), puzzleId: forged.id };
      await openLibraryWith(app);
      importText(
        app,
        backupText({
          puzzles: [withFalseVerdict(a), withFalseVerdict(c), withFalseVerdict(forged)],
          saves: [saveA, saveForged],
        }),
      );
      const status = await importDone(app);
      assert(
        status ===
          `Imported 3 records, 1 invalid skipped (puzzle ${forged.id}: id does not match content).`,
        `status after the forged import reads "${status}"`,
      );
      assert(rawOf(app, 'puzzle', forged.id) === null, 'the forged puzzle was written');
      assert(rawOf(app, 'save', forged.id) === null, 'the save of the forged puzzle was written');
      assert(!app.doc().body.textContent.includes('Linecap forged'), 'the forged puzzle is listed');
      for (const [label, p] of [
        ['mono', a],
        ['color', c],
      ]) {
        const got = storeOf(app).get('puzzle', p.id);
        assert(got, `the genuine ${label} puzzle was not restored`);
        assertWorkerVerdict(got, `restored ${label} puzzle`);
        assert(bare(got) === bare(p), `the ${label} record changed in the import`);
      }
      assert(
        JSON.stringify(storeOf(app).get('save', a.id)) === JSON.stringify(saveA),
        'the genuine save was not restored as it was',
      );
      assert(noToolbarLeft(app), 'the toolbar stayed disabled after the import');
    },
  },
  {
    id: 'pin-library-export-round-trip',
    name: 'Export, wipe, import keeps puzzles, a set with its tiles and saves; the export counts corrupt sets (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      const { t1, t2, record } = await setParts();
      const saves = [makeSave(a), makeSave(t1)];
      await openLibraryWith(app, { puzzles: [a, c, t1, t2], saves, sets: [record] });
      // Three corrupt records, one of each kind; none can be exported.
      const ls = app.win().localStorage;
      ls.setItem('nng:puzzle:bad', '{"v":1}');
      ls.setItem('nng:set:bad', '{"v":1,"setId":"bad"}');
      ls.setItem('nng:save:orphan', '{"puzzleId":"orphan"}');

      const download = await captureDownload(app, () => app.buttonByText('Export library').click());
      assert(
        /^nonogram-library-\d{4}-\d{2}-\d{2}\.json$/.test(download.name),
        `export file is named "${download.name}"`,
      );
      const text = await download.text();
      const file = JSON.parse(text);
      const ids = (list, key) => list.map((r) => r[key]).sort();
      assert(
        JSON.stringify(ids(file.puzzles, 'id')) ===
          JSON.stringify([a.id, c.id, t1.id, t2.id].sort()),
        'the export holds the wrong puzzles',
      );
      assert(
        JSON.stringify(ids(file.saves, 'puzzleId')) === JSON.stringify([a.id, t1.id].sort()),
        'the export holds the wrong saves',
      );
      assert(
        file.sets?.length === 1 && JSON.stringify(file.sets[0]) === JSON.stringify(record),
        'the export is missing the set, or changed it',
      );
      assert(
        statusText(app) === 'Library exported. 3 corrupt records were left out.',
        `export status reads "${statusText(app)}"`,
      );

      resetStore(app);
      await app.open('#/library');
      assert(nngKeys(app).length === 0, 'the wipe left records behind');
      importText(app, text);
      const status = await importDone(app);
      assert(status === 'Imported 7 records.', `import status reads "${status}"`);
      for (const p of [a, c, t1, t2]) {
        const got = storeOf(app).get('puzzle', p.id);
        assert(got, `puzzle "${p.title}" is missing after the round trip`);
        assertWorkerVerdict(got, p.title);
        assert(bare(got) === bare(p), `puzzle "${p.title}" changed in the round trip`);
      }
      assert(
        JSON.stringify(storeOf(app).get('set', record.setId)) === JSON.stringify(record),
        'the set changed in the round trip',
      );
      for (const s of saves) {
        assert(
          JSON.stringify(storeOf(app).get('save', s.puzzleId)) === JSON.stringify(s),
          `the save for ${s.puzzleId} changed in the round trip`,
        );
      }
      const sets = app.$$('.nng-set');
      assert(sets.length === 1 && sets[0].textContent.includes('Linecap set'), 'set not shown');
      assert(sets[0].querySelectorAll('.nng-tile').length === 2, 'set should show 2 tiles');
    },
  },
  {
    id: 'pin-library-import-status',
    name: 'The import status names puzzles that already existed, caps the invalid list at 3 and counts dropped pictures (library)',
    async run(app) {
      const d = await makePuzzle('Linecap D', MONO_D);
      const e = { ...(await makePuzzle('Linecap E', MONO_E)), art: 'data:image/jpeg;base64,AAAA' };
      const invalid = [1, 2, 3, 4].map((n) => ({ v: 1, id: `bad${n}` }));
      await openLibraryWith(app, { puzzles: [d] });
      importText(app, backupText({ puzzles: [d, e, ...invalid] }));
      const status = await importDone(app);
      assert(
        /^Imported 1 record, 1 already existed, 4 invalid skipped \((puzzle bad\d: [^;]+; ){3}\.\.\.\), 1 picture dropped \(not a small JPEG\)\.$/.test(
          status,
        ),
        `status reads "${status}"`,
      );
      const got = storeOf(app).get('puzzle', e.id);
      assert(got && got.art === undefined, 'the new puzzle should be stored without its picture');
      assert(storeOf(app).get('puzzle', d.id), 'the existing puzzle went missing');
    },
  },
  {
    id: 'pin-library-samples-twice',
    name: 'Load sample puzzles twice: the second status says they were already present (library)',
    async run(app) {
      await openLibraryWith(app);
      app.buttonByText('Load sample puzzles').click();
      await waitFor(() => /^Added \d+ sample/.test(statusText(app)), 'the samples', 20000);
      const n = storeOf(app).list('puzzle').records.length;
      assert(n > 1, `expected several samples in the store, found ${n}`);
      assert(statusText(app) === `Added ${n} sample puzzles.`, `status reads "${statusText(app)}"`);
      app.buttonByText('Load sample puzzles').click();
      await waitFor(() => /already present/.test(statusText(app)), 'the second status', 20000);
      assert(
        statusText(app) === `Added 0 sample puzzles, ${n} already present.`,
        `second status reads "${statusText(app)}"`,
      );
    },
  },
  {
    id: 'pin-library-import-solver-failure',
    name: 'If the solver fails the import writes nothing, says so and still ends the worker (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      const text = backupText({ puzzles: [a, c], saves: [makeSave(a)] });
      const message =
        'Import failed: the solver could not check the puzzles. Nothing was imported.';
      /** @type {[string, { failPost?: boolean, failCtor?: boolean }][]} */
      const cases = [
        ['a worker that cannot be messaged', { failPost: true }],
        ['a worker that cannot be created', { failCtor: true }],
      ];
      for (const [label, opts] of cases) {
        await openLibraryWith(app);
        const worker = hookWorker(app, opts);
        importText(app, text);
        const status = await importDone(app);
        assert(status === message, `${label}: status reads "${status}"`);
        assert(nngKeys(app).length === 0, `${label}: records were written: ${nngKeys(app)}`);
        assert(noToolbarLeft(app), `${label}: toolbar stayed disabled`);
        assert(
          worker.terminated === worker.created,
          `${label}: ${worker.created} workers created, ${worker.terminated} ended`,
        );
        assert(!opts.failPost || worker.created === 1, 'the failing worker was never created');
      }
    },
  },
  {
    id: 'pin-library-import-write-failure',
    name: 'If storage fails on the second write the import says where it stopped, not that it succeeded (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      await openLibraryWith(app);
      const writes = failNthWrite(app, 2);
      importText(app, backupText({ puzzles: [a, c], saves: [makeSave(a)] }));
      const status = await importDone(app);
      writes.restore();
      assert(
        status === 'Import stopped after 1 of 3 records: quota exceeded.',
        `status reads "${status}"`,
      );
      assert(rawOf(app, 'puzzle', a.id) !== null, 'the first record should have been written');
      assert(rawOf(app, 'puzzle', c.id) === null, 'the failing record should not be stored');
      assert(rawOf(app, 'save', a.id) === null, 'nothing after the failure should be written');
      assert(noToolbarLeft(app), 'toolbar stayed disabled after the failure');
    },
  },
  {
    id: 'pin-library-import-toolbar-disabled',
    name: 'The toolbar is off while an import checks puzzles and back on after, and the worker is ended (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      await openLibraryWith(app);
      const worker = hookWorker(app, { hold: true });
      importText(app, backupText({ puzzles: [a, c] }));
      await waitFor(
        () => /^Checking 0 of 2 imported puzzles/.test(statusText(app)),
        'the checking status',
      );
      const buttons = toolbarButtons(app);
      assert(buttons.length === 3, `expected 3 toolbar buttons, found ${buttons.length}`);
      assert(
        buttons.every((b) => b.disabled),
        'toolbar buttons should be disabled while the import runs',
      );
      worker.release();
      const status = await importDone(app);
      assert(status === 'Imported 2 records.', `status reads "${status}"`);
      assert(noToolbarLeft(app), 'toolbar should be enabled after the import');
      assert(
        worker.created === 1 && worker.terminated === 1,
        `workers created ${worker.created}, ended ${worker.terminated}; expected 1 and 1`,
      );
    },
  },
  {
    id: 'pin-library-import-navigate-away',
    name: 'Leaving the Library mid-import finishes the writes and never touches the new page (library)',
    async run(app) {
      const { a, c } = await libraryParts();
      await openLibraryWith(app);
      const errors = trapErrors(app);
      const worker = hookWorker(app, { hold: true });
      importText(app, backupText({ puzzles: [a, c], saves: [makeSave(a)] }));
      await waitFor(() => /^Checking 0 of 2/.test(statusText(app)), 'the checking status');
      await app.go('#/create');
      await waitFor(() => app.$('.nng-create'), 'the Create view');
      worker.release();
      await waitFor(
        () => rawOf(app, 'puzzle', a.id) && rawOf(app, 'puzzle', c.id) && rawOf(app, 'save', a.id),
        'the import to finish its writes after leaving',
        20000,
      );
      await pause(200);
      assert(errors.length === 0, `errors after leaving mid-import: ${errors.join(' | ')}`);
      assert(!app.$('.nng-lib-status'), 'a library status node is still on the page');
      assert(!/Imported|Checking/.test(app.doc().body.textContent), 'import text leaked in');
      assert(worker.terminated >= 1, 'the import worker was not ended');
    },
  },
  {
    id: 'pin-library-delete-set-and-guards',
    name: 'Delete set removes the set and every tile, and exporting a puzzle deleted elsewhere is refused (library)',
    async run(app) {
      const { a } = await libraryParts();
      const { t1, t2, record } = await setParts();
      await openLibraryWith(app, {
        puzzles: [a, t1, t2],
        saves: [makeSave(a), makeSave(t1)],
        sets: [record],
      });
      const sets = () => app.$$('.nng-set').length;
      assert(sets() === 1, 'the seeded set should be listed');

      const declined = await app.withConfirm(false, async () =>
        app.buttonByText('Delete set').click(),
      );
      assert(declined === 1, `Delete set asked ${declined} confirms, expected 1`);
      assert(
        rawOf(app, 'set', record.setId) &&
          rawOf(app, 'puzzle', t1.id) &&
          rawOf(app, 'puzzle', t2.id),
        'declining the confirm should delete nothing',
      );

      const accepted = await app.withConfirm(true, async () =>
        app.buttonByText('Delete set').click(),
      );
      assert(accepted === 1, `Delete set asked ${accepted} confirms, expected 1`);
      for (const [kind, id] of [
        ['set', record.setId],
        ['puzzle', t1.id],
        ['puzzle', t2.id],
        ['save', t1.id],
      ]) {
        assert(rawOf(app, kind, id) === null, `${kind} ${id} survived Delete set`);
      }
      assert(sets() === 0, 'the set is still listed');
      assert(
        rawOf(app, 'puzzle', a.id) && rawOf(app, 'save', a.id),
        'Delete set removed a loose puzzle',
      );

      // Export for other solvers, for a puzzle another tab deleted since this one rendered.
      app.win().localStorage.removeItem(`nng:puzzle:${a.id}`);
      const button = app
        .$$('.nng-lib-row button')
        .find((b) => b.textContent.trim() === 'Export for other solvers (webpbn)');
      assert(button, 'no export-for-other-solvers button on the puzzle row');
      let threw = null;
      try {
        await captureDownload(app, () => button.click());
      } catch (e) {
        threw = e;
      }
      assert(
        threw && /no download/.test(threw.message),
        'a missing puzzle still produced a download',
      );
      assert(
        statusText(app) === 'That puzzle no longer exists.',
        `status reads "${statusText(app)}"`,
      );
    },
  },
];
