// Play view: load a puzzle, wire strokes, undo/redo, solve detection.
import { renderGrid, gutterSize, inkColors } from './grid.js';
import { inkText } from '../color.js';
import { puzzleClues } from '../clues.js';
import { elc } from './dom.js';
import { applyStroke, strokeCells } from '../play-state.js';
import {
  MAX_HEARTS,
  autoCross,
  changedCells,
  createHistory,
  crossEmptyLines,
  fillFullPuzzle,
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
import { sampleLabel, puzzleMeta } from '../library-logic.js';
import { createStore } from '../store.js';
import { validatePuzzle, validateSave, idMatches } from '../format.js';
import { serializeSaveFile, parseSaveFile, importWrites } from '../save.js';
import { rateImports } from '../backup.js';
import { createSolverClient, ratePuzzleWith } from '../solver-client.js';

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

/** Crosses are hidden and unknowns shown empty once the puzzle is solved. */
const reveal = (cells) => cells.map((row) => row.map((v) => (v >= 1 ? v : 0)));
const sameGrid = (a, b) => a.every((row, r) => row.every((v, c) => v === b[r][c]));

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

  root = elc('section', 'nng-play');
  // D15: the name plus a badge, as in the library; the stored title keeps its prefix.
  const label = sampleLabel(puzzle.title || 'Untitled');
  const title = elc('h1', undefined, label.name);
  if (label.ai) {
    title.append(' ', elc('span', 'nng-badge nng-badge-ai nng-header-badge', 'AI test sample'));
  }
  // Size and difficulty as in the library row, inline so the header stays one line tall.
  title.append(' ', elc('span', 'nng-header-meta', puzzleMeta(puzzle)));
  const status = elc('div', 'nng-status');
  const solvedMsg = elc('span', 'nng-solved');
  solvedMsg.hidden = true;
  const count = elc('span', 'nng-count');
  const timerEl = elc('span', 'nng-timer');
  const heartsEl = elc('span', 'nng-hearts');
  heartsEl.setAttribute('role', 'img');
  const heartNodes = Array.from({ length: MAX_HEARTS }, () => elc('span', 'nng-heart'));
  heartsEl.append(...heartNodes);
  status.append(timerEl, heartsEl, solvedMsg, count);
  // Shown while out of hearts; Restart is the only way out.
  const outPanel = elc('div', 'nng-out');
  outPanel.hidden = true;
  const outRestartBtn = elc('button', undefined, 'Restart');
  outRestartBtn.type = 'button';
  const outZenBtn = elc('button', undefined, 'Continue in Zen mode');
  outZenBtn.type = 'button';
  outPanel.append(
    elc('strong', undefined, 'Out of hearts'),
    elc('span', 'nng-out-note', 'Restart clears the grid, timer and hearts.'),
    outRestartBtn,
    outZenBtn,
  );
  const sizeNote = elc(
    'p',
    'nng-size-note',
    "This puzzle is big for this screen, so the grid scrolls. It's easiest on a wider window.",
  );
  sizeNote.hidden = true;
  const holder = elc('div', 'nng-grid-holder');
  const toolbar = elc('div', 'nng-toolbar');
  const exportBtn = elc('button', undefined, 'Export save');
  exportBtn.type = 'button';
  const importBtn = elc('button', undefined, 'Import save');
  importBtn.type = 'button';
  const fileInput = elc('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  const message = elc('span', 'nng-msg');
  const pending = pendingNotes.get(puzzle.id);
  if (pending) {
    message.textContent = pending;
    pendingNotes.delete(puzzle.id);
  }
  toolbar.append(exportBtn, importBtn, fileInput, message);
  const rulesBar = elc('div', 'nng-rules');
  const toggles = {};
  for (const [key, label] of [
    ['zen', 'Zen mode'],
    ['autoCross', 'Auto-cross'],
  ]) {
    const wrap = elc('label', 'nng-toggle');
    const box = elc('input');
    box.type = 'checkbox';
    toggles[key] = box;
    wrap.append(box, document.createTextNode(` ${label}`));
    rulesBar.append(wrap);
  }
  const hintBtn = elc('button', undefined, 'Reveal a cell');
  hintBtn.type = 'button';
  const hintCount = elc('span', 'nng-hint-count');
  const restartBtn = elc('button', undefined, 'Restart');
  restartBtn.type = 'button';
  const ruleNote = elc('span', 'nng-note');
  const undoBtn = elc('button', undefined, 'Undo');
  undoBtn.type = 'button';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.setAttribute('aria-keyshortcuts', 'Control+Z');
  const redoBtn = elc('button', undefined, 'Redo');
  redoBtn.type = 'button';
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.setAttribute('aria-keyshortcuts', 'Control+Y');
  // A color puzzle gets a color picker; a fill paints the picked color.
  const inks = inkColors(puzzle.palette);
  const multi = inks !== null && inks.length > 1;
  let brush = 1;
  const swatchBar = elc('div', 'nng-swatches');
  swatchBar.setAttribute('role', 'group');
  swatchBar.setAttribute('aria-label', 'Fill color');
  swatchBar.hidden = !multi;
  const swatches = (multi ? inks : []).map((hex, i) => {
    const b = elc('button', 'nng-swatch', String(i + 1));
    b.type = 'button';
    b.style.setProperty('--ink', hex);
    b.style.setProperty('--ink-text', inkText(hex));
    b.setAttribute('aria-label', `Color ${i + 1}`);
    b.addEventListener('click', () => pickBrush(i + 1));
    swatchBar.append(b);
    return b;
  });
  function pickBrush(v) {
    brush = v;
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === brush)));
  }
  pickBrush(1);
  const colorHint = multi ? `Pick a color (keys 1 to ${inks.length}) · ` : '';
  const MOUSE_LEGEND = `${colorHint}Left-drag to fill · Right-drag to cross · Ctrl+Z to undo`;
  const TOUCH_LEGEND = `${colorHint}Choose Fill or Cross, then tap or drag`;
  const legend = elc('p', 'nng-legend', MOUSE_LEGEND);
  // D21: on a touch screen a Fill / Cross selector stands in for the mouse buttons.
  let touchMode = 'fill';
  const modeBar = elc('div', 'nng-mode');
  modeBar.setAttribute('role', 'group');
  modeBar.setAttribute('aria-label', 'Touch mode');
  const modeBtns = {};
  for (const [mode, label] of [
    ['fill', 'Fill'],
    ['cross', 'Cross'],
  ]) {
    const b = elc('button', 'nng-mode-btn', label);
    b.type = 'button';
    modeBtns[mode] = b;
    b.addEventListener('click', () => {
      touchMode = mode;
      syncMode();
    });
    modeBar.append(b);
  }
  function syncMode() {
    for (const [mode, b] of Object.entries(modeBtns)) {
      b.setAttribute('aria-pressed', String(mode === touchMode));
      b.classList.toggle('nng-mode-on', mode === touchMode);
    }
  }
  syncMode();
  const coarse = window.matchMedia?.('(pointer: coarse)');
  function syncCoarse() {
    const on = !!coarse?.matches;
    modeBar.hidden = !on;
    legend.textContent = on ? TOUCH_LEGEND : MOUSE_LEGEND;
  }
  syncCoarse();
  coarse?.addEventListener?.('change', syncCoarse);
  cleanup.push(() => coarse?.removeEventListener?.('change', syncCoarse));
  rulesBar.append(undoBtn, redoBtn, modeBar, hintBtn, hintCount, restartBtn, ruleNote);
  // Shown once a solve is final (after the art fade, if any): the time and a way back.
  const strip = elc('div', 'nng-solved-strip');
  strip.hidden = true;
  const stripText = elc('span', 'nng-solved-text');
  const stripLink = elc('a', undefined, 'Back to library');
  stripLink.href = '#/library';
  strip.append(stripText, stripLink);
  const ruleDefault = elc(
    'p',
    'nng-rule-default',
    "Zen and Auto-cross also apply to puzzles you haven't started yet.",
  );
  // The legend and the quiet Export / Import save buttons share one row
  // under the grid, so the save buttons don't cost a 25x25 its fit at 1024x768.
  const belowRow = elc('div', 'nng-below');
  belowRow.append(legend, toolbar);
  // The color picker sits in the status row, so it costs the grid no height.
  heartsEl.after(swatchBar);
  root.append(title, status, outPanel, rulesBar, ruleDefault, sizeNote, holder, strip, belowRow);
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
  // A loaded save gets empty lines crossed too (v1 saves had none), and an
  // all-filled puzzle filled (D24), before the history, so they are not an
  // undo step. It does not mark the save dirty. A save that ran out of hearts
  // is not filled: that would turn a lost game into a solve.
  cells = crossEmptyLines(cells, clues);
  const lost = loaded && rules.zen !== true && hearts === 0 && solvedAt === null;
  if (!lost) cells = fillFullPuzzle(cells, clues);
  // The clock starts with the first move, so opening or restarting a puzzle and
  // looking at it leaves it "not started" in the library.
  let started = elapsedMs > 0 || !sameGrid(cells, restartCells(clues, puzzle.width, puzzle.height));
  let history = createHistory(cells);
  // A puzzle can be satisfied before any move: an all-blank or all-filled tile.
  // Count it solved on open.
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
    grid.update(applyStroke(cells, drag, brush));
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
    const img = elc('img', 'nng-art');
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
    // A wrong color leaves the grid as it was, but still counts and is marked.
    const changed = !sameGrid(cells, next);
    if (!changed && !wrong) return;
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
    if (changed) history.push(cells);
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
      startClock(); // the first click on the grid starts the timer
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
        const result = heartsStroke(cells, finished, puzzle.solution, brush);
        commit(result.next, result.wrong);
      } else {
        commit(applyStroke(cells, finished, brush)); // no unique solution to check against
      }
    }
  }

  grid = renderGrid(holder, {
    width: puzzle.width,
    height: puzzle.height,
    clues,
    cells,
    onPointer,
    touchButton: () => (touchMode === 'cross' ? 'right' : 'left'),
    zeroClues: true,
    palette: puzzle.palette,
    blank: puzzle.blank,
  });
  refresh();

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
    solvedAt = isSolved(cells, clues) ? Date.now() : null; // an all-blank or all-filled tile starts solved
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
    const a = elc('a');
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
    // A player who leaves mid-import must not have this handler clear the next
    // view's save hook or navigate them back.
    const gen = generation;
    const live = () => gen === generation;
    const parsed = parseSaveFile(await file.text());
    if (!live()) return;
    if (!parsed.ok) {
      message.textContent = `Import failed: ${parsed.error}`;
      return;
    }
    const idOk = await idMatches(parsed.puzzle);
    if (!live()) return;
    if (!idOk) {
      message.textContent = 'Import failed: puzzle id does not match its content';
      return;
    }
    if (
      store.get('save', parsed.puzzle.id) &&
      !confirm('Replace your saved progress on this puzzle?')
    ) {
      return;
    }
    let writes = importWrites(parsed, store);
    const addsPuzzle = writes[0].kind === 'puzzle';
    // The file's verdict is only a claim: re-solve a puzzle before it is stored.
    if (writes[0].kind === 'puzzle') {
      message.textContent = 'Checking the imported puzzle…';
      // Created inside the try: `new Worker` can throw synchronously.
      let solver;
      try {
        solver = createSolverClient();
        const [rated] = await rateImports([writes[0].record], ratePuzzleWith(solver));
        writes = [{ kind: 'puzzle', record: rated }, ...writes.slice(1)];
      } catch {
        if (live()) message.textContent = 'Import failed: the solver could not check the puzzle';
        return;
      } finally {
        solver?.terminate();
      }
    }
    // The replace was confirmed, so the import is written even if the player has
    // left; only the page updates below need this mount.
    try {
      for (const w of writes) store.put(w.kind, w.record);
    } catch {
      if (live()) message.textContent = 'Import failed: could not write to storage';
      return;
    }
    if (!live()) return;
    // Drop the live state so unmount does not overwrite the imported save.
    persistNow = () => {};
    // Only a puzzle this import added can have lost its picture: an existing one keeps its own.
    if (addsPuzzle && parsed.artDropped) {
      pendingNotes.set(
        parsed.puzzle.id,
        "The imported puzzle's picture was dropped (not a small JPEG).",
      );
    }
    const target = `#/play/${encodeURIComponent(parsed.puzzle.id)}`;
    if (location.hash === target) {
      unmount();
      mount(container, { id: parsed.puzzle.id });
    } else {
      location.hash = target;
    }
  });

  const onKey = (e) => {
    // Digit keys pick a fill color on a color puzzle.
    const digit = Number(e.key);
    if (multi && !e.ctrlKey && !e.metaKey && !e.altKey && digit >= 1 && digit <= inks.length) {
      const t = e.target;
      if (t?.matches?.('input, textarea, select')) return;
      pickBrush(digit);
      e.preventDefault();
      return;
    }
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
