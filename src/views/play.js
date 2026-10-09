// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid, gutterSize } from './grid.js';
import { puzzleClues } from '../clues.js';
import { applyStroke, strokeCells } from '../play-state.js';
import {
  MAX_HEARTS,
  autoCross,
  changedCells,
  createHistory,
  crossEmptyLines,
  formatTime,
  heartsAvailable,
  heartsStroke,
  helpersAvailability,
  hintCell,
  isSolved,
  restartCells,
  restartPrompt,
  solvedSummary,
} from '../game.js';
import { clueProgress, solutionProgress } from '../clue-progress.js';
import { createStore } from '../store.js';
import { validatePuzzle, validateSave, idMatches } from '../format.js';
import { serializeSaveFile, parseSaveFile, importWrites } from '../save.js';

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
  const heartsEl = el('span', 'nng-hearts');
  heartsEl.setAttribute('role', 'img');
  const heartNodes = Array.from({ length: MAX_HEARTS }, () => el('span', 'nng-heart'));
  heartsEl.append(...heartNodes);
  status.append(timerEl, heartsEl, solvedMsg, count);
  // Shown while out of hearts; Restart is the only way out.
  const outPanel = el('div', 'nng-out');
  outPanel.hidden = true;
  const outRestartBtn = el('button', undefined, 'Restart');
  outRestartBtn.type = 'button';
  const outZenBtn = el('button', undefined, 'Continue in Zen mode');
  outZenBtn.type = 'button';
  outPanel.append(
    el('strong', undefined, 'Out of hearts'),
    el('span', 'nng-out-note', 'Restart clears the grid, timer and hearts.'),
    outRestartBtn,
    outZenBtn,
  );
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
    ['zen', 'Zen mode'],
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
  const hintCount = el('span', 'nng-hint-count');
  const restartBtn = el('button', undefined, 'Restart');
  restartBtn.type = 'button';
  const ruleNote = el('span', 'nng-note');
  const undoBtn = el('button', undefined, 'Undo');
  undoBtn.type = 'button';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.setAttribute('aria-keyshortcuts', 'Control+Z');
  const redoBtn = el('button', undefined, 'Redo');
  redoBtn.type = 'button';
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.setAttribute('aria-keyshortcuts', 'Control+Y');
  const legend = el('p', 'nng-legend', 'Left-drag to fill · Right-drag to cross · Ctrl+Z to undo');
  rulesBar.append(undoBtn, redoBtn, hintBtn, hintCount, restartBtn, ruleNote);
  // Shown once a solve is final (after the art fade, if any): the time and a way back.
  const strip = el('div', 'nng-solved-strip');
  strip.hidden = true;
  const stripText = el('span', 'nng-solved-text');
  const stripLink = el('a', undefined, 'Back to library');
  stripLink.href = '#/library';
  strip.append(stripText, stripLink);
  const ruleDefault = el(
    'p',
    'nng-rule-default',
    "Zen and Auto-cross also apply to puzzles you haven't started yet.",
  );
  root.append(title, status, outPanel, rulesBar, ruleDefault, toolbar, holder, strip, legend);
  container.append(root);

  const clues = puzzleClues(puzzle.solution);
  // v1's `check` rule is gone (D13): every wrong fill is now flagged on the spot.
  const rules = { zen: false, autoCross: true };
  let cells = restartCells(clues, puzzle.width, puzzle.height); // a fresh game starts where Restart does
  let elapsedMs = 0;
  let solvedAt = null;
  let hearts = MAX_HEARTS;
  let hints = 0; // reveals used on this play-through; undo doesn't refund them (D18)
  let wrongMark = null; // [r, c] of the last wrong fill; memory only, cleared on the next move
  let dirty = false;
  const existing = store ? store.get('save', puzzle.id) : null;
  const loaded = existing && validateSave(existing, puzzle).ok ? existing : null;
  // No save yet: the rule switches start from what the player last chose (D16).
  // A hand-edited pref can't break play: Zen needs a literal true, and Auto-cross
  // a literal false to turn off.
  if (!loaded && store) {
    rules.zen = store.getPref(PREF_KEYS.zen, false) === true;
    // Auto-cross is on unless the player turned it off (D19).
    rules.autoCross = store.getPref(PREF_KEYS.autoCross, true) !== false;
  }
  if (loaded) {
    cells = loaded.cells.map((row) => row.slice());
    elapsedMs = loaded.elapsedMs;
    solvedAt = loaded.solvedAt;
    hearts = loaded.hearts ?? MAX_HEARTS;
    hints = loaded.hints ?? 0;
    for (const key of Object.keys(rules)) rules[key] = loaded.rules[key] === true;
  }
  // A loaded save gets empty lines crossed too (v1 saves had none), before the
  // history, so they are not an undo step. It does not mark the save dirty.
  cells = crossEmptyLines(cells, clues);
  // The clock starts with the first move, so opening or restarting a puzzle and
  // looking at it leaves it "not started" in the library (gate pass 3, H1).
  let started = elapsedMs > 0 || !sameGrid(cells, restartCells(clues, puzzle.width, puzzle.height));
  let history = createHistory(cells);
  // A puzzle can be satisfied before any move: an all-blank tile has only empty
  // clues. Filling anything would break it, so count it solved on open.
  if (solvedAt === null && isSolved(cells, clues)) {
    solvedAt = Date.now();
    dirty = true;
  }

  const snapshot = () => ({
    puzzleId: puzzle.id,
    cells,
    elapsedMs,
    rules: { ...rules },
    solvedAt,
    hearts,
    hints,
  });
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
  // Hearts need a unique solution, so a puzzle that isn't fair is forced into Zen mode.
  const heartsOk = heartsAvailable(puzzle.verdict);
  const zen = () => rules.zen || !heartsOk;
  const outOfHearts = () => !zen() && hearts === 0 && solvedAt === null;

  function refresh() {
    const out = outOfHearts();
    grid.setWrong(wrongMark && solvedAt === null ? [wrongMark] : []);
    for (const key of Object.keys(toggles)) {
      toggles[key].checked = key === 'zen' ? zen() : rules[key];
      toggles[key].disabled = out || (key !== 'autoCross' && !helpers.enabled);
    }
    heartsEl.hidden = zen();
    heartsEl.setAttribute('aria-label', `${hearts} of ${MAX_HEARTS} hearts`);
    heartNodes.forEach((node, i) => {
      const full = i < hearts;
      node.textContent = full ? '♥' : '♡';
      node.classList.toggle('nng-heart-full', full);
    });
    outPanel.hidden = !out;
    restartBtn.hidden = out; // the panel has its own Restart; show only one
    holder.classList.toggle('nng-locked', out);
    hintBtn.disabled = !helpers.enabled || solvedAt !== null || out;
    undoBtn.disabled = !history.canUndo() || solvedAt !== null || out;
    redoBtn.disabled = !history.canRedo() || solvedAt !== null || out;
    hintCount.textContent = `Hints used: ${hints}`;
    ruleNote.textContent = helpers.note;
    timerEl.textContent = formatTime(elapsedMs);
    grid.update(solvedAt === null ? cells : reveal(cells));
    // With a unique solution every wrong fill is caught on the spot, in both
    // modes, so numbers can follow the solution (D11, D13). Without one there is
    // no answer to compare against, so the logic-only fenced rule applies.
    grid.setClueDone(
      heartsOk ? solutionProgress(cells, puzzle.solution) : clueProgress(cells, clues),
    );
    holder.classList.toggle('nng-celebrate', solvedAt !== null); // styling hook for the solve glow
    solvedMsg.hidden = solvedAt === null;
    solvedMsg.textContent = solvedAt === null ? '' : 'Solved';
    count.textContent = '';
    syncReveal();
  }

  // Solve reveal (D14): the original crop fades in over the cells. A puzzle with
  // no art, a reopened solved puzzle and reduced motion skip the fade.
  let revealed = false;
  let animateReveal = false; // set by the move that solves the puzzle
  let revealTimer = null;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function showStrip() {
    clearTimeout(revealTimer);
    stripText.textContent = solvedSummary(elapsedMs, hints);
    strip.hidden = false;
  }
  function clearReveal() {
    clearTimeout(revealTimer);
    revealed = false;
    grid.setOverlay(null);
    holder.classList.remove('nng-revealed', 'nng-reveal-anim');
    strip.hidden = true;
  }
  function syncReveal() {
    if (solvedAt === null) {
      if (revealed || !strip.hidden) clearReveal();
      return;
    }
    if (revealed) return;
    revealed = true;
    const animate = animateReveal && !reduceMotion();
    animateReveal = false;
    if (!puzzle.art) {
      showStrip();
      return;
    }
    const img = el('img', 'nng-art');
    img.alt = 'The finished picture';
    img.src = puzzle.art;
    img.addEventListener('error', () => {
      grid.setOverlay(null);
      holder.classList.remove('nng-revealed', 'nng-reveal-anim');
      showStrip();
    });
    grid.setOverlay(img);
    if (!animate) {
      img.classList.add('nng-art-in', 'nng-art-instant');
      holder.classList.add('nng-revealed');
      showStrip();
      return;
    }
    holder.classList.add('nng-reveal-anim');
    img.getBoundingClientRect(); // commit the start state so the fade runs
    img.classList.add('nng-art-in');
    holder.classList.add('nng-revealed');
    img.addEventListener('transitionend', showStrip, { once: true });
    revealTimer = setTimeout(showStrip, 1600); // in case transitionend never fires
  }

  function startClock() {
    if (started) return;
    started = true;
    lastTick = Date.now();
  }

  /** One committed move (a stroke or a hint) is one undo step. */
  function commit(next, wrong = null) {
    if (sameGrid(cells, next)) return;
    startClock(); // a hint can be the first move
    // Auto-cross rides in the same undo step as the move that completed a line,
    // and its crosses sweep in along the line (D19).
    let swept = [];
    if (rules.autoCross) {
      const moved = next;
      next = autoCross(next, clues, cells);
      swept = changedCells(moved, next);
    }
    cells = next;
    history.push(cells);
    wrongMark = wrong;
    // Zen shows the same red cross but costs nothing (D13).
    if (wrong && !zen()) {
      if (hearts === 1) tick(); // bank the time up to the losing move, before the timer locks
      hearts -= 1;
    }
    if (isSolved(cells, clues)) {
      tick(); // bank the time up to the solving move
      solvedAt = Date.now();
      animateReveal = true;
    }
    dirty = true;
    refresh();
    grid.sweep(swept);
    persist();
  }

  function onPointer({ type, r, c, button }) {
    if (solvedAt !== null || outOfHearts()) return;
    if (type === 'down') {
      startClock(); // the first click on the grid starts the timer (owner, gate pass 3)
      drag = { button, path: [[r, c]] };
      preview();
    } else if (drag && type === 'enter' && r !== null) {
      drag.path.push([r, c]);
      preview();
    } else if (drag && type === 'up') {
      if (r !== null) drag.path.push([r, c]);
      const finished = drag;
      drag = null;
      if (heartsOk) {
        // Hearts and Zen alike: a wrong fill becomes a red cross on the spot.
        const result = heartsStroke(cells, finished, puzzle.solution);
        commit(result.next, result.wrong);
      } else {
        commit(applyStroke(cells, finished)); // no unique solution to check against
      }
    }
  }

  grid = renderGrid(holder, {
    width: puzzle.width,
    height: puzzle.height,
    clues,
    cells,
    onPointer,
    zeroClues: true,
  });
  refresh();

  // Cell size (UX15): the largest of 16..32px that fits the grid and its clue
  // gutters in the window below the header, and in the main column's width.
  // Smaller windows scroll inside the holder, where the clues stay put.
  function sizeGrid() {
    const gutter = gutterSize(clues, { zeroClues: true });
    const px = (name, fallback) =>
      parseFloat(getComputedStyle(holder).getPropertyValue(name)) || fallback;
    const clueW = px('--clue-w', 22);
    const clueH = px('--clue-h', 18);
    const chrome = 28; // holder padding (16) and the grid's own padding (12)
    const lost = outPanel.hidden ? 0 : outPanel.offsetHeight + 8; // not part of the steady layout
    // Room under the grid for the legend and the solved strip, so "Back to
    // library" lands on screen after a solve (gate pass 3, M3).
    const below = legend.offsetHeight + 44;
    const avail =
      window.innerHeight -
      (holder.getBoundingClientRect().top + window.scrollY - lost) -
      below -
      16;
    const byHeight = (avail - chrome - gutter.top * clueH) / puzzle.height;
    const byWidth = (holder.clientWidth - chrome - gutter.left * clueW) / puzzle.width;
    const size = Math.max(16, Math.min(32, Math.floor(Math.min(byHeight, byWidth))));
    holder.style.setProperty('--cell', `${size}px`);
    holder.style.maxHeight = `${Math.max(200, Math.floor(avail))}px`;
  }
  sizeGrid();
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
  for (const [key, box] of Object.entries(toggles)) {
    box.addEventListener('change', () => {
      // Zen can be switched on any time, but hearts come back only with a
      // fresh start, so Zen can't be used to dodge a heart and switch back (D12).
      if (key === 'zen' && !box.checked) {
        const fresh = sameGrid(cells, restartCells(clues, puzzle.width, puzzle.height));
        if (!fresh && !confirm('Playing with hearts starts this puzzle over. Restart now?')) {
          box.checked = true;
          return;
        }
        rules.zen = false;
        rememberRule('zen', false);
        restart();
        return;
      }
      rules[key] = box.checked;
      rememberRule(key, box.checked);
      dirty = true;
      refresh();
      persist();
    });
  }
  hintBtn.addEventListener('click', () => {
    if (solvedAt !== null || drag || outOfHearts() || !helpers.enabled) return;
    const hint = hintCell(cells, puzzle.solution);
    if (!hint) {
      // Only an imported save can get here: every fill is in, so a filled square is wrong.
      message.textContent = 'Nothing left to reveal: a filled square is wrong somewhere.';
      return;
    }
    const next = cells.map((row) => row.slice());
    next[hint.r][hint.c] = hint.value;
    // Undo doesn't refund (D18), so reveal, undo, reveal counts twice. The save
    // format caps the count at the cell count as a sanity bound, so it stops there.
    hints = Math.min(hints + 1, puzzle.width * puzzle.height);
    commit(next);
  });

  // Timer: accumulate while mounted, the document is visible, and unsolved.
  let lastTick = Date.now();
  const tick = () => {
    const now = Date.now();
    if (started && !document.hidden && solvedAt === null && !outOfHearts()) {
      elapsedMs += now - lastTick;
    }
    lastTick = now;
    timerEl.textContent = formatTime(elapsedMs);
  };
  const timer = setInterval(tick, 500);
  const onVisibility = () => tick();
  document.addEventListener('visibilitychange', onVisibility);
  cleanup.push(() => {
    tick();
    clearInterval(timer);
    clearTimeout(revealTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  function step(fn) {
    if (solvedAt !== null || drag || outOfHearts()) return;
    wrongMark = null;
    cells = fn();
    dirty = true;
    refresh();
    persist();
  }

  function restart() {
    cells = restartCells(clues, puzzle.width, puzzle.height);
    history = createHistory(cells);
    elapsedMs = 0;
    started = false;
    hearts = MAX_HEARTS;
    hints = 0;
    wrongMark = null;
    drag = null;
    lastTick = Date.now();
    solvedAt = isSolved(cells, clues) ? Date.now() : null; // an all-blank tile starts solved
    dirty = true;
    refresh();
    persist();
  }
  restartBtn.addEventListener('click', () => {
    if (confirm(restartPrompt(zen()))) restart();
  });
  // Out of hearts there is nothing left to lose, so this one skips the confirm.
  outRestartBtn.addEventListener('click', restart);
  // Keep the cells and play on without hearts; the lost hearts stay lost until a restart.
  // A rescue for this game, not a choice of default: unlike the Zen switch, it
  // doesn't write the play.zen pref (D16).
  outZenBtn.addEventListener('click', () => {
    rules.zen = true;
    lastTick = Date.now();
    dirty = true;
    refresh();
    persist();
  });

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
  undoBtn.addEventListener('click', () => step(history.undo));
  redoBtn.addEventListener('click', () => step(history.redo));
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
