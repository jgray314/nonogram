// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid } from './grid.js';
import { puzzleClues } from '../clues.js';
import { applyStroke, strokeCells } from '../play-state.js';
import {
  autoCross,
  createHistory,
  helpersAvailability,
  hintCell,
  isSolved,
  satisfiedLines,
  wrongFills,
} from '../game.js';
import { createStore } from '../store.js';
import { validatePuzzle, validateSave, idMatches } from '../format.js';
import { serializeSaveFile, parseSaveFile, importWrites } from '../save.js';

const CSS_HREF = 'css/play.css';

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
  const puzzle = store ? loadPuzzle(store, params.id) : null;
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
  const timerEl = el('span', 'nng-timer');
  status.append(timerEl, solvedMsg, count);
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
  const rulesBar = el('div', 'nng-rules');
  const toggles = {};
  for (const [key, label] of [
    ['check', 'Check mistakes'],
    ['hint', 'Hints'],
    ['autoCross', 'Auto-cross'],
  ]) {
    const wrap = el('label', 'nng-toggle');
    const box = el('input');
    box.type = 'checkbox';
    toggles[key] = box;
    wrap.append(box, document.createTextNode(` ${label}`));
    rulesBar.append(wrap);
  }
  const hintBtn = el('button', undefined, 'Reveal a cell');
  hintBtn.type = 'button';
  const ruleNote = el('span', 'nng-note');
  rulesBar.append(hintBtn, ruleNote);
  root.append(title, status, rulesBar, toolbar, holder);
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
    for (const key of Object.keys(rules)) rules[key] = loaded.rules[key] === true;
  }
  const history = createHistory(cells);
  // A puzzle can be satisfied before any move: an all-blank tile has only empty
  // clues. Filling anything would break it, so count it solved on open.
  if (solvedAt === null && isSolved(cells, clues)) {
    solvedAt = Date.now();
    dirty = true;
  }

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

  const helpers = helpersAvailability(puzzle.verdict);
  const formatTime = (ms) => {
    const total = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  };

  function refresh() {
    const checkOn = rules.check && helpers.enabled && solvedAt === null;
    grid.setWrong(checkOn ? wrongFills(cells, puzzle.solution) : []);
    for (const key of Object.keys(toggles)) {
      toggles[key].checked = rules[key];
      toggles[key].disabled = key !== 'autoCross' && !helpers.enabled;
    }
    hintBtn.disabled = !(rules.hint && helpers.enabled) || solvedAt !== null;
    ruleNote.textContent = helpers.note;
    timerEl.textContent = formatTime(elapsedMs);
    grid.update(solvedAt === null ? cells : reveal(cells));
    grid.setSatisfied(satisfiedLines(cells, clues));
    holder.classList.toggle('nng-celebrate', solvedAt !== null); // styling hook for the solve glow
    solvedMsg.hidden = solvedAt === null;
    solvedMsg.textContent = solvedAt === null ? '' : 'Solved';
    count.textContent = '';
  }

  /** One committed move (a stroke, or later a hint) is one undo step. */
  function commit(next) {
    if (sameGrid(cells, next)) return;
    // Auto-cross rides in the same undo step as the move that completed a line.
    if (rules.autoCross) next = autoCross(next, clues, cells);
    cells = next;
    history.push(cells);
    if (isSolved(cells, clues)) {
      tick(); // bank the time up to the solving move
      solvedAt = Date.now();
    }
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

  for (const [key, box] of Object.entries(toggles)) {
    box.addEventListener('change', () => {
      rules[key] = box.checked;
      dirty = true;
      refresh();
      persist();
    });
  }
  hintBtn.addEventListener('click', () => {
    if (solvedAt !== null || drag || !rules.hint || !helpers.enabled) return;
    const hint = hintCell(cells, puzzle.solution);
    if (!hint) return;
    const next = cells.map((row) => row.slice());
    next[hint.r][hint.c] = hint.value;
    commit(next);
  });

  // Timer: accumulate while mounted, the document is visible, and unsolved.
  let lastTick = Date.now();
  const tick = () => {
    const now = Date.now();
    if (!document.hidden && solvedAt === null) elapsedMs += now - lastTick;
    lastTick = now;
    timerEl.textContent = formatTime(elapsedMs);
  };
  const timer = setInterval(tick, 500);
  const onVisibility = () => tick();
  document.addEventListener('visibilitychange', onVisibility);
  cleanup.push(() => {
    tick();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

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
    if (!(await idMatches(parsed.puzzle))) {
      message.textContent = 'Import failed: puzzle id does not match its content';
      return;
    }
    if (
      store.get('save', parsed.puzzle.id) &&
      !confirm('Replace your saved progress on this puzzle?')
    ) {
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
    const k = (e.key ?? '').toLowerCase(); // synthetic events can lack a key
    if (k === 'z' && !e.shiftKey) step(history.undo);
    else if (k === 'y' || (k === 'z' && e.shiftKey)) step(history.redo);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  cleanup.push(() => document.removeEventListener('keydown', onKey));
}

export function unmount() {
  for (const fn of cleanup) fn(); // includes the final timer tick
  cleanup = [];
  persistNow();
  persistNow = () => {};
  grid?.destroy();
  root?.remove();
  grid = null;
  root = null;
}
