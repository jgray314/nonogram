// End-to-end color pipeline: a color image goes through Create (image.js,
// color.js, the solver worker), is saved, and shows up as a color puzzle in the
// library and in Play. Nothing is seeded.
import { assertWorkerVerdict } from './expected-verdict.js';
import { createAndSave, resetStore, waitFor } from './harness.js';

const FIXTURE = 'test/ux/color-3ink.png';
const HEX = /^#[0-9a-f]{6}$/i;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export const COLOR_CHECKS = [
  {
    id: 'pipeline-color-upload-to-library',
    name: 'A color image becomes a saved color puzzle with a Color badge and one swatch per ink',
    async run(app) {
      await app.open('#/library');
      resetStore(app);

      // Ask for 4 colors in total (cream blank + 3 inks) and let the real worker rate it.
      const id = await createAndSave(app, FIXTURE, { colors: 4 });

      // The stored record: inks (palette) plus the blank are 3 to 5 colors.
      const raw = app.win().localStorage.getItem(`nng:puzzle:${id}`);
      assert(raw, `no stored puzzle for ${id}`);
      const puzzle = JSON.parse(raw);
      const inks = puzzle.palette.map((p) => p.hex.toLowerCase());
      assert(
        inks.every((h) => HEX.test(h)),
        `bad ink hex in ${JSON.stringify(inks)}`,
      );
      assert(HEX.test(puzzle.blank ?? ''), `blank is not a hex: ${puzzle.blank}`);
      assert(!inks.includes(puzzle.blank.toLowerCase()), 'blank duplicated among the inks');
      assert(new Set(inks).size === inks.length, `duplicate inks: ${inks}`);
      const total = inks.length + 1;
      assert(total >= 3 && total <= 5, `expected 3 to 5 colors in total, got ${total}`);
      // Four were asked for (blank + 3 inks) and the fixture has exactly that many
      // distinct regions, so a Colors option that is ignored shows up here.
      assert(total === 4, `asked for 4 colors in total, got ${total}`);
      assertWorkerVerdict(puzzle, 'color puzzle');

      // Library: Color badge, one dot per ink.
      await app.open('#/library');
      const row = await waitFor(
        () => app.$$('.nng-lib-meta').find((m) => m.querySelector('.nng-badge-color')),
        'a library row with the Color badge',
      );
      const badge = row.querySelector('.nng-badge-color');
      assert(badge.textContent.trim() === 'Color', `badge text: ${badge.textContent}`);
      const dots = badge.querySelectorAll('.nng-color-dot').length;
      assert(dots === inks.length, `${dots} dots for ${inks.length} inks`);

      // Play: one swatch per ink.
      await app.open(`#/play/${encodeURIComponent(id)}`);
      const swatches = await waitFor(() => {
        const s = app.$$('.nng-swatches .nng-swatch');
        return s.length ? s : null;
      }, 'color picker swatches');
      assert(
        swatches.length === inks.length,
        `${swatches.length} swatches for ${inks.length} inks`,
      );
    },
  },
];
