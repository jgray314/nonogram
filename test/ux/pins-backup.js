// Pin check for the library backup import: the write-failure path must
// re-render the library. Expected rows come from storage, never from
// the view under test.
import {
  TWO_INKS,
  backupText,
  failNthWrite,
  importDone,
  importText,
  makePuzzle,
  makeSave,
  openLibraryWith,
  statusText,
  storeOf,
} from './harness-library.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const MONO_A = ['10110', '01101', '11011', '00100', '10011'];
const MONO_E = ['00100', '01110', '11111', '01110', '00100'];
const COLOR_C = ['12012', '21021', '01210', '12102', '20121'];

export const PINS_BACKUP_CHECKS = [
  {
    id: 'pin-backup-import-write-failure-rerenders',
    name: 'After an import stops on a failed write the list shows exactly what is in storage (library backup)',
    async run(app) {
      const a = await makePuzzle('Linecap A', MONO_A);
      const c = await makePuzzle('Linecap C', COLOR_C, { palette: TWO_INKS, blank: '#f4f4f4' });
      const kept = await makePuzzle('Linecap kept', MONO_E);
      await openLibraryWith(app, { puzzles: [kept] });
      const titles = () => [...app.$$('.nng-lib-title')].map((n) => n.textContent).sort();
      assert(
        titles().join('|') === 'Linecap kept',
        `before the import the list reads "${titles().join('|')}"`,
      );
      const writes = failNthWrite(app, 2);
      importText(app, backupText({ puzzles: [a, c], saves: [makeSave(a)] }));
      const status = await importDone(app);
      writes.restore();
      assert(
        status === 'Import stopped after 1 of 3 records: quota exceeded.',
        `status reads "${status}"`,
      );
      assert(statusText(app) === status, 'the failure message was replaced');
      // Expected rows come from storage after the failed import.
      const stored = storeOf(app)
        .list('puzzle')
        .records.map((p) => p.title)
        .sort();
      assert(stored.includes('Linecap A'), 'the record written before the failure is stored');
      assert(!stored.includes('Linecap C'), 'the record that failed should not be stored');
      assert(stored.includes('Linecap kept'), 'the seeded record should still be stored');
      assert(
        titles().join('|') === stored.join('|'),
        `the list shows "${titles().join('|')}" but storage holds "${stored.join('|')}"`,
      );
    },
  },
];
