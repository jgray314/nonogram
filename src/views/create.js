// Creator view: image -> grid (step 10), cell editor and blank grid (step 11a),
// live solver report (11b), save to library (11c).
import { cellLuminance, otsu, binarize } from '../image.js';
import { puzzleClues } from '../clues.js';
import { renderGrid } from './grid.js';
import { applyStroke } from '../play-state.js';
import { puzzleId, validatePuzzle } from '../format.js';
import { createStore } from '../store.js';
import { isFair } from '../difficulty.js';
import {
  SIZES,
  defaultSize,
  centerCrop,
  loadScale,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
  reportView,
  buildPuzzleRecord,
  canSave,
} from '../create-logic.js';

const PREVIEW_MAX = 320;
const REPORT_DEBOUNCE_MS = 150;
const CSS_ID = 'nng-create-css';

let root = null;
let teardown = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node[k] = v;
  }
  node.append(...children);
  return node;
}

function sizeSelect(value) {
  const sel = el('select');
  for (const s of SIZES) sel.append(el('option', { value: String(s), text: String(s) }));
  sel.value = String(value);
  return sel;
}

/** Thin promise wrapper over the solver Web Worker. */
function createSolverClient() {
  const worker = new Worker(new URL('../solver.worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let nextId = 0;
  worker.onmessage = (e) => {
    const entry = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    entry?.resolve(e.data.result);
  };
  worker.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error('solver failed'));
    waiting.clear();
  };
  return {
    solve(input) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, input, opts: {} });
      });
    },
    terminate() {
      worker.terminate();
      for (const entry of waiting.values()) entry.reject(new Error('cancelled'));
      waiting.clear();
    },
  };
}

/** Decode a File into a canvas capped at 1024px on the long side. */
function decodeFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        reject(new Error('empty image'));
        return;
      }
      const scale = loadScale(nw, nh);
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const canvas = el('canvas', { width: w, height: h });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve({ canvas, w, h, rgba: ctx.getImageData(0, 0, w, h).data });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

export function mount(container) {
  if (!document.getElementById(CSS_ID)) {
    const link = el('link', { rel: 'stylesheet', href: 'css/create.css' });
    link.id = CSS_ID;
    document.head.append(link);
  }

  const st = newEditorState({ width: 15, height: 15 });
  let image = null; // { canvas, w, h, rgba } once decoded
  let gridView = null;
  let previewScale = 1;
  const solver = createSolverClient();
  let reportTimer = null;
  let reportRun = 0; // id of the newest report request; older results are dropped

  // --- DOM ---
  const errorBox = el('div', { className: 'nng-create-error', hidden: true });
  errorBox.setAttribute('role', 'alert');
  const fileInput = el('input', { type: 'file', accept: 'image/*' });
  const widthSel = sizeSelect(st.width);
  const heightSel = sizeSelect(st.height);
  const slider = el('input', { type: 'range', min: '0', max: '255', step: '1', value: '128' });
  const sliderValue = el('span', { className: 'nng-create-threshold-value', text: '128' });
  const resetBtn = el('button', { type: 'button', text: 'Reset to auto' });
  const invertBox = el('input', { type: 'checkbox' });
  const blankBtn = el('button', { type: 'button', text: 'Blank grid' });

  const controls = el(
    'div',
    { className: 'nng-create-controls' },
    el('label', {}, 'Image ', fileInput),
    el('label', {}, 'Width ', widthSel),
    el('label', {}, 'Height ', heightSel),
    el('label', {}, 'Threshold ', slider, sliderValue),
    resetBtn,
    el('label', {}, invertBox, 'Invert'),
    blankBtn,
  );

  const previewCanvas = el('canvas', { className: 'nng-create-preview' });
  const previewWrap = el(
    'div',
    { className: 'nng-create-preview-wrap', hidden: true },
    el('h2', { text: 'Crop (drag to move)' }),
    previewCanvas,
  );
  const gridHost = el('div');
  const gridWrap = el(
    'div',
    { className: 'nng-create-grid-wrap' },
    el('h2', { text: 'Grid' }),
    gridHost,
  );

  // 11b/11c hooks: the solver report and the Save button mount into these.
  const reportSlot = el('div', { className: 'nng-create-slot' });
  reportSlot.dataset.slot = 'report';
  const reportStatus = el('p', { className: 'nng-create-report-status' });
  const reportBadge = el('span', { className: 'nng-create-badge' });
  reportSlot.append(
    el('h2', { text: 'Solver report' }),
    el('p', {}, 'Difficulty: ', reportBadge),
    reportStatus,
  );
  const saveSlot = el('div', { className: 'nng-create-slot' });
  saveSlot.dataset.slot = 'save';
  const titleInput = el('input', { type: 'text', value: 'Untitled', maxLength: 80 });
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

  root = el(
    'section',
    { className: 'nng-create' },
    el('h1', { text: 'Create' }),
    el('p', {
      className: 'nng-create-hint',
      text: 'Simple, high-contrast images (icons, silhouettes) convert best.',
    }),
    errorBox,
    controls,
    el('div', { className: 'nng-create-body' }, previewWrap, gridWrap),
    reportSlot,
    saveSlot,
  );
  container.append(root);

  // --- rendering ---
  function showError(msg) {
    errorBox.textContent = msg ?? '';
    errorBox.hidden = !msg;
  }

  function syncControls() {
    widthSel.value = String(st.width);
    heightSel.value = String(st.height);
    slider.value = String(st.threshold);
    sliderValue.textContent = String(st.threshold);
    invertBox.checked = st.invert;
    const imgControls = image !== null;
    slider.disabled = !imgControls;
    resetBtn.disabled = !imgControls;
    invertBox.disabled = !imgControls;
  }

  function currentCrop() {
    return centerCrop(image.w, image.h, st.width, st.height, st.offset);
  }

  function drawPreview() {
    previewWrap.hidden = image === null;
    if (!image) return;
    previewScale = PREVIEW_MAX / Math.max(image.w, image.h);
    const cw = Math.max(1, Math.round(image.w * previewScale));
    const ch = Math.max(1, Math.round(image.h * previewScale));
    previewCanvas.width = cw;
    previewCanvas.height = ch;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(image.canvas, 0, 0, cw, ch);
    const c = currentCrop();
    const x = c.x * previewScale;
    const y = c.y * previewScale;
    const w = c.w * previewScale;
    const h = c.h * previewScale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, cw, y);
    ctx.fillRect(0, y + h, cw, ch - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, cw - x - w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function renderGridNow() {
    gridView?.destroy();
    gridView = renderGrid(gridHost, {
      width: st.width,
      height: st.height,
      clues: puzzleClues(st.grid),
      cells: st.grid,
      onPointer: onGridPointer,
    });
    scheduleReport();
  }

  // --- live solver report (step 11b) ---
  // report.phase: 'pending' (checking or stale), 'fresh' (matches st.grid) or 'error'.
  const report = { phase: 'pending', result: null };

  function showReport() {
    const view = reportView(report.phase === 'fresh' ? report.result : null);
    if (report.phase === 'error') {
      reportStatus.textContent = 'The solver could not run, so this grid is unchecked.';
      reportBadge.textContent = 'Unchecked';
    } else {
      reportStatus.textContent = view.text;
      reportBadge.textContent = view.label;
    }
    reportBadge.dataset.label = reportBadge.textContent;
    gridView?.setHighlight(report.phase === 'fresh' ? view.highlight : []);
    saveBtn.disabled = !canSave(report);
    const unfair = report.phase === 'fresh' && !isFair(report.result);
    saveNote.textContent = unfair
      ? 'This puzzle is not fair. You can still save it; it will carry a "Not fair" badge.'
      : '';
  }

  function showSaveMessage(text, id) {
    saveMsg.replaceChildren(text);
    if (id) {
      const play = el('a', { href: '#/play/' + encodeURIComponent(id), text: 'Play it' });
      const lib = el('a', { href: '#/library', text: 'Library' });
      saveMsg.append(' ', play, ' · ', lib);
    }
  }

  async function onSave() {
    const run = reportRun;
    if (!canSave(report)) return;
    const puzzle = buildPuzzleRecord(st.grid, titleInput.value, report.result);
    puzzle.id = await puzzleId(puzzle);
    // The grid may have changed while the id was computed: never save a verdict
    // that does not match the current grid.
    if (run !== reportRun || !canSave(report)) return;
    const check = validatePuzzle(puzzle);
    if (!check.ok) {
      showSaveMessage('Could not save: ' + check.error);
      return;
    }
    try {
      createStore().put('puzzle', puzzle);
    } catch {
      showSaveMessage('Could not save: browser storage is full or unavailable.');
      return;
    }
    showSaveMessage('Saved.', puzzle.id);
  }

  function scheduleReport() {
    clearTimeout(reportTimer);
    const run = ++reportRun;
    report.phase = 'pending';
    report.result = null;
    saveMsg.replaceChildren();
    showReport();
    reportTimer = setTimeout(async () => {
      const { rows, cols } = puzzleClues(st.grid);
      try {
        const result = await solver.solve({ width: st.width, height: st.height, rows, cols });
        if (run !== reportRun) return; // a newer edit superseded this one
        report.phase = 'fresh';
        report.result = result;
      } catch {
        if (run !== reportRun) return;
        report.phase = 'error';
      }
      showReport();
    }, REPORT_DEBOUNCE_MS);
  }

  // Editor: left-drag paints/clears via applyStroke. The grid is only updated
  // in place during a stroke (its DOM must survive the drag); the clues are
  // rebuilt by re-rendering when the stroke ends. The right button is ignored.
  let stroke = null; // [r, c][] while a left stroke is held
  const strokeOf = (path) => ({ button: 'left', path });

  function onGridPointer({ type, r, c, button }) {
    if (type === 'down') {
      if (button === 'left' && r !== null) stroke = [[r, c]];
      return;
    }
    if (!stroke || button !== 'left') return;
    if (r !== null) stroke.push([r, c]);
    if (type === 'enter') {
      gridView.update(applyStroke(st.grid, strokeOf(stroke)));
    } else if (type === 'up') {
      const next = applyStroke(st.grid, strokeOf(stroke));
      stroke = null;
      if (JSON.stringify(next) !== JSON.stringify(st.grid)) st.manualEdits = true;
      st.grid = next;
      renderGridNow();
    }
  }

  /** Ask before a regeneration throws away hand edits. */
  function okToDiscard() {
    return (
      !regenerateNeedsConfirm(st.manualEdits) ||
      confirm('This will discard your manual edits to the grid. Continue?')
    );
  }

  /** Rebuild the grid from the image with the current settings. */
  function regenerate() {
    if (!image) return;
    const lum = cellLuminance(image.rgba, image.w, image.h, currentCrop(), st.width, st.height);
    if (st.autoThreshold) st.threshold = otsu(lum.flat());
    st.grid = binarize(lum, st.threshold, st.invert);
    st.manualEdits = false;
    syncControls();
    drawPreview();
    renderGridNow();
  }

  // --- handlers ---
  async function onFile() {
    const file = fileInput.files[0];
    if (!file) return;
    showError(null);
    let decoded;
    try {
      decoded = await decodeFile(file);
    } catch {
      showError(`Could not read "${file.name}" as an image. Try a PNG, JPEG, GIF or WebP file.`);
      return;
    }
    if (!okToDiscard()) {
      fileInput.value = '';
      return;
    }
    image = decoded;
    st.hasImage = true;
    st.offset = { dx: 0, dy: 0 };
    st.autoThreshold = true;
    const size = defaultSize(image.w, image.h);
    st.width = size.width;
    st.height = size.height;
    regenerate();
  }

  function onSize() {
    if (!okToDiscard()) {
      syncControls();
      return;
    }
    st.width = Number(widthSel.value);
    st.height = Number(heightSel.value);
    if (image) {
      regenerate();
    } else {
      newBlank();
    }
  }

  function onSlider() {
    if (!okToDiscard()) {
      syncControls();
      return;
    }
    st.autoThreshold = false;
    st.threshold = Number(slider.value);
    regenerate();
  }

  function onReset() {
    if (!okToDiscard()) return;
    st.autoThreshold = true;
    regenerate();
  }

  function onInvert() {
    if (!okToDiscard()) {
      syncControls();
      return;
    }
    st.invert = invertBox.checked;
    regenerate();
  }

  /** Start the editor from an all-zero grid at the chosen size, no image. */
  function newBlank() {
    image = null;
    st.hasImage = false;
    st.offset = { dx: 0, dy: 0 };
    st.grid = blankGrid(st.width, st.height);
    st.manualEdits = false;
    fileInput.value = '';
    syncControls();
    drawPreview();
    renderGridNow();
  }

  function onBlank() {
    if (!okToDiscard()) return;
    newBlank();
  }

  // Crop drag: pointer movement shifts the crop in image pixels.
  let drag = null;
  function onPreviewDown(e) {
    if (!image || e.button !== 0 || !okToDiscard()) return;
    const base = centerCrop(image.w, image.h, st.width, st.height);
    drag = { x: e.clientX, y: e.clientY, from: currentCrop(), base };
    previewCanvas.setPointerCapture(e.pointerId);
    previewCanvas.classList.add('dragging');
  }
  function onPreviewMove(e) {
    if (!drag) return;
    const rect = previewCanvas.getBoundingClientRect();
    const k = previewScale * (rect.width / previewCanvas.width);
    const crop = centerCrop(image.w, image.h, st.width, st.height, {
      dx: drag.from.x - drag.base.x + (e.clientX - drag.x) / k,
      dy: drag.from.y - drag.base.y + (e.clientY - drag.y) / k,
    });
    st.offset = { dx: crop.x - drag.base.x, dy: crop.y - drag.base.y };
    regenerate();
  }
  function onPreviewUp() {
    drag = null;
    previewCanvas.classList.remove('dragging');
  }

  fileInput.addEventListener('change', onFile);
  widthSel.addEventListener('change', onSize);
  heightSel.addEventListener('change', onSize);
  slider.addEventListener('input', onSlider);
  resetBtn.addEventListener('click', onReset);
  invertBox.addEventListener('change', onInvert);
  blankBtn.addEventListener('click', onBlank);
  saveBtn.addEventListener('click', onSave);
  previewCanvas.addEventListener('pointerdown', onPreviewDown);
  previewCanvas.addEventListener('pointermove', onPreviewMove);
  previewCanvas.addEventListener('pointerup', onPreviewUp);
  previewCanvas.addEventListener('pointercancel', onPreviewUp);

  syncControls();
  renderGridNow();

  teardown = () => {
    clearTimeout(reportTimer);
    reportRun++;
    solver.terminate();
    gridView?.destroy();
    gridView = null;
  };
}

export function unmount() {
  teardown?.();
  teardown = null;
  root?.remove();
  root = null;
}
