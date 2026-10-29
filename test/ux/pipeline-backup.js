// End-to-end backup round trip: create two puzzles through the real Create view,
// export the library, tamper with the file's verdicts, wipe the store, import,
// and prove the worker re-rated every puzzle (AGENTS rule 6: a file's verdict is
// only a claim). Nothing is seeded.
import { createStore } from '../../src/store.js';
import { assertWorkerVerdict } from './expected-verdict.js';
import { captureDownload, createAndSave, pickFile, resetStore, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export const BACKUP_CHECKS = [
  {
    id: 'pipeline-backup-round-trip',
    name: 'Backup export then import keeps the puzzles and re-rates them, ignoring the file verdict (pipeline)',
    async run(app) {
      await app.open('#/library');
      resetStore(app);
      const monoId = await createAndSave(app, 'sample-images/cat-15x15.png');
      const colorId = await createAndSave(app, 'test/ux/color-3ink.png', { colors: 4 });
      assert(monoId !== colorId, 'mono and color puzzles should have different ids');
      const colorPuzzle = createStore(app.win().localStorage).get('puzzle', colorId);
      assert(colorPuzzle?.palette.length >= 2, 'the color puzzle should have at least 2 inks');

      const stored = (id) => createStore(app.win().localStorage).get('puzzle', id);
      const original = {};
      for (const id of [monoId, colorId]) {
        const p = stored(id);
        assert(p?.verdict?.status, `puzzle ${id} should be stored with a verdict`);
        // Pinned to what the pure solver says, not to the worker's own earlier output.
        original[id] = assertWorkerVerdict(p, `puzzle ${id}`).status;
      }

      await app.open('#/library');
      const exported = await captureDownload(app, () => app.buttonByText('Export library').click());
      const backup = JSON.parse(await exported.text());

      // Tamper: give every puzzle a false, attractive verdict.
      let tampered = 0;
      const visit = (node) => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        if (node.verdict && node.solution) {
          const real = node.verdict.status;
          node.verdict =
            real === 'multiple'
              ? { status: 'unique-line-solvable', sweeps: 1 }
              : { status: 'multiple', sweeps: 0 };
          tampered += 1;
        }
        Object.values(node).forEach(visit);
      };
      visit(backup);
      assert(tampered === 2, `expected to tamper 2 puzzles in the backup, found ${tampered}`);
      const blob = new (app.win().Blob)([JSON.stringify(backup)], { type: 'application/json' });

      resetStore(app);
      await app.open('#/library');
      assert(!stored(monoId) && !stored(colorId), 'store should be empty before import');
      pickFile(app, '.nng-lib-toolbar input[type=file]', blob, 'tampered-backup.json');

      const status = () => app.$('.nng-lib-status')?.textContent ?? '';
      await waitFor(() => /^Imported \d+ record/.test(status()), 'import to finish', 20000);
      await waitFor(
        () => app.$$('.nng-lib-toolbar button').every((b) => !b.disabled),
        'toolbar re-enabled',
        5000,
      );

      for (const [label, id] of [
        ['mono', monoId],
        ['color', colorId],
      ]) {
        const p = stored(id);
        assert(p, `${label} puzzle ${id} should be back after import`);
        assert(
          p.verdict.status === original[id],
          `${label} verdict should be re-rated to ${original[id]}, got ${p.verdict.status}`,
        );
        assertWorkerVerdict(p, `imported ${label} puzzle`);
      }
      const rows = app.$$('.nng-lib-content a[href^="#/play/"]').map((a) => a.getAttribute('href'));
      for (const id of [monoId, colorId]) {
        assert(
          rows.some((h) => decodeURIComponent(h).endsWith(id)),
          `library should list puzzle ${id}`,
        );
      }
    },
  },
];
