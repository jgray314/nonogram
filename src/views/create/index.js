// Creator view: image -> grid (step 10), cell editor and blank grid (step 11a),
// live solver report (11b), save to library (11c), tile sets (12c).
import { cellLuminance, otsu } from '../../image.js';
import { el } from '../dom.js';
import { createHistory } from '../../game.js';
import { tileGrid } from '../../tiles.js';
import { createSolverClient } from '../../solver-client.js';
import { colorGrid } from '../../color.js';
import { buildView } from './build.js';
import { createImageSource } from './image-source.js';
import { createCropPreview } from './crop-preview.js';
import { createGridView } from './grid-view.js';
import { createReport } from './report.js';
import { createSave } from './save.js';
import {
  defaultSize,
  titleFromFile,
  hasUnsavedWork,
  centerCrop,
  loadScale,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
  fullSize,
} from '../../create-logic.js';

const PREVIEW_MAX = 320;
const CSS_ID = 'nng-create-css';

let root = null;
let teardown = null;

// The unsaved draft (image, crop, settings, cells, history) outlives the view,
// in memory only: it is restored on the next mount, cleared by a save or by
// "Start over", and lost on a reload, which is why leaving the page warns.
let draft = null;
let liveUnsaved = null; // while mounted: () => whether the editor holds unsaved work

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (liveUnsaved ? liveUnsaved() : draft !== null) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
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

  // Come back to the draft left by the last visit, if there is one (UX2a).
  const restored = draft;
  draft = null;
  const st = restored?.st ?? newEditorState({ width: 15, height: 15 });
  /** @type {import('./context.js').CreateState} */
  const state = {
    st,
    image: null,
    gridView: null,
    previewScale: null,
    reportTimer: null,
    reportRun: null,
    titleTouched: null,
    history: null,
    baseline: null,
    savedSig: null,
    reports: null,
    stroke: null,
    drag: null,
  };
  state.image = restored?.image ?? null; // { canvas, w, h, rgba } once decoded
  state.gridView = null;
  state.previewScale = 1;
  const solver = createSolverClient();
  state.reportTimer = null;
  state.reportRun = 0; // id of the newest report request; older results are dropped
  state.titleTouched = restored?.titleTouched ?? false; // true once the title was typed by hand
  state.history = restored?.history ?? createHistory(st.grid); // hand edits since the last regenerate
  state.baseline = restored?.baseline ?? JSON.stringify(st.grid); // the grid as generated, before hand edits
  state.savedSig = restored?.savedSig ?? null; // gridSig of the last successful save

  // --- DOM ---
  const refs = buildView(st, restored);
  const {
    errorBox,
    fileInput,
    widthSel,
    heightSel,
    slider,
    sliderValue,
    resetBtn,
    invertBox,
    colorsSel,
    tileRowsSel,
    tileColsSel,
    blankBtn,
    startOverBtn,
    previewCanvas,
    previewWrap,
    undoBtn,
    redoBtn,
    titleInput,
    saveBtn,
  } = refs;
  root = refs.root;
  container.append(root);

  // --- rendering ---
  function showError(msg) {
    errorBox.textContent = msg ?? '';
    errorBox.hidden = !msg;
  }

  function syncControls() {
    widthSel.value = String(st.width);
    heightSel.value = String(st.height);
    tileRowsSel.value = String(st.tileRows);
    tileColsSel.value = String(st.tileCols);
    slider.value = String(st.threshold);
    sliderValue.textContent = String(st.threshold);
    invertBox.checked = st.invert;
    colorsSel.value = String(st.colors);
    const imgControls = state.image !== null;
    // The threshold and invert only shape a two-tone grid.
    const twoTone = imgControls && !st.colors;
    slider.disabled = !twoTone;
    resetBtn.disabled = !twoTone;
    invertBox.disabled = !twoTone;
    colorsSel.disabled = !imgControls;
    blankBtn.hidden = !imgControls; // clearing to blank only means something once an image is loaded
  }

  const dims = () => fullSize(st.width, st.height, st.tileRows, st.tileCols);
  const tiled = () => st.tileRows * st.tileCols > 1;

  function currentCrop() {
    const d = dims();
    return centerCrop(state.image.w, state.image.h, d.width, d.height, st.offset);
  }

  function drawPreview() {
    previewWrap.hidden = state.image === null;
    if (!state.image) return;
    state.previewScale = PREVIEW_MAX / Math.max(state.image.w, state.image.h);
    const cw = Math.max(1, Math.round(state.image.w * state.previewScale));
    const ch = Math.max(1, Math.round(state.image.h * state.previewScale));
    previewCanvas.width = cw;
    previewCanvas.height = ch;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(state.image.canvas, 0, 0, cw, ch);
    const c = currentCrop();
    const x = c.x * state.previewScale;
    const y = c.y * state.previewScale;
    const w = c.w * state.previewScale;
    const h = c.h * state.previewScale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, cw, y);
    ctx.fillRect(0, y + h, cw, ch - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, cw - x - w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // --- live solver report (11b), one per tile (12c) ---
  // reports[i] is row-major; phase is 'pending' (checking or stale), 'fresh'
  // (matches st.grid) or 'error'. A 1x1 grid has exactly one report.
  state.reports = [{ phase: 'pending', result: null }];

  // Editor: left-drag paints/clears via applyStroke. The grid is only updated
  // in place during a stroke (its DOM must survive the drag); the clues are
  // rebuilt by re-rendering when the stroke ends. The right button is ignored.
  state.stroke = null; // [r, c][] while a left stroke is held

  /** Ask before a regeneration throws away hand edits. */
  function okToDiscard() {
    return (
      !regenerateNeedsConfirm(st.manualEdits) ||
      confirm('This will discard your manual edits to the grid. Continue?')
    );
  }

  /** Rebuild the grid from the image with the current settings. */
  function regenerate() {
    if (!state.image) return;
    const d = dims();
    const crop = currentCrop();
    if (st.colors) {
      // One palette over the whole crop, so the tiles of a set share it.
      const q = colorGrid(state.image.rgba, state.image.w, crop, d.width, d.height, st.colors);
      st.grid = q.grid;
      st.palette = q.palette;
      st.blank = q.blank; // D29: Create and Play draw blank cells in it
      st.manualEdits = false;
      ctx.gridView.resetHistory();
      syncControls();
      drawPreview();
      ctx.gridView.renderGridNow();
      return;
    }
    st.palette = null;
    st.blank = null;
    if (st.autoThreshold) {
      const lum = cellLuminance(
        state.image.rgba,
        state.image.w,
        state.image.h,
        crop,
        d.width,
        d.height,
      );
      st.threshold = otsu(lum.flat());
    }
    // One global threshold over the whole crop, so tiles show no seams.
    const { full } = tileGrid(
      state.image.rgba,
      state.image.w,
      state.image.h,
      crop,
      st.width,
      st.height,
      st.tileRows,
      st.tileCols,
      { threshold: st.threshold, invert: st.invert },
    );
    st.grid = full;
    st.manualEdits = false;
    ctx.gridView.resetHistory();
    syncControls();
    drawPreview();
    ctx.gridView.renderGridNow();
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
    state.image = decoded;
    if (!state.titleTouched) titleInput.value = titleFromFile(file.name);
    st.hasImage = true;
    st.offset = { dx: 0, dy: 0 };
    st.autoThreshold = true;
    const size = defaultSize(state.image.w / st.tileCols, state.image.h / st.tileRows);
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
    st.tileRows = Number(tileRowsSel.value);
    st.tileCols = Number(tileColsSel.value);
    if (state.image) {
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

  function onColors() {
    if (!okToDiscard()) {
      syncControls();
      return;
    }
    st.colors = Number(colorsSel.value);
    st.brush = 1;
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
    state.image = null;
    st.hasImage = false;
    st.offset = { dx: 0, dy: 0 };
    const d = dims();
    st.grid = blankGrid(d.width, d.height);
    st.palette = null; // a hand-drawn grid is two-tone
    st.blank = null;
    st.brush = 1;
    st.manualEdits = false;
    ctx.gridView.resetHistory();
    fileInput.value = '';
    syncControls();
    drawPreview();
    ctx.gridView.renderGridNow();
  }

  function onBlank() {
    if (!okToDiscard()) return;
    newBlank();
  }

  /** Throw the draft away and return to the editor as first opened. */
  function onStartOver() {
    if (
      hasUnsavedWork(st, state.savedSig) &&
      !confirm('Start over? This discards the image and everything you have drawn.')
    ) {
      return;
    }
    Object.assign(st, newEditorState({ width: 15, height: 15 }));
    state.image = null;
    titleInput.value = 'Untitled';
    state.titleTouched = false;
    state.savedSig = null;
    showError(null);
    fileInput.value = '';
    ctx.gridView.resetHistory();
    syncControls();
    drawPreview();
    ctx.gridView.renderGridNow();
  }

  // Crop drag: pointer movement shifts the crop in image pixels.
  state.drag = null;
  function onPreviewDown(e) {
    if (!state.image || e.button !== 0 || !okToDiscard()) return;
    const d = dims();
    const base = centerCrop(state.image.w, state.image.h, d.width, d.height);
    state.drag = { x: e.clientX, y: e.clientY, from: currentCrop(), base };
    previewCanvas.setPointerCapture(e.pointerId);
    previewCanvas.classList.add('dragging');
  }
  function onPreviewMove(e) {
    if (!state.drag) return;
    const rect = previewCanvas.getBoundingClientRect();
    const k = state.previewScale * (rect.width / previewCanvas.width);
    const d = dims();
    const crop = centerCrop(state.image.w, state.image.h, d.width, d.height, {
      dx: state.drag.from.x - state.drag.base.x + (e.clientX - state.drag.x) / k,
      dy: state.drag.from.y - state.drag.base.y + (e.clientY - state.drag.y) / k,
    });
    st.offset = { dx: crop.x - state.drag.base.x, dy: crop.y - state.drag.base.y };
    regenerate();
  }
  function onPreviewUp() {
    state.drag = null;
    previewCanvas.classList.remove('dragging');
  }

  fileInput.addEventListener('change', onFile);
  widthSel.addEventListener('change', onSize);
  heightSel.addEventListener('change', onSize);
  tileRowsSel.addEventListener('change', onSize);
  tileColsSel.addEventListener('change', onSize);
  slider.addEventListener('input', onSlider);
  resetBtn.addEventListener('click', onReset);
  invertBox.addEventListener('change', onInvert);
  colorsSel.addEventListener('change', onColors);
  blankBtn.addEventListener('click', onBlank);
  startOverBtn.addEventListener('click', onStartOver);
  saveBtn.addEventListener('click', () => ctx.save.onSave());
  undoBtn.addEventListener('click', () => ctx.gridView.stepHistory(true));
  redoBtn.addEventListener('click', () => ctx.gridView.stepHistory(false));
  const onKeydown = (e) => ctx.gridView.onKeydown(e);
  document.addEventListener('keydown', onKeydown);
  const onResize = () => {
    if (!state.stroke) ctx.gridView.renderGridNow();
  };
  window.addEventListener('resize', onResize);
  titleInput.addEventListener('input', () => {
    state.titleTouched = true;
  });
  previewCanvas.addEventListener('pointerdown', onPreviewDown);
  previewCanvas.addEventListener('pointermove', onPreviewMove);
  previewCanvas.addEventListener('pointerup', onPreviewUp);
  previewCanvas.addEventListener('pointercancel', onPreviewUp);

  // The shared context for the Wave 2 modules. Built here because every field
  // is initialized by now (state, refs, solver) and the shell functions are
  // declared above; the modules are constructed in this one block, in order.
  /** @type {import('./context.js').CreateContext} */
  const ctx = {
    st,
    state,
    refs,
    solver,
    root: () => root,
    shell: {
      showError,
      syncControls,
      dims,
      tiled,
      okToDiscard,
      newBlank,
      onBlank,
      onStartOver,
      onResize,
      currentCrop: () => currentCrop(),
    },
    imageSource: null,
    cropPreview: null,
    gridView: null,
    report: null,
    save: null,
  };
  ctx.imageSource = createImageSource(ctx);
  ctx.cropPreview = createCropPreview(ctx);
  ctx.gridView = createGridView(ctx);
  ctx.report = createReport(ctx);
  ctx.save = createSave(ctx);

  liveUnsaved = () => hasUnsavedWork(st, state.savedSig);
  syncControls();
  drawPreview();
  ctx.gridView.renderGridNow();

  teardown = () => {
    // Keep unsaved work for the next visit; a saved or empty editor leaves nothing.
    draft = hasUnsavedWork(st, state.savedSig)
      ? {
          st,
          image: state.image,
          history: state.history,
          baseline: state.baseline,
          titleTouched: state.titleTouched,
          title: titleInput.value,
          savedSig: state.savedSig,
        }
      : null;
    liveUnsaved = null;
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
    clearTimeout(state.reportTimer);
    state.reportRun++;
    solver.terminate();
    state.gridView?.destroy();
    state.gridView = null;
  };
}

export function unmount() {
  teardown?.();
  teardown = null;
  root?.remove();
  root = null;
}
