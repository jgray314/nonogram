// Lightweight UX checks, drawn from what the UX reviewer did by hand in UX
// pass 1 (nonogram-ux-review.md). Each check drives the real app the same way
// and asserts what a player should see. A check tied to an open UX finding
// carries `known: 'UX<n>'`: it shows as a known issue while it fails, and as
// "fixed?" once it passes, which is the cue to drop the flag.
import { createStore } from '../../src/store.js';
import { samplePuzzles } from '../../src/samples.js';
import { puzzleId } from '../../src/format.js';
import { pause, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

/** Reset this origin's app data and seed the samples plus one puzzle with two solutions. */
export async function seed(storage) {
  for (const key of Object.keys(storage)) if (key.startsWith('nng:')) storage.removeItem(key);
  const store = createStore(storage);
  const ids = {};
  for (const p of await samplePuzzles()) {
    store.put('puzzle', p);
    ids[p.title.replace('AI test sample: ', '')] = p.id;
  }
  const twoWays = {
    v: 1,
    id: '',
    title: 'UX check: two solutions',
    width: 2,
    height: 2,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [
      [1, 0],
      [0, 1],
    ],
    verdict: { status: 'multiple', sweeps: 0 },
  };
  twoWays.id = await puzzleId(twoWays);
  store.put('puzzle', twoWays);
  ids.twoWays = twoWays.id;
  return ids;
}

// Heart (5x5): rows '.#.#.', '#####', '#####', '.###.', '..#..'. (0,0) is empty.
const HEART = 'Heart (5x5)';
const SPIDER = 'Spider (20x20)';
const fullHearts = (app) => app.$$('.nng-heart-full').length;
const clearSaves = (storage) => {
  for (const key of Object.keys(storage)) if (key.startsWith('nng:save:')) storage.removeItem(key);
};

/** Fill Heart's whole solution, row by row. */
function solveHeart(app) {
  const rows = ['.#.#.', '#####', '#####', '.###.', '..#..'];
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && app.stroke([[r, c]])));
}

export const CHECKS = [
  // ---- Play: hearts, mistakes, recovery (reviewer tasks 1 to 5) ----
  {
    id: 'play-hearts-at-start',
    name: 'A puzzle with one solution opens with 3 full hearts',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(fullHearts(app) === 3, `expected 3 hearts, saw ${fullHearts(app)}`);
    },
  },
  {
    id: 'play-wrong-fill',
    name: 'A wrong fill becomes a red cross on that square and costs one heart',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.stroke([[0, 0]]);
      const node = app.cell(0, 0);
      assert(node.classList.contains('nng-crossed'), 'the wrong cell is not crossed');
      assert(node.classList.contains('nng-wrong'), 'the wrong cell is not marked');
      assert(fullHearts(app) === 2, `expected 2 hearts, saw ${fullHearts(app)}`);
    },
  },
  {
    id: 'play-wrong-cross-free',
    name: 'Crossing a cell that should be filled costs nothing',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.stroke([[1, 0]], 2);
      assert(fullHearts(app) === 3, `expected 3 hearts, saw ${fullHearts(app)}`);
    },
  },
  {
    id: 'play-out-of-hearts',
    name: 'At 0 hearts the grid locks, the switches disable, and Restart is offered',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      assert(!app.$('.nng-out').hidden, 'no out-of-hearts panel');
      assert(app.$('.nng-grid-holder').classList.contains('nng-locked'), 'grid not locked');
      assert(
        app.$$('.nng-rules input').every((i) => i.disabled),
        'a switch is still enabled',
      );
      app.stroke([[1, 0]]);
      assert(!app.cell(1, 0).classList.contains('nng-filled'), 'a locked grid accepted a move');
    },
  },
  {
    id: 'play-restart-after-loss',
    name: 'Restart from the out-of-hearts panel gives a clean grid and 3 hearts',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      app.$('.nng-out button').click();
      assert(fullHearts(app) === 3, `expected 3 hearts, saw ${fullHearts(app)}`);
      assert(
        app.$$('.nng-play .nng-filled, .nng-play .nng-crossed').length === 0,
        'grid not clean',
      );
      assert(app.$('.nng-out').hidden, 'out-of-hearts panel still showing');
    },
  },
  {
    id: 'play-zen-square-only',
    name: 'Zen: a wrong fill is still marked at the square, but costs nothing',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.toggleByLabel('Zen mode').click();
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      assert(app.cell(0, 0).classList.contains('nng-crossed'), 'wrong fill not corrected in Zen');
      assert(app.$('.nng-hearts').hidden, 'hearts shown in Zen');
      assert(app.$('.nng-out').hidden, 'Zen locked the grid');
    },
  },
  {
    id: 'play-leave-zen-restarts',
    name: 'Switching from Zen back to hearts asks first, then restarts',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.toggleByLabel('Zen mode').click();
      app.stroke([[1, 0]]);
      const asked = await app.withConfirm(true, async () => app.toggleByLabel('Zen mode').click());
      assert(asked === 1, 'no confirm before restarting');
      assert(!app.cell(1, 0).classList.contains('nng-filled'), 'grid kept its progress');
      assert(fullHearts(app) === 3, 'hearts not back to 3');
    },
  },
  {
    id: 'play-clue-done-on-completion',
    name: 'A clue number greys out once its block is complete, with no crosses needed',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.stroke([
        [1, 0],
        [1, 4],
      ]);
      const done = app.$$('.nng-clue-row.nng-clue-done').map((n) => n.textContent);
      assert(done.length === 1 && done[0] === '5', `row clues done: [${done}]`);
    },
  },
  {
    id: 'play-empty-lines-crossed',
    name: 'Empty rows start crossed (Spider has an empty bottom row)',
    async run(app, ids) {
      await app.open(`#/play/${ids[SPIDER]}`);
      const row = app.$$('.nng-play .nng-cell[data-r="19"]');
      assert(row.length === 20, 'row 19 not found');
      assert(
        row.every((n) => n.classList.contains('nng-crossed')),
        'empty row not crossed',
      );
    },
  },
  {
    id: 'play-two-solutions-free-play',
    name: 'A puzzle with two solutions plays in Zen, without hearts, and says why',
    async run(app, ids) {
      await app.open(`#/play/${ids.twoWays}`);
      assert(app.$('.nng-hearts').hidden, 'hearts shown');
      const zen = app.toggleByLabel('Zen mode');
      assert(zen.checked && zen.disabled, 'Zen not forced on');
      assert(/unique solution/.test(app.$('.nng-note').textContent), 'no explanation shown');
    },
  },
  {
    id: 'play-solve',
    name: 'Solving shows "Solved"',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      solveHeart(app);
      assert(!app.$('.nng-solved').hidden, 'no solved message');
    },
  },
  {
    id: 'play-solved-next-step',
    known: 'UX5',
    name: 'After solving, a next step (back to the library) is offered next to "Solved"',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      solveHeart(app);
      const near = app.$('.nng-solved')?.parentElement;
      assert(near?.querySelector('a[href="#/library"]'), 'no library link near Solved');
    },
  },
  {
    id: 'play-undo-visible',
    known: 'UX3',
    name: 'Undo is a visible control, not only Ctrl+Z',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(app.buttonByText('Undo'), 'no Undo button');
    },
  },
  {
    id: 'play-controls-legend',
    known: 'UX3',
    name: 'The play screen says how to fill and cross',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(/right/i.test(app.$('.nng-play').textContent), 'no mention of right-drag to cross');
    },
  },
  {
    id: 'play-no-hint-gate',
    known: 'UX10',
    name: 'Reveal a cell works without first ticking a separate Hints switch',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      const reveal = app.buttonByText('Reveal a cell');
      assert(reveal && !reveal.disabled, 'Reveal a cell is disabled');
    },
  },

  // ---- Create (reviewer tasks 7 to 9) ----
  {
    id: 'create-blank-grid-usable',
    known: 'UX1',
    name: 'Blank grid shows cells big enough to draw on (at least 12px)',
    async run(app) {
      await app.open('#/create');
      app.buttonByText('Blank grid').click();
      const node = await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      const w = node.getBoundingClientRect().width;
      assert(w >= 12, `cells are ${w.toFixed(1)}px wide`);
    },
  },
  {
    id: 'create-no-save-when-empty',
    known: 'UX12',
    name: 'Save is disabled while the grid has nothing filled (as first opened)',
    async run(app) {
      await app.open('#/create');
      // The reviewer saw Save enabled once the solver report arrived, so wait for it.
      await waitFor(
        () => /solution/.test(app.$('.nng-create-report-status')?.textContent ?? ''),
        'the solver verdict',
        4000,
      );
      await pause(200);
      assert(app.buttonByText('Save to library')?.disabled, 'Save is enabled on an empty grid');
    },
  },
  {
    id: 'create-leave-warns',
    known: 'UX2',
    name: 'Leaving Create with unsaved edits asks first',
    async run(app) {
      await app.open('#/create');
      app.buttonByText('Blank grid').click();
      await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      app.stroke([[0, 0]], 0, '.nng-create-grid-wrap');
      const asked = await app.withConfirm(false, () => app.go('#/library'));
      assert(asked >= 1, 'left Create without asking');
    },
  },

  // ---- Library (reviewer tasks 1 and 11) ----
  {
    id: 'library-empty-guidance',
    name: 'An empty library says how to get started',
    async run(app, ids, storage) {
      for (const key of Object.keys(storage)) if (key.startsWith('nng:')) storage.removeItem(key);
      await app.open('#/library');
      assert(app.$('.nng-empty'), 'no empty-state message');
      await seed(storage).then((fresh) => Object.assign(ids, fresh));
    },
  },
  {
    id: 'library-restart-reads-new',
    known: 'UX14',
    name: 'A restarted puzzle with only automatic crosses does not read "in progress"',
    async run(app, ids) {
      await app.open(`#/play/${ids[SPIDER]}`);
      app.stroke([[0, 9]]);
      await app.withConfirm(true, async () => app.buttonByText('Restart', '.nng-rules').click());
      await app.go('#/library');
      const row = await waitFor(
        () => app.$$('.nng-lib-row').find((r) => r.textContent.includes('Spider')),
        'the Spider row',
      );
      assert(!row.textContent.includes('in progress'), 'reads "in progress"');
    },
  },

  // ---- Print (reviewer task 10) ----
  {
    id: 'print-key-hidden-then-toggle',
    name: 'Print hides the answer key until "Include answer key" is ticked',
    async run(app, ids) {
      await app.open(`#/print/${ids[HEART]}`);
      const key = app.$('.nng-print-key');
      assert(key.hidden, 'answer key showing by default');
      app.$('.nng-print-keytoggle input').click();
      assert(!key.hidden, 'answer key did not appear when ticked');
    },
  },

  // ---- Layout and accessibility basics ----
  {
    id: 'narrow-nav-fits',
    known: 'UX6',
    name: 'At 375px every nav control is on screen',
    async run(app) {
      await app.open('#/library', 375);
      const right = Math.max(...app.$$('.nng-nav > *').map((n) => n.getBoundingClientRect().right));
      assert(right <= app.win().innerWidth, `nav reaches ${Math.round(right)}px of 375`);
    },
  },
  {
    id: 'a11y-buttons-named',
    name: 'Every button on the play and library screens has a name',
    async run(app, ids) {
      for (const hash of [`#/play/${ids[HEART]}`, '#/library']) {
        await app.open(hash);
        const unnamed = app
          .$$('button')
          .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label'));
        assert(unnamed.length === 0, `${unnamed.length} unnamed button(s) on ${hash}`);
      }
    },
  },
  {
    id: 'a11y-create-inputs-labelled',
    known: 'UX a11y',
    name: 'Every Create input and dropdown has its own label',
    async run(app) {
      await app.open('#/create');
      const controls = app
        .$$('.nng-create input, .nng-create select')
        .filter((i) => i.type !== 'file' && !i.hidden);
      // A label wrapping two dropdowns names neither (the reviewer heard the second Tiles one as "1").
      const own = (i) =>
        i.getAttribute('aria-label') ||
        (i.labels?.length === 1 && i.labels[0].querySelectorAll('input, select').length === 1);
      const bare = controls.filter((i) => !own(i));
      assert(bare.length === 0, `${bare.length} control(s) without their own label`);
    },
  },
];

export { clearSaves };
