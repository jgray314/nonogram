// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid, gutterSize, inkColors } from '../grid.js';
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
  const { outPanel, sizeNote, holder, swatches, legend, legendText, modeBar, modeBtns, belowRow } =
    refs;
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
  swatches.forEach((b, i) => b.addEventListener('click', () => pickBrush(i + 1)));
  function pickBrush(v) {
    state.brush = v;
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === state.brush)));
  }
  pickBrush(1);
  state.touchMode = 'fill';
  for (const [mode, b] of Object.entries(modeBtns)) {
    b.addEventListener('click', () => {
      state.touchMode = mode;
      syncMode();
    });
  }
  function syncMode() {
    for (const [mode, b] of Object.entries(modeBtns)) {
      b.setAttribute('aria-pressed', String(mode === state.touchMode));
      b.classList.toggle('nng-mode-on', mode === state.touchMode);
    }
  }
  syncMode();
  const coarse = window.matchMedia?.('(pointer: coarse)');
  function syncCoarse() {
    const on = !!coarse?.matches;
    modeBar.hidden = !on;
    legend.textContent = on ? legendText.touch : legendText.mouse;
  }
  syncCoarse();
  coarse?.addEventListener?.('change', syncCoarse);
  cleanup.push(() => coarse?.removeEventListener?.('change', syncCoarse));

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
    container,
    cleanup,
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
    zen: () => ctx.session.zen(),
    outOfHearts: () => ctx.session.outOfHearts(),
  };
  ctx.hud = createHud(ctx);
  ctx.persist = createPersist(ctx);
  persistNow = ctx.persist.persist;
  ctx.rulesLayout = createRulesLayout(ctx);
  // TEMP: until the rules-layout lane lands, expose its two functions on the stub.
  Object.assign(ctx.rulesLayout, { pickBrush, rememberRule });
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

  // Cell size: the largest of 16..32px that fits the grid and its clue
  // gutters in the window below the header, and in the main column's width.
  // Smaller windows scroll inside the holder, where the clues stay put.
  function sizeGrid() {
    const gutter = gutterSize(clues, { zeroClues: true });
    const px = (name, fallback) =>
      parseFloat(getComputedStyle(holder).getPropertyValue(name)) || fallback;
    const clueW = px('--clue-w', 22);
    const clueH = px('--clue-h', 18);
    const chrome = 28; // holder padding (16) and the grid's own padding (12)
    // The out-of-hearts panel and the size note aren't part of the steady layout,
    // so the note appearing can't change the size that decided to show it.
    const lost =
      (outPanel.hidden ? 0 : outPanel.offsetHeight + 8) +
      (sizeNote.hidden ? 0 : sizeNote.offsetHeight + 8);
    // Room under the grid for the legend and the solved strip, so "Back to
    // library" lands on screen after a solve.
    const below = belowRow.offsetHeight + 44;
    const avail =
      window.innerHeight -
      (holder.getBoundingClientRect().top + window.scrollY - lost) -
      below -
      16;
    const byHeight = (avail - chrome - gutter.top * clueH) / puzzle.height;
    const byWidth = (holder.clientWidth - chrome - gutter.left * clueW) / puzzle.width;
    const size = Math.max(16, Math.min(32, Math.floor(Math.min(byHeight, byWidth))));
    // D20: at the 16px floor and still too big for the holder, say the grid scrolls.
    sizeNote.hidden = !(
      holder.clientWidth > 0 && // no layout (a test DOM) means nothing to measure
      size === 16 &&
      (puzzle.width * 16 + gutter.left * clueW + chrome > holder.clientWidth ||
        puzzle.height * 16 + gutter.top * clueH + chrome > avail)
    );
    holder.style.setProperty('--cell', `${size}px`);
    holder.style.maxHeight = `${Math.max(200, Math.floor(avail))}px`;
  }
  sizeGrid();
  // Measure again once the first layout and the font have settled: the first pass
  // can see a taller header, which showed the size note on a 25x25 that fits.
  const settle = () => holder.isConnected && sizeGrid();
  requestAnimationFrame(settle);
  document.fonts?.ready.then(settle);
  window.addEventListener('resize', sizeGrid);
  cleanup.push(() => window.removeEventListener('resize', sizeGrid));

  function rememberRule(key, value) {
    if (!store || !(key in PREF_KEYS)) return;
    try {
      store.setPref(PREF_KEYS[key], value);
    } catch {
      // Storage unavailable: the switch still works for this puzzle.
    }
  }
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
