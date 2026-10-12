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

/** Reset this origin's app data and seed the samples, one puzzle with two solutions, and one with art. */
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
  // A puzzle with saved art (D14), so the solve reveal can be checked. The art
  // is drawn here: a small JPEG, like the one Create saves.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8b04a';
  ctx.fillRect(0, 0, 40, 40);
  const withArt = {
    v: 1,
    id: '',
    title: 'UX check: with art',
    width: 2,
    height: 2,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [
      [1, 1],
      [1, 0],
    ],
    verdict: { status: 'unique-line-solvable', sweeps: 1 },
    art: canvas.toDataURL('image/jpeg', 0.8),
  };
  withArt.id = await puzzleId(withArt);
  store.put('puzzle', withArt);
  ids.withArt = withArt.id;
  return ids;
}

// Heart (5x5): rows '.#.#.', '#####', '#####', '.###.', '..#..'. (0,0) is empty.
const HEART = 'Heart (5x5)';
const SPIDER = 'Spider (20x20)';
const fullHearts = (app) => app.$$('.nng-heart-full').length;
// Runs before every check. Play defaults are cleared too: since D16 a Zen click
// becomes the default, and it would open every later check in Zen.
const clearSaves = (storage) => {
  for (const key of Object.keys(storage)) {
    if (key.startsWith('nng:save:') || key.startsWith('nng:pref:play.')) storage.removeItem(key);
  }
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
    id: 'play-restart-message-zen',
    name: "Restart's confirm says what resets, and that Zen stays on in Zen (UX20)",
    async run(app, ids) {
      const ask = async () => {
        let text = '';
        const real = app.win().confirm;
        app.win().confirm = (m) => ((text = m), false); // answer no: nothing restarts
        try {
          app.buttonByText('Restart', '.nng-rules').click();
        } finally {
          app.win().confirm = real;
        }
        return text;
      };
      await app.open(`#/play/${ids[HEART]}`);
      app.stroke([[1, 0]]);
      const hearts = await ask();
      assert(/hearts and hints reset/.test(hearts), `hearts mode says "${hearts}"`);
      app.toggleByLabel('Zen mode').click();
      const zen = await ask();
      assert(/Zen mode stays on/.test(zen), `Zen mode says "${zen}"`);
    },
  },
  {
    id: 'play-header-sample-badge',
    name: 'The Play header shows the sample name, AI badge, size and difficulty, like the library (UX27, D23)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      const h1 = app.$('.nng-play h1');
      assert(!h1.textContent.includes('AI test sample:'), `header reads "${h1.textContent}"`);
      assert(h1.textContent.startsWith('Heart (5x5)'), `header reads "${h1.textContent}"`);
      assert(h1.querySelector('.nng-badge-ai'), 'no AI badge in the header');
      // D23: size and difficulty next to the title, as in the library row.
      const meta = h1.querySelector('.nng-header-meta')?.textContent;
      assert(meta === '5 x 5 · Medium', `header meta reads "${meta}"`);
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
    id: 'play-solved-strip',
    name: 'After solving, a strip says how long it took and links back to the library (UX5)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      solveHeart(app);
      // Heart has no saved art, so the strip shows at once (no fade to wait for).
      const strip = await waitFor(() => !app.$('.nng-solved-strip').hidden, 'the solved strip');
      assert(strip, 'no solved strip');
      assert(/^Solved in \d\d:\d\d$/.test(app.$('.nng-solved-text').textContent), 'no solve time');
      assert(app.$('.nng-solved-strip a[href="#/library"]'), 'no library link in the strip');
    },
  },
  {
    id: 'play-solve-reveal',
    name: 'Solving a puzzle with saved art fades the picture over the grid, then shows the strip (D14)',
    async run(app, ids) {
      await app.open(`#/play/${ids.withArt}`);
      app.stroke([
        [0, 0],
        [0, 1],
      ]);
      app.stroke([[1, 0]]);
      const art = await waitFor(() => app.$('.nng-art'), 'the picture over the grid');
      assert(!art.classList.contains('nng-art-instant'), 'a fresh solve skipped the fade');
      assert(app.$('.nng-solved-strip').hidden, 'the strip showed before the fade ended');
      await waitFor(() => !app.$('.nng-solved-strip').hidden, 'the strip after the fade', 2500);
      await app.open(`#/play/${ids.withArt}`);
      const again = await waitFor(() => app.$('.nng-art'), 'the picture on reopening');
      assert(again.classList.contains('nng-art-instant'), 'reopening replayed the fade');
      assert(!app.$('.nng-solved-strip').hidden, 'no strip on reopening');
    },
  },
  {
    id: 'play-auto-cross-sweep',
    name: 'Completing a line crosses the rest of it, by default (D19)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(app.toggleByLabel('Auto-cross').checked, 'Auto-cross is not on by default');
      app.stroke([
        [3, 1],
        [3, 2],
        [3, 3],
      ]);
      const ends = [app.cell(3, 0), app.cell(3, 4)];
      assert(
        ends.every((n) => n.classList.contains('nng-crossed')),
        'the rest of the row was not crossed',
      );
      assert(
        ends.some((n) => n.classList.contains('nng-sweep')),
        'the crosses did not sweep in',
      );
    },
  },
  {
    id: 'play-undo-visible',
    name: 'Undo is a visible control, enabled once there is a move to undo (UX3)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      const undo = app.buttonByText('Undo');
      assert(undo && undo.disabled, 'no Undo button, or it is enabled before any move');
      app.stroke([[1, 0]]);
      assert(!undo.disabled, 'Undo still disabled after a move');
      undo.click();
      assert(!app.cell(1, 0).classList.contains('nng-filled'), 'Undo did not undo');
    },
  },
  {
    id: 'play-controls-legend',
    name: 'The play screen says how to fill and cross (UX3)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(/right-drag to cross/i.test(app.$('.nng-legend')?.textContent), 'no controls legend');
    },
  },
  {
    id: 'play-no-hint-gate',
    name: 'Reveal a cell works with no Hints switch, and reveals a filled cell (UX10, D17)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      assert(!app.toggleByLabel('Hints'), 'a Hints switch is still there');
      const reveal = app.buttonByText('Reveal a cell');
      assert(reveal && !reveal.disabled, 'Reveal a cell is disabled');
      reveal.click();
      assert(app.$$('.nng-play .nng-filled').length === 1, 'reveal did not fill exactly one cell');
    },
  },
  {
    id: 'play-hint-counter',
    name: 'Hints used counts each reveal, and every restart path sets it back to 0 (D18)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      const label = () => app.$('.nng-hint-count').textContent;
      const reveal = () => app.buttonByText('Reveal a cell').click();
      assert(label() === 'Hints used: 0', `starts as "${label()}"`);
      reveal();
      reveal();
      assert(label() === 'Hints used: 2', `after two reveals: "${label()}"`);
      app.buttonByText('Undo').click();
      assert(label() === 'Hints used: 2', 'undo refunded a hint');
      await app.withConfirm(true, async () => app.buttonByText('Restart', '.nng-rules').click());
      assert(label() === 'Hints used: 0', `after the Restart button: "${label()}"`);
      // Out of hearts: Continue in Zen keeps the count, the panel's Restart clears it.
      reveal();
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      app.buttonByText('Continue in Zen mode').click();
      assert(label() === 'Hints used: 1', `Continue in Zen changed it: "${label()}"`);
      // Leaving Zen restarts the puzzle, so it clears the count too.
      await app.withConfirm(true, async () => app.toggleByLabel('Zen mode').click());
      assert(label() === 'Hints used: 0', `after leaving Zen: "${label()}"`);
      reveal();
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      app.$('.nng-out button').click();
      assert(label() === 'Hints used: 0', `after the out-of-hearts Restart: "${label()}"`);
    },
  },
  {
    id: 'play-continue-in-zen',
    name: 'Out of hearts offers Continue in Zen mode, which keeps the grid (UX4)',
    async run(app, ids) {
      await app.open(`#/play/${ids[HEART]}`);
      app.stroke([[1, 0]]);
      for (const c of [0, 2, 4]) app.stroke([[0, c]]);
      assert(!app.$('.nng-out').hidden, 'no out-of-hearts panel');
      const restarts = app
        .$$('button')
        .filter((b) => b.textContent === 'Restart' && b.offsetParent);
      assert(restarts.length === 1, `${restarts.length} Restart buttons showing`);
      app.buttonByText('Continue in Zen mode').click();
      assert(app.$('.nng-out').hidden, 'panel still showing');
      assert(app.toggleByLabel('Zen mode').checked, 'Zen not on');
      assert(app.cell(1, 0).classList.contains('nng-filled'), 'the earlier fill was lost');
      app.stroke([[1, 1]]);
      assert(app.cell(1, 1).classList.contains('nng-filled'), 'grid still locked');
    },
  },
  {
    id: 'play-rule-defaults',
    name: 'Turning Zen on also makes it the default for an unstarted puzzle (D16)',
    async run(app, ids) {
      // clearSaves resets the pref before the next check.
      await app.open(`#/play/${ids[HEART]}`);
      app.toggleByLabel('Zen mode').click();
      await app.open(`#/play/${ids['Cat (10x10)']}`);
      assert(app.toggleByLabel('Zen mode').checked, 'unstarted puzzle did not open in Zen');
    },
  },
  {
    id: 'play-25x25-fits-desktop',
    name: "Cat 25x25's last row is on screen at 1024x768 without scrolling (UX15)",
    async run(app, ids) {
      await app.open(`#/play/${ids['Cat (25x25)']}`);
      await pause(100);
      const bottom = app.cell(24, 24).getBoundingClientRect().bottom;
      assert(bottom <= app.win().innerHeight, `last row ends at ${Math.round(bottom)}px of 768`);
    },
  },
  {
    id: 'play-zero-clue',
    name: "An empty line shows a 0 clue, styled as done (Spider's last row)",
    async run(app, ids) {
      await app.open(`#/play/${ids[SPIDER]}`);
      const lastRow = app.cell(19, 0).style.gridRow;
      const zero = app
        .$$('.nng-play .nng-clue-row')
        .find((n) => n.style.gridRow === lastRow && n.textContent === '0');
      assert(zero, 'no 0 clue on the last row');
      assert(zero.classList.contains('nng-clue-done'), 'the 0 clue is not styled as done');
    },
  },

  // ---- Create (reviewer tasks 7 to 9) ----
  {
    id: 'create-blank-grid-usable',
    name: 'Create opens on a blank grid with cells big enough to draw on, at least 12px (UX1)',
    async run(app) {
      await app.open('#/create');
      const node = await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      const w = node.getBoundingClientRect().width;
      assert(w >= 12, `cells are ${w.toFixed(1)}px wide`);
    },
  },
  {
    id: 'create-no-save-when-empty',
    name: 'Save is disabled while the grid has nothing filled, and the report says why (UX12)',
    async run(app) {
      await app.open('#/create');
      // The reviewer saw Save enabled once the solver report arrived; an empty grid
      // now never runs the solver, so wait for the empty-grid status instead.
      await waitFor(
        () => /Fill in some cells/.test(app.$('.nng-create-report-status')?.textContent ?? ''),
        'the empty-grid status',
        4000,
      );
      await pause(200);
      assert(app.buttonByText('Save to library')?.disabled, 'Save is enabled on an empty grid');
      await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      app.stroke([[0, 0]], 0, '.nng-create-grid-wrap');
      await waitFor(
        () => !app.buttonByText('Save to library')?.disabled,
        'Save enabled after a fill',
        4000,
      );
    },
  },
  {
    id: 'create-undo',
    name: 'Create has Undo and Redo for hand edits (UX13)',
    async run(app) {
      await app.open('#/create');
      await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      const filled = () => app.$$('.nng-create-grid-wrap .nng-filled').length;
      app.stroke(
        [
          [0, 0],
          [0, 1],
        ],
        0,
        '.nng-create-grid-wrap',
      );
      assert(filled() === 2, `stroke filled ${filled()}`);
      app.buttonByText('Undo').click();
      assert(filled() === 0, `after Undo: ${filled()}`);
      app.buttonByText('Redo').click();
      assert(filled() === 2, `after Redo: ${filled()}`);
    },
  },
  {
    id: 'create-draft-survives-navigation',
    name: 'Going to the library and back keeps unsaved Create edits (UX2)',
    async run(app) {
      await app.open('#/create');
      await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      app.stroke([[0, 0]], 0, '.nng-create-grid-wrap');
      await app.go('#/library');
      await app.go('#/create');
      const cell = await waitFor(() => app.cell(0, 0, '.nng-create-grid-wrap'), 'the grid again');
      assert(cell.classList.contains('nng-filled'), 'the edit was lost');
    },
  },
  {
    id: 'create-save-duplicate-keeps-title',
    name: 'Saving a grid already in the library keeps the existing puzzle and links to it (UX18)',
    async run(app, ids, storage) {
      // Draw Heart (5x5) by hand: the same grid as the sample, so the same id.
      await app.open('#/create');
      await waitFor(() => app.$('.nng-create-grid-wrap .nng-cell'), 'a grid cell');
      const sizes = app.$$('.nng-create select').slice(0, 2);
      for (const s of sizes) {
        s.value = '5';
        s.dispatchEvent(new (app.win().Event)('change', { bubbles: true }));
      }
      await waitFor(() => app.$$('.nng-create-grid-wrap .nng-cell').length === 25, 'a 5x5 grid');
      const rows = ['.#.#.', '#####', '#####', '.###.', '..#..'];
      rows.forEach((row, r) =>
        [...row].forEach((ch, c) => ch === '#' && app.stroke([[r, c]], 0, '.nng-create-grid-wrap')),
      );
      app.$('.nng-create input[type=text]').value = 'UX check: duplicate';
      const save = await waitFor(
        () => {
          const b = app.buttonByText('Save to library');
          return b && !b.disabled && b;
        },
        'Save enabled',
        6000,
      );
      save.click();
      const msg = await waitFor(
        () => /already in your library/.test(app.$('.nng-create-save-msg')?.textContent ?? ''),
        'the already-in-library message',
      );
      assert(msg, 'no message');
      assert(app.$(`.nng-create-save-msg a[href="#/play/${ids[HEART]}"]`), 'no Open it link');
      const stored = JSON.parse(storage.getItem(`nng:puzzle:${ids[HEART]}`));
      assert(stored.title === 'AI test sample: Heart (5x5)', `title became "${stored.title}"`);
    },
  },
  {
    id: 'create-grid-fits-375',
    name: 'At 375px the Create grid fits the screen (UX24)',
    async run(app) {
      await app.open('#/create', 375);
      const grid = await waitFor(() => app.$('.nng-create .nng-grid'), 'the grid');
      await pause(100);
      const right = grid.getBoundingClientRect().right;
      assert(right <= app.win().innerWidth, `grid reaches ${Math.round(right)}px of 375`);
      const doc = app.doc().documentElement;
      assert(doc.scrollWidth <= doc.clientWidth, 'the page scrolls sideways');
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
    id: 'library-delete-is-tucked-away',
    name: 'Play is the one primary action; Delete sits in a More menu and names the puzzle (UX8)',
    async run(app) {
      await app.open('#/library');
      const row = await waitFor(
        () => app.$$('.nng-lib-row').find((r) => r.textContent.includes('Heart')),
        'the Heart row',
      );
      const primary = row.querySelectorAll('.nng-btn-primary');
      assert(
        primary.length === 1 && primary[0].textContent === 'Play',
        'Play is not the one primary',
      );
      const more = row.querySelector('details.nng-more');
      assert(more && !more.open, 'no closed More menu');
      const del = [...more.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
      // offsetParent stays set inside a closed <details>; checkVisibility sees it hidden.
      assert(del && !del.checkVisibility(), 'Delete missing, or visible while the menu is closed');
      more.open = true;
      let message = '';
      const real = app.win().confirm;
      app.win().confirm = (m) => ((message = m), false); // answer no: nothing is deleted
      try {
        del.click();
      } finally {
        app.win().confirm = real;
      }
      assert(/Heart/.test(message), `confirm does not name the puzzle: "${message}"`);
      assert(row.isConnected, 'the row went away after answering no');
    },
  },
  {
    id: 'narrow-more-menu-on-screen',
    name: 'At 375px the More menu opens fully on screen (UX21)',
    async run(app) {
      await app.open('#/library', 375);
      const rows = await waitFor(
        () => app.$$('.nng-lib-row').length && app.$$('.nng-lib-row'),
        'rows',
      );
      for (const row of [rows[0], rows[rows.length - 1]]) {
        const more = row.querySelector('details.nng-more');
        more.open = true;
        const box = more.querySelector('.nng-more-panel').getBoundingClientRect();
        more.open = false;
        assert(
          box.left >= 0 && box.right <= app.win().innerWidth,
          `panel spans ${Math.round(box.left)} to ${Math.round(box.right)}`,
        );
      }
    },
  },
  {
    id: 'library-sample-badge',
    name: 'Samples show their name plus an "AI test sample" badge (D15)',
    async run(app) {
      await app.open('#/library');
      const row = await waitFor(
        () => app.$$('.nng-lib-row').find((r) => r.textContent.includes('Heart')),
        'the Heart row',
      );
      assert(row.querySelector('.nng-lib-title').textContent === 'Heart (5x5)', 'title not split');
      assert(row.querySelector('.nng-badge-ai'), 'no AI badge');
    },
  },
  {
    id: 'library-restart-reads-not-started',
    name: 'A restarted puzzle you only looked at reads "not started" (UX14, gate pass 3 H1)',
    async run(app, ids) {
      await app.open(`#/play/${ids[SPIDER]}`);
      app.stroke([[0, 9]]);
      await app.withConfirm(true, async () => app.buttonByText('Restart', '.nng-rules').click());
      // Look at the clean grid for over a second: the clock waits for the first click.
      await pause(1500);
      await app.go('#/library');
      const row = await waitFor(
        () => app.$$('.nng-lib-row').find((r) => r.textContent.includes('Spider')),
        'the Spider row',
      );
      assert(!row.textContent.includes('in progress'), 'reads "in progress"');
      assert(row.textContent.includes('not started'), 'does not read "not started"');
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
    id: 'theme-auto-label',
    name: 'Theme: auto says which theme it picked (UX16)',
    async run(app, ids, storage) {
      storage.removeItem('nng:pref:theme');
      await app.open('#/library');
      const text = app.$('#theme-toggle').textContent;
      assert(/^Theme: auto \((day|evening)\)$/.test(text), `reads "${text}"`);
    },
  },
  {
    id: 'narrow-nav-fits',
    name: 'At 375px every nav control is on screen (UX6)',
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
    name: 'Every Create input and dropdown has its own label (UX a11y)',
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
