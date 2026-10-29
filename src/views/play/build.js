// Play view: DOM construction. Builds the page and returns every element mount wires up.
import { inkText } from '../../color.js';
import { elc } from '../dom.js';
import { MAX_HEARTS } from '../../game.js';
import { sampleLabel, puzzleMeta } from '../../library-logic.js';

/**
 * Build the play page. No listeners, no timers, no media queries: mount attaches
 * those to the returned refs. The caller appends `root` to the page.
 * @param {{ puzzle: any, inks: string[] | null, multi: boolean, pendingNote?: string }} args
 */
export function buildView({ puzzle, inks, multi, pendingNote }) {
  const root = elc('section', 'nng-play');
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
  if (pendingNote) message.textContent = pendingNote;
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
    swatchBar.append(b);
    return b;
  });
  const colorHint = multi ? `Pick a color (keys 1 to ${inks.length}) · ` : '';
  const MOUSE_LEGEND = `${colorHint}Left-drag to fill · Right-drag to cross · Ctrl+Z to undo`;
  const TOUCH_LEGEND = `${colorHint}Choose Fill or Cross, then tap or drag`;
  const legend = elc('p', 'nng-legend', MOUSE_LEGEND);
  // D21: on a touch screen a Fill / Cross selector stands in for the mouse buttons.
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
    modeBar.append(b);
  }
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

  return {
    root,
    solvedMsg,
    count,
    timerEl,
    heartsEl,
    heartNodes,
    outPanel,
    outRestartBtn,
    outZenBtn,
    sizeNote,
    holder,
    exportBtn,
    importBtn,
    fileInput,
    message,
    toggles,
    hintBtn,
    hintCount,
    restartBtn,
    ruleNote,
    undoBtn,
    redoBtn,
    swatches,
    legend,
    legendText: { mouse: MOUSE_LEGEND, touch: TOUCH_LEGEND },
    modeBar,
    modeBtns,
    strip,
    stripText,
    belowRow,
  };
}
