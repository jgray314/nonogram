// UX checks that close the grid.js mutation survivors (docs/plans/line-cap-300-audit-grid.md).
// Each mounts the real renderGrid on the running app's page and checks the DOM
// contract in grid.js's header: classes, inline styles and onPointer events.
// G10 (the sweep restart) is checked through getAnimations() on a crossed cell.
import {
  CLUES,
  GUTTER,
  HEIGHT,
  SOLUTION,
  WIDTH,
  blankCells,
  mountGrid,
} from './harness-linecap-grid.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function same(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: got ${a}, expected ${e}`);
}

/** Open a page, mount a grid, run `body`, always tear down. */
async function withGrid(app, options, body) {
  await app.open('#/library');
  const g = await mountGrid(app, options);
  try {
    await body(g);
  } finally {
    g.done();
  }
}

const PALETTE = [{ hex: '#ff0000' }, { hex: '#0000ff' }];
const CELL = (r, c) => `${r},${c}`;

// A touch or pen stroke: the caller's mode picks the button, a drag follows the
// point under the finger, and lifting reports the cell under it.
function touchCheck(pointerType) {
  return {
    id: `linecap-grid-${pointerType}-stroke`,
    name: `Grid: a ${pointerType} stroke uses the caller's button and follows the point under it`,
    async run(app) {
      await withGrid(app, { touchButton: () => 'right' }, async (g) => {
        const t = { pointerType, button: 0 };
        // A move with nothing pressed does nothing (G17).
        g.fire(g.cell(0, 0), 'pointermove', { ...t, ...g.center(g.cell(0, 0)) });
        same(g.events, [], 'a touch move with no press');
        if (pointerType === 'touch') {
          // Pointerover from touch is ignored: touch is followed by pointermove.
          g.fire(g.cell(0, 0), 'pointerover', t);
          same(g.events, [], 'a touch pointerover');
          assert(g.marked('nng-hot').length === 0, 'a touch pointerover made a hot row');
        }

        g.fire(g.cell(0, 0), 'pointerdown', { ...t, ...g.center(g.cell(0, 0)) });
        g.fire(g.cell(0, 0), 'pointermove', { ...t, ...g.center(g.cell(0, 1)) });
        g.fire(g.cell(0, 0), 'pointermove', { ...t, ...g.center(g.cell(0, 1)) });
        g.fire(g.cell(0, 0), 'pointermove', { ...t, ...g.center(g.cell(1, 1)) });
        same(
          g.events,
          ['down:0,0:right', 'enter:0,1:right', 'enter:1,1:right'],
          `${pointerType} down then two moves (the repeat on one cell is deduped)`,
        );
        g.fire(g.cell(1, 1), 'pointerup', { ...t, ...g.center(g.cell(2, 2)) });
        same(
          g.events.slice(3),
          ['up:2,2:right'],
          'the up reports the cell under the point, not the event target',
        );
        if (pointerType === 'touch') {
          same(g.marked('nng-hot'), [], 'hot cells left after a finger lifts (G21)');
        }
        // The stroke is over: a further up is stray.
        g.fire(g.root, 'pointerup', { ...t, ...g.center(g.cell(2, 2)) });
        same(g.events.length, 4, 'events after the stroke ended');
      });
    },
  };
}

export const LINECAP_GRID_CHECKS = [
  {
    id: 'linecap-grid-ink-colors',
    name: 'Grid: filled cells take their ink color and nng-ink; crossed and unknown cells do not',
    async run(app) {
      await withGrid(app, { palette: PALETTE }, async (g) => {
        g.grid.update([
          [1, 2, -1, 0],
          [2, 2, 1, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]);
        const bg = (r, c) => g.cell(r, c).style.backgroundColor;
        same(bg(0, 0), 'rgb(255, 0, 0)', 'ink 1 background');
        same(bg(0, 1), 'rgb(0, 0, 255)', 'ink 2 background');
        same(bg(1, 2), 'rgb(255, 0, 0)', 'ink 1 background again');
        same(bg(0, 2), '', 'a crossed cell has no ink background');
        same(bg(0, 3), '', 'an unknown cell has no ink background');
        same(g.marked('nng-ink'), ['0,0', '0,1', '1,0', '1,1', '1,2'], 'cells with nng-ink');
        same(g.cell(0, 1).dataset.color, '2', 'data-color of an ink-2 cell');
        // A cell that stops being filled loses both.
        g.grid.update(blankCells());
        same(g.marked('nng-ink'), [], 'nng-ink after clearing');
        same(bg(0, 0), '', 'background after clearing');
      });
      // A two-tone grid (no palette) is themed: never an ink class or color.
      await withGrid(app, {}, async (g) => {
        g.grid.update(SOLUTION);
        same(g.marked('nng-ink'), [], 'nng-ink on a two-tone grid');
        same(g.cell(0, 0).style.backgroundColor, '', 'inline background on a two-tone grid');
        same(g.marked('nng-filled').length, 8, 'filled cells of the solution');
      });
    },
  },
  {
    id: 'linecap-grid-pop-on-new-fill',
    name: 'Grid: a newly filled cell pops once, the initial paint does not, and the pop clears on animationend',
    async run(app) {
      await withGrid(app, { cells: SOLUTION }, async (g) => {
        same(g.marked('nng-pop'), [], 'pops after the initial paint');
        /** @type {number[][]} */
        const next = SOLUTION.map((row) => [...row]);
        next[3][0] = 1;
        g.grid.update(next);
        same(g.marked('nng-pop'), ['3,0'], 'pops after one newly filled cell');
        g.cell(3, 0).dispatchEvent(new g.win.Event('animationend'));
        same(g.marked('nng-pop'), [], 'pops after animationend');
        g.grid.update(next);
        same(g.marked('nng-pop'), [], 'pops after an update that changed nothing');
        // Crossing a filled cell and filling it again pops once more.
        next[3][0] = -1;
        g.grid.update(next);
        same(g.marked('nng-pop'), [], 'pops after filled becomes crossed');
        next[3][0] = 1;
        g.grid.update(next);
        same(g.marked('nng-pop'), ['3,0'], 'pops after the cell is filled again');
      });
    },
  },
  {
    id: 'linecap-grid-clue-done-per-number',
    name: 'Grid: setClueDone dims exactly the flagged numbers, rows and columns separately',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        const states = (axis, i) =>
          g.chips(axis, i).map((n) => n.classList.contains('nng-clue-done'));
        // The chips are where the DOM contract puts them: text is the clue number.
        CLUES.rows.forEach((list, r) =>
          same(
            g.chips('row', r).map((n) => n.textContent),
            list.map((x) => String(x.n)),
            `row ${r} chip numbers`,
          ),
        );
        g.grid.setClueDone({
          rows: [[false, true], [true], [true, false], []],
          cols: [[true, false], [false], [true], [false, true]],
        });
        same(states('row', 0), [false, true], 'row 0 [2,1]');
        same(states('row', 1), [true], 'row 1 [2]');
        same(states('row', 2), [true, false], 'row 2 [1,2]');
        same(states('col', 0), [true, false], 'column 0 [1,1]');
        same(states('col', 1), [false], 'column 1 [2]');
        same(states('col', 2), [true], 'column 2 [2]');
        same(states('col', 3), [false, true], 'column 3 [1,1]');
        // Passing only rows leaves every column undone, and vice versa.
        g.grid.setClueDone({ rows: [[true, true], [false], [false, false], []] });
        same(states('row', 0), [true, true], 'row 0 after the second call');
        same(states('row', 2), [false, false], 'row 2 after the second call');
        for (let c = 0; c < WIDTH; c++) {
          assert(
            states('col', c).every((d) => !d),
            `column ${c} still done after a rows-only call`,
          );
        }
      });
    },
  },
  {
    id: 'linecap-grid-overlay-replace',
    name: 'Grid: setOverlay lays one node over the cell area, replaces the old one, and null removes it',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        const before = g.root.children.length;
        const a = g.win.document.createElement('div');
        const b = g.win.document.createElement('div');
        g.grid.setOverlay(a);
        assert(a.isConnected && a.parentNode === g.root, 'first overlay is not in the grid');
        same(a.style.gridRow, `${GUTTER + 1} / span ${HEIGHT}`, 'overlay grid row');
        same(a.style.gridColumn, `${GUTTER + 1} / span ${WIDTH}`, 'overlay grid column');
        same(a.style.zIndex, '2', 'overlay z-index');
        g.grid.setOverlay(b);
        assert(!a.isConnected, 'the replaced overlay is still in the page');
        assert(b.isConnected, 'the new overlay is not in the page');
        same(g.root.children.length, before + 1, 'grid children with one overlay');
        g.grid.setOverlay(null);
        assert(!b.isConnected, 'setOverlay(null) left the overlay in the page');
        same(g.root.children.length, before, 'grid children after removing the overlay');
        g.grid.setOverlay(null); // nothing to remove: no throw
      });
    },
  },
  {
    id: 'linecap-grid-wrong-and-highlight-replace',
    name: 'Grid: setWrong and setHighlight each replace their previous marks, and ignore off-grid cells',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        g.grid.setWrong([
          [0, 0],
          [2, 3],
        ]);
        same(g.marked('nng-wrong'), ['0,0', '2,3'], 'wrong after the first call');
        g.grid.setWrong([
          [1, 1],
          [9, 9],
        ]);
        same(g.marked('nng-wrong'), ['1,1'], 'wrong after the second call');
        g.grid.setHighlight([[3, 3]]);
        same(g.marked('nng-hl'), ['3,3'], 'highlight after the first call');
        g.grid.setHighlight([
          [0, 1],
          [0, 2],
        ]);
        same(g.marked('nng-hl'), ['0,1', '0,2'], 'highlight after the second call');
        same(g.marked('nng-wrong'), ['1,1'], 'setHighlight touched the wrong marks');
        g.grid.setWrong([]);
        g.grid.setHighlight([]);
        same(g.marked('nng-wrong'), [], 'wrong after an empty call');
        same(g.marked('nng-hl'), [], 'highlight after an empty call');
      });
    },
  },
  {
    id: 'linecap-grid-sweep-stagger',
    name: 'Grid: sweep staggers cells by --sweep-i, clears on animationend, and restarts a running sweep',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        const list = [
          [0, 0],
          [1, 2],
          [3, 3],
        ];
        g.grid.sweep(list);
        list.forEach(([r, c], i) => {
          const node = g.cell(r, c);
          same(node.style.getPropertyValue('--sweep-i'), String(i), `--sweep-i of cell ${r},${c}`);
          assert(node.classList.contains('nng-sweep'), `cell ${r},${c} has no nng-sweep`);
        });
        same(g.marked('nng-sweep'), ['0,0', '1,2', '3,3'], 'cells in the sweep');
        g.grid.sweep([[9, 9]]); // off the grid: ignored
        list.forEach(([r, c]) => g.cell(r, c).dispatchEvent(new g.win.Event('animationend')));
        same(g.marked('nng-sweep'), [], 'cells still sweeping after animationend');

        // G10: sweeping a cell that is mid-sweep restarts the animation. The
        // running animation object is replaced only if the class change was flushed.
        // The animation is on the cross, so the cell must be crossed.
        const crossed = blankCells();
        crossed[2][2] = -1;
        g.grid.update(crossed);
        g.grid.sweep([[2, 2]]);
        const first = g.cell(2, 2).getAnimations({ subtree: true });
        assert(first.length > 0, 'a sweeping cell has no running animation');
        g.grid.sweep([[2, 2]]);
        const second = g.cell(2, 2).getAnimations({ subtree: true });
        assert(
          second.length > 0 && second.every((a) => !first.includes(a)),
          'sweeping a running cell again did not restart its animation',
        );
      });
    },
  },
  {
    id: 'linecap-grid-hover-highlight',
    name: "Grid: hover lights only the hovered cell's row and column, once per cell; leaving clears it and reports null",
    async run(app) {
      await withGrid(app, {}, async (g) => {
        const lit = (r, c) => {
          const out = [];
          for (let i = 0; i < HEIGHT; i++) {
            for (let j = 0; j < WIDTH; j++) if (i === r || j === c) out.push(CELL(i, j));
          }
          return out.sort();
        };
        g.fire(g.cell(0, 0), 'pointerover');
        g.fire(g.cell(0, 0), 'pointerover');
        same(g.events, ['enter:0,0:-'], 'two pointerovers on one cell emit one enter (G16)');
        same(g.marked('nng-hot'), lit(0, 0), 'hot cells for 0,0');
        g.fire(g.cell(1, 1), 'pointerover');
        same(g.marked('nng-hot'), lit(1, 1), 'hot cells for 1,1 (the old row is cleared, G12)');
        same(g.events, ['enter:0,0:-', 'enter:1,1:-'], 'events after the second cell');
        // Leaving the grid (G18, G22).
        g.fire(g.root, 'pointerleave');
        same(g.events.slice(2), ['enter:-,-:-'], 'leave reports a null cell');
        same(g.marked('nng-hot'), [], 'hot cells after leave');
        g.fire(g.root, 'pointerleave');
        same(g.events.length, 3, 'a second leave with nothing hot');
        // Entering again lights up again.
        g.fire(g.cell(0, 0), 'pointerover');
        same(g.marked('nng-hot'), lit(0, 0), 'hot cells after re-entering');
      });
    },
  },
  {
    id: 'linecap-grid-mouse-stroke',
    name: 'Grid: a mouse stroke reports down, enter and up with the held button, and a middle press is ignored',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        // A middle press starts nothing (G14), and does not block the next press.
        g.fire(g.cell(0, 0), 'pointerdown', { button: 1 });
        same(g.events, [], 'a middle-button press');
        g.fire(g.cell(0, 0), 'pointerup', { button: 1 });
        same(g.events, [], 'the release of a middle-button press');
        // A press on a gutter clue is not on a cell.
        g.fire(g.chips('row', 0)[0], 'pointerdown', { button: 0 });
        same(g.events, [], 'a press on a clue');

        g.fire(g.cell(0, 0), 'pointerdown', { button: 0 });
        // A second press mid-stroke is ignored (G13), whatever its button.
        g.fire(g.cell(1, 1), 'pointerdown', { button: 2 });
        g.fire(g.cell(0, 1), 'pointerover');
        // A mouse drag is followed by pointerover, not pointermove.
        g.fire(g.cell(0, 2), 'pointermove', g.center(g.cell(0, 2)));
        g.fire(g.cell(0, 1), 'pointerup', { button: 0 });
        same(g.events, ['down:0,0:left', 'enter:0,1:left', 'up:0,1:left'], 'left stroke events');
        // After the up the press is over: hovering reports no button.
        g.fire(g.cell(0, 2), 'pointerover');
        same(g.events[3], 'enter:0,2:-', 'enter after the stroke');

        // The right button crosses; a release outside the grid still ends it.
        g.fire(g.cell(2, 2), 'pointerdown', { button: 2 });
        g.fire(g.win, 'pointerup', { button: 2 });
        same(g.events.slice(4), ['down:2,2:right', 'up:-,-:right'], 'right stroke events');
        g.fire(g.cell(3, 3), 'pointerdown', { button: 0 });
        same(g.events[6], 'down:3,3:left', 'a press after an outside release');
      });
    },
  },
  {
    id: 'linecap-grid-stray-up-ignored',
    name: 'Grid: a window pointerup with no press emits nothing',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        g.fire(g.win, 'pointerup');
        g.fire(g.win, 'pointercancel');
        g.fire(g.cell(1, 1), 'pointerup');
        same(g.events, [], 'events from releases with nothing held');
      });
    },
  },
  {
    id: 'linecap-grid-pointercancel-ends-stroke',
    name: 'Grid: a window pointercancel during a stroke emits up and lets the next press start',
    async run(app) {
      await withGrid(app, {}, async (g) => {
        g.fire(g.cell(1, 1), 'pointerdown', { button: 0 });
        g.fire(g.win, 'pointercancel');
        same(g.events, ['down:1,1:left', 'up:-,-:left'], 'press then cancel');
        g.fire(g.cell(2, 2), 'pointerdown', { button: 0 });
        same(g.events[2], 'down:2,2:left', 'the press after a cancel');
      });
    },
  },
  touchCheck('touch'),
  touchCheck('pen'),
  {
    id: 'linecap-grid-destroy-removes-window-listeners',
    name: 'Grid: after destroy, a window pointerup or pointercancel no longer reaches onPointer',
    async run(app) {
      for (const type of ['pointerup', 'pointercancel']) {
        await withGrid(app, {}, async (g) => {
          g.fire(g.cell(0, 0), 'pointerdown', { button: 0 });
          same(g.events, ['down:0,0:left'], `${type}: the press`);
          g.grid.destroy();
          assert(!g.root.isConnected, 'destroy left the grid in the page');
          g.fire(g.win, type);
          same(g.events, ['down:0,0:left'], `events after destroy and ${type}`);
        });
      }
    },
  },
];
