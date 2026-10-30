// UX checks added by lane 2c (library sets split): deleting a single puzzle must
// re-render the list (a survivor the 2a lane found: removing the render() call in
// deletePuzzle passed both suites). Expected values come from the seeded records
// and from storage, never from the view under test.
import { makePuzzle, makeSave, makeSet, openLibraryWith, rawOf } from './harness-linecap.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export const LINECAP_SETS_CHECKS = [
  {
    id: 'linecap-sets-delete-puzzle-rerenders',
    name: 'Deleting one puzzle removes its row from the list at once, along with the puzzle and its save (library)',
    async run(app) {
      const keep = await makePuzzle('Linecap keep', ['10110', '01101', '11011', '00100', '10011']);
      const gone = await makePuzzle('Linecap gone', ['11000', '01100', '00110', '00011', '10001']);
      await openLibraryWith(app, {
        puzzles: [keep, gone],
        saves: [makeSave(keep), makeSave(gone)],
      });
      const rows = () => app.$$('.nng-lib-row');
      const rowOf = (title) => rows().find((r) => r.textContent.includes(title));
      assert(rows().length === 2, `expected 2 seeded rows, found ${rows().length}`);

      const row = rowOf('Linecap gone');
      assert(row, 'the seeded puzzle should be listed');
      const more = row.querySelector('details.nng-more');
      more.open = true;
      const del = [...more.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
      assert(del, 'no Delete button in the row menu');
      const asked = await app.withConfirm(true, async () => del.click());
      assert(asked === 1, `Delete asked ${asked} confirms, expected 1`);

      assert(rawOf(app, 'puzzle', gone.id) === null, 'the deleted puzzle is still in storage');
      assert(rawOf(app, 'save', gone.id) === null, 'the deleted puzzle kept its save');
      assert(rawOf(app, 'puzzle', keep.id) && rawOf(app, 'save', keep.id), 'the other was removed');
      assert(
        rows().length === 1,
        `the list shows ${rows().length} rows after the delete, expected 1`,
      );
      assert(!rowOf('Linecap gone'), 'the deleted puzzle is still on screen');
      assert(rowOf('Linecap keep'), 'the other puzzle left the screen');
    },
  },
  {
    id: 'linecap-sets-complete-mosaic-size',
    name: 'A finished set draws every tile at the tiles own aspect, 96px on the longer side, and a partly solved set does not (library)',
    async run(app) {
      // Tiles 4 wide and 2 tall: the box is 96 x 48, and a solved tile's canvas is 4 x 24 by 2 x 24.
      const set = { id: 'set-linecap-wide', row: 0, col: 0 };
      const t1 = await makePuzzle('Wide tile 1', ['1011', '0110'], { set });
      const t2 = await makePuzzle('Wide tile 2', ['1101', '0011'], { set: { ...set, col: 1 } });
      const record = makeSet('set-linecap-wide', 'Wide set', [t1, t2], 2);
      const solved = (p) => ({ ...makeSave(p), solvedAt: 1700000000000 });
      const mosaic = () => app.$('.nng-mosaic');

      await openLibraryWith(app, {
        puzzles: [t1, t2],
        saves: [solved(t1), solved(t2)],
        sets: [record],
      });
      assert(mosaic()?.classList.contains('nng-mosaic-complete'), 'the finished set is not marked');
      const style = mosaic().style;
      assert(
        style.getPropertyValue('--tile-w') === '96px',
        `--tile-w is "${style.getPropertyValue('--tile-w')}"`,
      );
      assert(
        style.getPropertyValue('--tile-h') === '48px',
        `--tile-h is "${style.getPropertyValue('--tile-h')}"`,
      );
      assert(
        style.gridTemplateColumns === 'repeat(2, var(--tile-w, 96px))',
        `grid columns read "${style.gridTemplateColumns}"`,
      );
      const canvases = app.$$('.nng-mosaic canvas');
      assert(canvases.length === 2, `expected 2 solved-tile canvases, found ${canvases.length}`);
      for (const c of canvases) {
        assert(c.width === 96 && c.height === 48, `a tile canvas is ${c.width} x ${c.height}`);
      }

      await openLibraryWith(app, { puzzles: [t1, t2], saves: [solved(t1)], sets: [record] });
      assert(!mosaic().classList.contains('nng-mosaic-complete'), 'a partly solved set is marked');
      assert(
        mosaic().style.getPropertyValue('--tile-w') === '',
        'a partly solved set sets --tile-w',
      );
      assert(app.$$('.nng-mosaic canvas').length === 1, 'only the solved tile should show cells');
    },
  },
];
