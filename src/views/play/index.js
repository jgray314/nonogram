// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid, inkColors } from '../grid.js';
import { puzzleClues } from '../../clues.js';
import { elc } from '../dom.js';
import { buildView } from './build.js';
import { createHud } from './hud.js';
import { createPersist, loadSave } from './persist.js';
import { createRulesLayout } from './rules-layout.js';
import { createSession } from './session.js';
import { heartsAvailable, helpersAvailability } from '../../game.js';
import { createStore } from '../../store.js';
import { validatePuzzle } from '../../format.js';

const CSS_HREF = 'css/play.css';
const PREF_KEYS = { zen: 'play.zen', autoCross: 'play.autoCross' };

function ensureCss() {
  if (document.querySelector(`link[data-nng="play"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.dataset.nng = 'play';
  document.head.append(link);
}

function loadPuzzle(store, id) {
  const rec = store.get('puzzle', id);
  return rec && validatePuzzle(rec).ok ? rec : null;
}

let root = null;
let grid = null;
let cleanup = [];
let persistNow = () => {};
// Bumped by mount and unmount; async handlers check it before touching the page.
let generation = 0;
// One-shot notes for the next mount of a puzzle, by id. Import save remounts the
// view, which wipes the toolbar message, so a note that must survive the remount
// waits here. Never part of the save record.
const pendingNotes = new Map();

function showMissing(el_) {
  const box = elc('section', 'nng-play');
  box.append(elc('h1', undefined, 'Puzzle not found'));
  const p = elc('p', undefined, 'That puzzle is missing or invalid. ');
  const a = elc('a', undefined, 'Back to the library');
  a.href = '#/library';
  p.append(a);
  box.append(p);
  el_.append(box);
  return box;
}

export function mount(container, params = {}) {
  generation += 1;
  ensureCss();
  let store;
  try {
    store = createStore();
  } catch {
    store = null;
  }
  const puzzle = store ? loadPuzzle(store, params.id) : null;
  if (!puzzle) {
    root = showMissing(container);
    return;
  }

  const inks = inkColors(puzzle.palette);
  const multi = inks !== null && inks.length > 1;
  const pendingNote = pendingNotes.get(puzzle.id);
  if (pendingNote) pendingNotes.delete(puzzle.id);
  const refs = buildView({ puzzle, inks, multi, pendingNote });
  root = refs.root;
  const { holder, swatches, modeBtns } = refs;
  container.append(root);
  // All mutable per-mount values live here; each is assigned at its original
  // declaration site below. Always read as state.x at call time.
  const state = {
    brush: 1,
    touchMode: 'fill',
    cells: /** @type {number[][]} */ ([]),
    elapsedMs: 0,
    solvedAt: /** @type {number | null} */ (null),
    hearts: 0,
    hints: 0,
    wrongMark: /** @type {number[] | null} */ (null),
    dirty: false,
    started: false,
    history: /** @type {ReturnType<typeof import('../../game.js').createHistory>} */ (
      /** @type {unknown} */ (null)
    ),
    drag: /** @type {{ button: any, path: number[][] } | null} */ (null),
    revealed: false,
    animateReveal: false,
    revealTimer: /** @type {any} */ (null),
    lastTick: 0,
    rules: { zen: false, autoCross: true },
  };
  state.brush = 1;
  swatches.forEach((b, i) => b.addEventListener('click', () => ctx.rulesLayout.pickBrush(i + 1)));
  state.touchMode = 'fill';
  for (const [mode, b] of Object.entries(modeBtns)) {
    b.addEventListener('click', () => {
      state.touchMode = mode;
      ctx.rulesLayout.syncMode();
    });
  }

  const clues = puzzleClues(puzzle.solution);
  // v1's `check` rule is gone (D13): every wrong fill is now flagged on the spot.
  const rules = { zen: false, autoCross: true };
  state.rules = rules;
  const loaded = loadSave({ puzzle, store, state, rules, clues }, PREF_KEYS);
  state.drag = null; // {button, path}

  const helpers = helpersAvailability(puzzle.verdict);
  // Hearts need a unique solution, so a puzzle that isn't fair is forced into Zen mode.
  const heartsOk = heartsAvailable(puzzle.verdict);

  /** @type {import('./context.js').PlayContext} */
  const ctx = {
    puzzle,
    store,
    state,
    rules,
    clues,
    refs,
    prefKeys: PREF_KEYS,
    heartsOk,
    helpers,
    grid: () => grid,
    generation: () => generation,
    loaded,
    pendingNotes,
    clearPersistNow: () => {
      persistNow = () => {};
    },
    remount: (params) => {
      unmount();
      mount(container, params);
    },
    hud: null,
    persist: null,
    rulesLayout: null,
    session: null,
  };
  ctx.hud = createHud(ctx);
  ctx.persist = createPersist(ctx);
  persistNow = ctx.persist.persist;
  ctx.rulesLayout = createRulesLayout(ctx);
  ctx.rulesLayout.pickBrush(1);
  ctx.rulesLayout.syncMode();
  ctx.rulesLayout.syncCoarse();
  const { coarse } = ctx.rulesLayout;
  coarse?.addEventListener?.('change', ctx.rulesLayout.syncCoarse);
  cleanup.push(() => coarse?.removeEventListener?.('change', ctx.rulesLayout.syncCoarse));
  ctx.session = createSession(ctx);

  // Solve reveal (D14): the original crop fades in over the cells. A puzzle with
  // no art, a reopened solved puzzle and reduced motion skip the fade.
  state.revealed = false;
  state.animateReveal = false; // set by the move that solves the puzzle
  state.revealTimer = null;

  grid = renderGrid(holder, {
    width: puzzle.width,
    height: puzzle.height,
    clues,
    cells: state.cells,
    onPointer: ctx.session.onPointer,
    touchButton: () => (state.touchMode === 'cross' ? 'right' : 'left'),
    zeroClues: true,
    palette: puzzle.palette,
    blank: puzzle.blank,
  });
  ctx.hud.refresh();

  ctx.rulesLayout.sizeGrid();
  // Measure again once the first layout and the font have settled: the first pass
  // can see a taller header, which showed the size note on a 25x25 that fits.
  requestAnimationFrame(ctx.rulesLayout.settle);
  document.fonts?.ready.then(ctx.rulesLayout.settle);
  window.addEventListener('resize', ctx.rulesLayout.sizeGrid);
  cleanup.push(() => window.removeEventListener('resize', ctx.rulesLayout.sizeGrid));

  ctx.session.attachHandlers();

  // Timer: accumulate while mounted, the document is visible, and unsolved.
  state.lastTick = Date.now();
  const timer = setInterval(() => ctx.session.tick(), 500);
  document.addEventListener('visibilitychange', ctx.session.onVisibility);
  cleanup.push(() => {
    ctx.session.tick();
    clearInterval(timer);
    clearTimeout(state.revealTimer);
    document.removeEventListener('visibilitychange', ctx.session.onVisibility);
  });

  ctx.persist.attachHandlers();

  document.addEventListener('keydown', ctx.session.onKey);
  cleanup.push(() => document.removeEventListener('keydown', ctx.session.onKey));
}

export function unmount() {
  generation += 1;
  for (const fn of cleanup) fn(); // includes the final timer tick
  cleanup = [];
  persistNow();
  persistNow = () => {};
  grid?.destroy();
  root?.remove();
  grid = null;
  root = null;
}
