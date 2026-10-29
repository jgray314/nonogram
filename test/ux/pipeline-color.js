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

// The fixture is 30x30: a cream ground and three flat rectangles, in pixel
// coordinates (inclusive). Read from the PNG, not from the code under test.
const SIZE = 30;
const RECTS = [
  { hex: '#dc2828', x0: 3, x1: 13, y0: 3, y1: 13 }, // red
  { hex: '#28aa3c', x0: 16, x1: 26, y0: 5, y1: 15 }, // green
  { hex: '#2846dc', x0: 8, x1: 21, y0: 18, y1: 27 }, // blue
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a, b) => {
  const [p, q] = [rgb(a), rgb(b)];
  return p.reduce((sum, v, i) => sum + (v - q[i]) ** 2, 0);
};

/**
 * Colors by place, not by value: every cell lying wholly inside a rectangle must be
 * the ink nearest that rectangle's color, and every cell touching no rectangle must
 * be blank. Picking the nearest ink (not a fixed hex) keeps this valid when palette
 * tuning shifts the exact shades; swapped inks, a shifted picture, or a rectangle
 * absorbed into the blank still fail.
 */
function assertRegionsMatchPicture(puzzle) {
  const { width, height, solution, palette } = puzzle;
  const inside = RECTS.map(() => 0);
  let blanks = 0;
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      // The cell's pixel box, in continuous coordinates; pixel p spans [p, p + 1).
      const [bx0, bx1] = [(c * SIZE) / width, ((c + 1) * SIZE) / width];
      const [by0, by1] = [(r * SIZE) / height, ((r + 1) * SIZE) / height];
      RECTS.forEach((rect, k) => {
        if (bx0 >= rect.x0 && bx1 <= rect.x1 + 1 && by0 >= rect.y0 && by1 <= rect.y1 + 1) {
          const nearest = palette
            .map((p, i) => [distance(p.hex.toLowerCase(), rect.hex), i])
            .sort((a, b) => a[0] - b[0])[0][1];
          assert(
            solution[r][c] === nearest + 1,
            `cell (${r},${c}) is wholly inside the ${rect.hex} rectangle and should be ink ${nearest + 1}, got ${solution[r][c]}`,
          );
          inside[k] += 1;
        }
      });
      const touches = RECTS.some(
        (rect) => bx1 > rect.x0 && bx0 < rect.x1 + 1 && by1 > rect.y0 && by0 < rect.y1 + 1,
      );
      if (!touches) {
        assert(solution[r][c] === 0, `cell (${r},${c}) touches no rectangle but is not blank`);
        blanks += 1;
      }
    }
  }
  inside.forEach((n, k) =>
    assert(n > 0, `the grid is too coarse: no cell lies wholly inside rectangle ${RECTS[k].hex}`),
  );
  assert(blanks > 0, 'the grid has no cell clear of every rectangle');
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
      assertRegionsMatchPicture(puzzle);

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
