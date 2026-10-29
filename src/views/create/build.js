// Creator view: DOM construction only. No listeners, no state writes.
import { el } from '../dom.js';
import { COLOR_COUNTS } from '../../color.js';
import { SIZES, TILE_COUNTS } from '../../create-logic.js';

function sizeSelect(value, values = SIZES) {
  const sel = el('select');
  for (const s of values) sel.append(el('option', { value: String(s), text: String(s) }));
  sel.value = String(value);
  return sel;
}

/**
 * Build the creator view's elements. `st` supplies the initial sizes and tile
 * counts, `restored` the draft title. Returns every element `mount` uses
 * afterwards, plus `root`.
 */
export function buildView(st, restored) {
  const errorBox = el('div', { className: 'nng-create-error', hidden: true });
  errorBox.setAttribute('role', 'alert');
  const fileInput = el('input', { type: 'file', accept: 'image/*' });
  const widthSel = sizeSelect(st.width);
  const heightSel = sizeSelect(st.height);
  const slider = el('input', { type: 'range', min: '0', max: '255', step: '1', value: '128' });
  const sliderValue = el('span', { className: 'nng-create-threshold-value', text: '128' });
  const resetBtn = el('button', { type: 'button', text: 'Reset to auto' });
  const invertBox = el('input', { type: 'checkbox' });
  // Color (D25, D26): 3 to 5 colors in total; the most common one is the blank.
  const colorsSel = el('select');
  colorsSel.append(el('option', { value: '0', text: 'Two-tone' }));
  for (const n of COLOR_COUNTS)
    colorsSel.append(el('option', { value: String(n), text: String(n) }));
  const colorsLabel = el('label', {}, 'Colors ', colorsSel);
  const brushBar = el('span', { className: 'nng-create-brushes' });
  brushBar.setAttribute('role', 'group');
  brushBar.setAttribute('aria-label', 'Paint color');
  const tileRowsSel = sizeSelect(st.tileRows, TILE_COUNTS);
  const tileColsSel = sizeSelect(st.tileCols, TILE_COUNTS);
  tileRowsSel.setAttribute('aria-label', 'Tile rows');
  tileColsSel.setAttribute('aria-label', 'Tile columns');
  const blankBtn = el('button', { type: 'button', text: 'Clear to blank' });
  const startOverBtn = el('button', { type: 'button', text: 'Start over' });

  const controls = el(
    'div',
    { className: 'nng-create-controls' },
    el('label', {}, 'Image ', fileInput),
    el('label', {}, 'Width ', widthSel),
    el('label', {}, 'Height ', heightSel),
    el('label', {}, 'Tiles ', tileRowsSel, ' \u00d7 ', tileColsSel),
    el('span', { className: 'nng-create-tiles-hint', text: '(width and height are per tile)' }),
    colorsLabel,
    el('label', {}, 'Threshold ', slider, sliderValue),
    resetBtn,
    el('label', {}, invertBox, 'Invert'),
    blankBtn,
    startOverBtn,
  );

  const previewCanvas = el('canvas', { className: 'nng-create-preview' });
  const previewWrap = el(
    'div',
    { className: 'nng-create-preview-wrap', hidden: true },
    el('h2', { text: 'Crop (drag to move)' }),
    previewCanvas,
  );
  const gridHost = el('div');
  const emptyNote = el('p', {
    className: 'nng-create-empty-note',
    text: 'Choose an image above, or draw on the grid below.',
  });
  const undoBtn = el('button', { type: 'button', text: 'Undo', disabled: true });
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.setAttribute('aria-keyshortcuts', 'Control+Z');
  const redoBtn = el('button', { type: 'button', text: 'Redo', disabled: true });
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.setAttribute('aria-keyshortcuts', 'Control+Y');
  const editBar = el('div', { className: 'nng-create-edit-bar' }, undoBtn, redoBtn, brushBar);
  const gridWrap = el(
    'div',
    { className: 'nng-create-grid-wrap' },
    el('h2', { text: 'Grid' }),
    editBar,
    emptyNote,
    gridHost,
  );

  // 11b/11c hooks: the solver report and the Save button mount into these.
  const reportSlot = el('div', { className: 'nng-create-slot' });
  reportSlot.dataset.slot = 'report';
  const reportStatus = el('p', { className: 'nng-create-report-status' });
  const reportBadge = el('span', { className: 'nng-create-badge' });
  const badgeLine = el('p', {}, 'Difficulty: ', reportBadge);
  const tileList = el('ul', { className: 'nng-create-tile-list' });
  reportSlot.append(el('h2', { text: 'Solver report' }), badgeLine, reportStatus, tileList);
  const saveSlot = el('div', { className: 'nng-create-slot' });
  saveSlot.dataset.slot = 'save';
  const titleInput = el('input', {
    type: 'text',
    value: restored?.title ?? 'Untitled',
    maxLength: 80,
  });
  const saveBtn = el('button', { type: 'button', text: 'Save to library', disabled: true });
  const saveNote = el('p', { className: 'nng-create-save-note' });
  const saveMsg = el('p', { className: 'nng-create-save-msg' });
  saveSlot.append(
    el('h2', { text: 'Save' }),
    el('label', {}, 'Title ', titleInput),
    ' ',
    saveBtn,
    saveNote,
    saveMsg,
  );

  const root = el(
    'section',
    { className: 'nng-create' },
    el('h1', { text: 'Create' }),
    el('p', {
      className: 'nng-create-hint',
      text: 'Simple, high-contrast images (icons, silhouettes) convert best in Two-tone. For photos and colorful art, try 3 to 5 Colors.',
    }),
    errorBox,
    controls,
    el('div', { className: 'nng-create-body' }, previewWrap, gridWrap),
    reportSlot,
    saveSlot,
  );

  return {
    root,
    errorBox,
    fileInput,
    widthSel,
    heightSel,
    slider,
    sliderValue,
    resetBtn,
    invertBox,
    colorsSel,
    brushBar,
    tileRowsSel,
    tileColsSel,
    blankBtn,
    startOverBtn,
    previewCanvas,
    previewWrap,
    gridHost,
    emptyNote,
    undoBtn,
    redoBtn,
    reportStatus,
    reportBadge,
    badgeLine,
    tileList,
    titleInput,
    saveBtn,
    saveNote,
    saveMsg,
  };
}
