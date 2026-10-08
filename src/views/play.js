// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid } from './grid.js';
import { puzzleClues } from '../clues.js';
import { applyStroke, strokeCells } from '../play-state.js';
import { createHistory, isSolved, satisfiedLines } from '../game.js';
import { createStore } from '../store.js';
import { validatePuzzle, validateSave } from '../format.js';
import { serializeSaveFile, parseSaveFile, importWrites } from '../save.js';

const CSS_HREF = 'css/play.css';

// Dev-only built-in puzzle for id "demo"; it is never written to the store.
const DEMO_ART = [
  '..########',
  '.#........',
  '#.##..##.#',
  '#.##..##.#',
  '#........#',
  '#.#....#.#',
  '#..####..#',
  '.#......#.',
  '..#....#..',
  '...####...',
];
const DEMO = {
  v: 1,
  id: 'demo',
  title: 'Demo (dev only)',
  width: 10,
  height: 10,
  palette: [{ name: 'Black', hex: '#20252c' }],
  solution: DEMO_ART.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0))),
  verdict: { status: 'unique-line-solvable', sweeps: 2 },
};

function ensureCss() {
  if (document.querySelector(`link[data-nng="play"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.dataset.nng = 'play';
  document.head.append(link);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadPuzzle(store, id) {
  if (id === 'demo') return DEMO;
  const rec = store.get('puzzle', id);
  return rec && validatePuzzle(rec).ok ? rec : null;
}

/** Crosses are hidden and unknowns shown empty once the puzzle is solved. */
const reveal = (cells) => cells.map((row) => row.map((v) => (v >= 1 ? v : 0)));
const blank = (puzzle) => puzzle.solution.map((row) => row.map(() => 0));
const sameGrid = (a, b) => a.every((row, r) => row.every((v, c) => v === b[r][c]));

let root = null;
let grid = null;
let cleanup = [];
let persistNow = () => {};

function showMissing(el_) {
  const box = el('section', 'nng-play');
  box.append(el('h1', undefined, 'Puzzle not found'));
  const p = el('p', undefined, 'That puzzle is missing or invalid. ');
  const a = el('a', undefined, 'Back to the library');
  a.href = '#/library';
  p.append(a);
  box.append(p);
  el_.append(box);
  return box;
}

export function mount(container, params = {}) {
  ensureCss();
  let store;
  try {
    store = createStore();
  } catch {
    store = null;
  }
  const puzzle = store || params.id === 'demo' ? loadPuzzle(store, params.id) : null;
  if (!puzzle) {
    root = showMissing(container);
    return;
  }

  root = el('section', 'nng-play');
  const title = el('h1', undefined, puzzle.title || 'Untitled');
  const status = el('div', 'nng-status');
  const solvedMsg = el('span', 'nng-solved');
  solvedMsg.hidden = true;
  const count = el('span', 'nng-count');
  status.append(solvedMsg, count);
  const holder = el('div', 'nng-grid-holder');
  const toolbar = el('div', 'nng-toolbar');
  const exportBtn = el('button', undefined, 'Export save');
  exportBtn.type = 'button';
  const importBtn = el('button', undefined, 'Import save');
  importBtn.type = 'button';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  const message = el('span', 'nng-msg');
  toolbar.append(exportBtn, importBtn, fileInput, message);
  root.append(title, status, toolbar, holder);
  container.append(root);

  const clues = puzzleClues(puzzle.solution);
  const rules = { check: false, hint: false, autoCross: false };
  let cells = blank(puzzle);
  let elapsedMs = 0;
  let solvedAt = null;
  let dirty = false;
  const existing = store ? store.get('save', puzzle.id) : null;
  const loaded = existing && validateSave(existing, puzzle).ok ? existing : null;
  if (loaded) {
    cells = loaded.cells.map((row) => row.slice());
    elapsedMs = loaded.elapsedMs;
    solvedAt = loaded.solvedAt;
    Object.assign(rules, loaded.rules);
  }
  const history = createHistory(cells);

  const snapshot = () => ({ puzzleId: puzzle.id, cells, elapsedMs, rules: { ...rules }, solvedAt });
  function persist() {
    if (!store || !(dirty || loaded)) return;
    try {
      store.put('save', snapshot());
    } catch {
      // Storage full or unavailable: play on; the next save may succeed.
    }
  }
  persistNow = persist;
  let drag = null; // {button, path}

  const preview = () => {
    if (!drag) return;
    grid.update(applyStroke(cells, drag));
    count.textContent = `${strokeCells(cells, drag).length} cells`;
  };

  function refresh() {
    grid.update(solvedAt === null ? cells : reveal(cells));
    grid.setSatisfied(satisfiedLines(cells, clues));
    solvedMsg.hidden = solvedAt === null;
    solvedMsg.textContent = solvedAt === null ? '' : 'Solved';
    count.textContent = '';
  }

  /** One committed move (a stroke, or later a hint) is one undo step. */
  function commit(next) {
    if (sameGrid(cells, next)) return;
    cells = next;
    history.push(cells);
    if (isSolved(cells, clues)) solvedAt = Date.now();
    dirty = true;
    refresh();
    persist();
  }

  function onPointer({ type, r, c, button }) {
    if (solvedAt !== null) return;
    if (type === 'down') {
      drag = { button, path: [[r, c]] };
      preview();
    } else if (drag && type === 'enter' && r !== null) {
      drag.path.push([r, c]);
      preview();
    } else if (drag && type === 'up') {
      if (r !== null) drag.path.push([r, c]);
      const finished = drag;
      drag = null;
      commit(applyStroke(cells, finished));
    }
  }

  grid = renderGrid(holder, {
    width: puzzle.width,
    height: puzzle.height,
    clues,
    cells,
    onPointer,
  });
  refresh();

  function step(fn) {
    if (solvedAt !== null || drag) return;
    cells = fn();
    dirty = true;
    refresh();
    persist();
  }

  exportBtn.addEventListener('click', () => {
    const blob = new Blob([serializeSaveFile(puzzle, snapshot())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = `${(puzzle.title || 'puzzle').replace(/[^\w-]+/g, '-')}.nng.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!store) {
      message.textContent = 'Import failed: storage unavailable';
      return;
    }
    const parsed = parseSaveFile(await file.text());
    if (!parsed.ok) {
      message.textContent = `Import failed: ${parsed.error}`;
      return;
    }
    try {
      for (const w of importWrites(parsed, store)) store.put(w.kind, w.record);
    } catch {
      message.textContent = 'Import failed: could not write to storage';
      return;
    }
    // Drop the live state so unmount does not overwrite the imported save.
    persistNow = () => {};
    const target = `#/play/${encodeURIComponent(parsed.puzzle.id)}`;
    if (location.hash === target) {
      unmount();
      mount(container, { id: parsed.puzzle.id });
    } else {
      location.hash = target;
    }
  });

  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) step(history.undo);
    else if (k === 'y' || (k === 'z' && e.shiftKey)) step(history.redo);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  cleanup.push(() => document.removeEventListener('keydown', onKey));
}

export function unmount() {
  persistNow();
  persistNow = () => {};
  for (const fn of cleanup) fn();
  cleanup = [];
  grid?.destroy();
  root?.remove();
  grid = null;
  root = null;
}
