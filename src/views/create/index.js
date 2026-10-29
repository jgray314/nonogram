// Creator view: image -> grid (step 10), cell editor and blank grid (step 11a),
// live solver report (11b), save to library (11c), tile sets (12c).
import { el } from '../dom.js';
import { createHistory } from '../../game.js';
import { createSolverClient } from '../../solver-client.js';
import { buildView } from './build.js';
import { createImageSource } from './image-source.js';
import { createCropPreview } from './crop-preview.js';
import { createGridView } from './grid-view.js';
import { createReport } from './report.js';
import { createSave } from './save.js';
import {
  hasUnsavedWork,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
  fullSize,
} from '../../create-logic.js';

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

  // --- handlers ---
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
    ctx.cropPreview.drawPreview();
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
    ctx.cropPreview.drawPreview();
    ctx.gridView.renderGridNow();
  }

  fileInput.addEventListener('change', () => ctx.imageSource.onFile());
  widthSel.addEventListener('change', () => ctx.imageSource.onSize());
  heightSel.addEventListener('change', () => ctx.imageSource.onSize());
  tileRowsSel.addEventListener('change', () => ctx.imageSource.onSize());
  tileColsSel.addEventListener('change', () => ctx.imageSource.onSize());
  slider.addEventListener('input', () => ctx.imageSource.onSlider());
  resetBtn.addEventListener('click', () => ctx.imageSource.onReset());
  invertBox.addEventListener('change', () => ctx.imageSource.onInvert());
  colorsSel.addEventListener('change', () => ctx.imageSource.onColors());
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
  previewCanvas.addEventListener('pointerdown', (e) => ctx.cropPreview.onPreviewDown(e));
  previewCanvas.addEventListener('pointermove', (e) => ctx.cropPreview.onPreviewMove(e));
  previewCanvas.addEventListener('pointerup', () => ctx.cropPreview.onPreviewUp());
  previewCanvas.addEventListener('pointercancel', () => ctx.cropPreview.onPreviewUp());

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
  ctx.cropPreview.drawPreview();
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
