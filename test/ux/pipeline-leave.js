// End-to-end check for leaving a puzzle: navigating away from #/play/<id> must
// run Play's cleanup (one final clock tick) and then save, so the last stretch of
// elapsed time reaches storage. The interval only moves the clock in memory, so
// storage must still hold the old value until the player leaves. Every expected
// value comes from localStorage and the puzzle's stored solution, never from
// the code under test.
import { createStore } from '../../src/store.js';
import { createAndSave, pause, resetStore, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const PUZZLE_IMAGE = 'sample-images/cat-15x15.png';
const WAIT_MS = 1500;
const MIN_GAIN_MS = 1000;

export const LEAVE_CHECKS = [
  {
    id: 'pipeline-leave-puzzle-saves-time',
    name: 'Leaving a puzzle saves the elapsed time and cells at that moment (pipeline)',
    async run(app) {
      const stored = (kind, id) => createStore(app.win().localStorage).get(kind, id);

      await app.open('#/library');
      resetStore(app);
      const id = await createAndSave(app, PUZZLE_IMAGE);
      const puzzle = stored('puzzle', id);
      assert(puzzle, `no stored puzzle for ${id}`);
      // One correct fill: the first cell the stored solution marks filled.
      const r0 = puzzle.solution.findIndex((/** @type {number[]} */ row) => row.some(Boolean));
      assert(r0 >= 0, 'the stored solution has no filled cell');
      const target = [r0, puzzle.solution[r0].findIndex(Boolean)];

      await app.open(`#/play/${id}`);
      await waitFor(
        () => app.$$('.nng-cell').length === puzzle.width * puzzle.height,
        'grid',
        5000,
      );
      app.stroke([target]);
      assert(
        app.cell(target[0], target[1]).classList.contains('nng-filled'),
        `cell ${target} should be filled after the click`,
      );
      await waitFor(() => stored('save', id), 'a stored save after the move');
      const first = stored('save', id);
      assert(
        first.cells[target[0]][target[1]] >= 1,
        'the stored save should hold the filled cell after the move',
      );

      await pause(WAIT_MS);
      const during = stored('save', id);
      assert(
        during.elapsedMs === first.elapsedMs,
        `storage changed while playing: elapsedMs ${first.elapsedMs} became ${during.elapsedMs}; only a move or leaving should write`,
      );

      await app.go('#/library');
      await waitFor(() => app.$$('.nng-cell').length === 0, 'Play to unmount', 5000);
      const after = stored('save', id);
      assert(after, 'leaving the puzzle removed its save');
      assert(
        after.elapsedMs >= first.elapsedMs + MIN_GAIN_MS,
        `leaving did not save the elapsed time: elapsedMs ${first.elapsedMs} before waiting ${WAIT_MS} ms, ${after.elapsedMs} after leaving (expected at least ${MIN_GAIN_MS} more)`,
      );
      assert(
        JSON.stringify(after.cells) === JSON.stringify(first.cells),
        'leaving changed the saved cells',
      );
      const rest = (s) => JSON.stringify({ ...s, elapsedMs: 0, updatedAt: 0 });
      assert(rest(after) === rest(first), `leaving changed more than the time: ${rest(after)}`);
    },
  },
];
