// End-to-end check: a photo goes in through Create and comes out as a rated,
// playable puzzle in the library. Nothing is seeded, so the stored verdict can
// only have come from the real solver worker.
import { assertWorkerVerdict } from './expected-verdict.js';
import { createAndSave, resetStore, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export const MONO_CHECKS = [
  {
    id: 'pipeline-mono-upload-to-library',
    name: 'Upload a photo, save it, find it rated in the library and play it',
    async run(app) {
      await app.open('#/library');
      resetStore(app);

      const id = await createAndSave(app, 'sample-images/cat-15x15.png');

      const raw = app.win().localStorage.getItem(`nng:puzzle:${id}`);
      assert(raw, `no stored puzzle under nng:puzzle:${id}`);
      const puzzle = JSON.parse(raw);
      assert(puzzle.id === id, `stored id ${puzzle.id} is not the saved id ${id}`);
      assert(
        puzzle.width === 15 && puzzle.height === 15,
        `stored size is ${puzzle.width}x${puzzle.height}, expected 15x15`,
      );
      assertWorkerVerdict(puzzle, 'mono puzzle');

      await app.open('#/library');
      const rows = app.$$('.nng-lib-row');
      assert(rows.length === 1, `library shows ${rows.length} rows after one save, expected 1`);
      const play = rows[0].querySelector(`a[href="#/play/${encodeURIComponent(id)}"]`);
      assert(
        play && play.textContent.trim() === 'Play',
        'library row has no Play link for the puzzle',
      );

      play.click();
      await waitFor(() => app.$$('.nng-cell').length > 0, 'play grid', 5000);
      const cells = app.$$('.nng-cell').length;
      assert(cells === 225, `play grid has ${cells} cells, expected 225 (15x15)`);
    },
  },
];
