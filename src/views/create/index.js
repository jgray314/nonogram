// Creator view: image -> grid (step 10), cell editor and blank grid (step 11a),
// live solver report (11b), save to library (11c), tile sets (12c).
import { cellLuminance, otsu } from '../../image.js';
import { puzzleClues } from '../../clues.js';
import { el } from '../dom.js';
import { renderGrid, gutterSize } from '../grid.js';
import { applyStroke } from '../../play-state.js';
import { createHistory } from '../../game.js';
import { puzzleId, validatePuzzle, validateSet } from '../../format.js';
import { tileGrid, tileFlags, makeSet } from '../../tiles.js';
import { createStore } from '../../store.js';
import { createSolverClient } from '../../solver-client.js';
import { isFair } from '../../difficulty.js';
import { colorGrid, inkText } from '../../color.js';
import { buildView } from './build.js';
import { createImageSource } from './image-source.js';
import { createCropPreview } from './crop-preview.js';
import { createGridView } from './grid-view.js';
import { createReport } from './report.js';
import { createSave } from './save.js';
import {
  defaultSize,
  titleFromFile,
  hasFilledCell,
  hasUnsavedWork,
  gridSig,
  artSize,
  tileCropRect,
  pickArt,
  withArts,
  centerCrop,
  loadScale,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
  reportView,
  buildPuzzleRecord,
  canSave,
  DEFAULT_PALETTE,
  fullSize,
  sliceTiles,
  tileStatusLine,
  canSaveSet,
  withVerdicts,
  setWrites,
  rollbackTargets,
  existingPuzzle,
  narrowCellSize,
} from '../../create-logic.js';

const PREVIEW_MAX = 320;
const REPORT_DEBOUNCE_MS = 150;
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

  /** Below 600px wide, size the cells so the grid fits the column. */
  function fitCells(cols, clueCols) {
    if (window.matchMedia('(max-width: 599px)').matches) {
      const size = narrowCellSize(root.clientWidth, cols, clueCols);
      gridHost.style.setProperty('--cell', `${size}px`);
    } else {
      gridHost.style.removeProperty('--cell');
    }
  }

  function renderGridNow() {
    state.gridView?.destroy();
    const d = dims();
    // Clues belong to each tile, not the mosaic, so a tile set shows none here.
    const clues = tiled()
      ? {
          rows: Array.from({ length: d.height }, () => []),
          cols: Array.from({ length: d.width }, () => []),
        }
      : puzzleClues(st.grid);
    fitCells(d.width, gutterSize(clues).left);
    state.gridView = renderGrid(gridHost, {
      width: d.width,
      height: d.height,
      clues,
      cells: st.grid,
      onPointer: onGridPointer,
      palette: st.palette,
      blank: st.blank,
    });
    syncBrushes();
    if (tiled()) markTileBoundaries(d);
    // In color, an image whose colors all merge into one gives an empty grid: say why.
    const merged = state.image !== null && st.colors > 0 && !hasFilledCell(st.grid);
    emptyNote.textContent = merged
      ? "This image's colors are too close together to tell apart, so the grid is empty. Try Two-tone."
      : 'Choose an image above, or draw on the grid below.';
    emptyNote.hidden = !merged && (state.image !== null || hasFilledCell(st.grid));
    syncHistoryButtons();
    scheduleReport();
  }

  /** Thicker separators between tiles (the renderer only draws every 5th line). */
  function markTileBoundaries(d) {
    for (const node of gridHost.querySelectorAll('.nng-cell')) {
      const r = Number(node.dataset.r);
      const c = Number(node.dataset.c);
      if ((c + 1) % st.width === 0 && c + 1 < d.width) node.classList.add('nng-tile-right');
      if ((r + 1) % st.height === 0 && r + 1 < d.height) node.classList.add('nng-tile-bottom');
    }
  }

  // --- live solver report (11b), one per tile (12c) ---
  // reports[i] is row-major; phase is 'pending' (checking or stale), 'fresh'
  // (matches st.grid) or 'error'. A 1x1 grid has exactly one report.
  state.reports = [{ phase: 'pending', result: null }];

  function showReport() {
    const multi = tiled();
    if (!hasFilledCell(st.grid)) {
      // Nothing to check: no verdict, and nothing worth saving.
      badgeLine.hidden = true; // no difficulty until something is filled
      tileList.replaceChildren();
      reportStatus.textContent = 'Fill in some cells to see a report.';
      reportBadge.textContent = 'Unchecked';
      reportBadge.dataset.label = 'Unchecked';
      state.gridView?.setHighlight([]);
      saveBtn.textContent = multi ? 'Save set' : 'Save to library';
      saveBtn.disabled = true;
      saveNote.textContent = '';
      return;
    }
    badgeLine.hidden = multi;
    tileList.replaceChildren();
    const highlight = [];
    state.reports.forEach((rep, i) => {
      if (rep.phase !== 'fresh') return;
      const row = Math.floor(i / st.tileCols);
      const col = i % st.tileCols;
      for (const [r, c] of reportView(rep.result).highlight) {
        highlight.push([r + row * st.height, c + col * st.width]);
      }
    });
    if (!multi) {
      const rep = state.reports[0];
      const view = reportView(rep.phase === 'fresh' ? rep.result : null, st);
      if (rep.phase === 'error') {
        reportStatus.textContent = 'The solver could not run, so this grid is unchecked.';
        reportBadge.textContent = 'Unchecked';
      } else {
        reportStatus.textContent = view.text;
        reportBadge.textContent = view.label;
      }
      reportBadge.dataset.label = reportBadge.textContent;
    } else {
      const flags = sliceTiles(st.grid, st.tileRows, st.tileCols).flat().map(tileFlags);
      const done = state.reports.filter((x) => x.phase === 'fresh').length;
      reportStatus.textContent = state.reports.some((x) => x.phase === 'error')
        ? 'The solver could not run, so these tiles are unchecked.'
        : `${done} of ${state.reports.length} tiles checked.`;
      state.reports.forEach((rep, i) => {
        const row = Math.floor(i / st.tileCols);
        const col = i % st.tileCols;
        const text =
          rep.phase === 'error'
            ? `r${row + 1}c${col + 1}: unchecked${flags[i] ? ` (${flags[i]})` : ''}`
            : tileStatusLine(row, col, rep.phase === 'fresh' ? rep.result : null, flags[i], st);
        tileList.append(el('li', { text }));
      });
    }
    state.gridView?.setHighlight(highlight);

    saveBtn.textContent = multi ? 'Save set' : 'Save to library';
    saveBtn.disabled = !(multi ? canSaveSet(state.reports) : canSave(state.reports[0]));
    const unfair = state.reports.filter((x) => x.phase === 'fresh' && !isFair(x.result)).length;
    if (unfair === 0) {
      saveNote.textContent = '';
    } else if (multi) {
      saveNote.textContent = `${unfair} tile(s) are not fair. You can still save; they will carry a "Not fair" badge.`;
    } else {
      saveNote.textContent =
        'This puzzle is not fair. You can still save it; it will carry a "Not fair" badge.';
    }
  }

  function showSaveMessage(text, links = []) {
    saveMsg.replaceChildren(text);
    links.forEach(([label, href], i) => {
      saveMsg.append(i === 0 ? ' ' : ' · ', el('a', { href, text: label }));
    });
  }

  /**
   * The source crop for tile (row, col) as a small JPEG data URL (D14), or
   * undefined for a blank-grid puzzle or when no attempt fits the size limit.
   */
  function artFor(row, col) {
    if (!state.image) return undefined;
    const rect = tileCropRect(currentCrop(), st.tileRows, st.tileCols, row, col);
    return pickArt((side, quality) => {
      const size = artSize(rect.w, rect.h, side);
      const canvas = el('canvas', { width: size.width, height: size.height });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // JPEG has no alpha: transparent pixels would turn black
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingEnabled = size.width <= rect.w; // upscaled pixel art stays blocky
      ctx.drawImage(
        state.image.canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        size.width,
        size.height,
      );
      return canvas.toDataURL('image/jpeg', quality);
    });
  }

  function onSave() {
    return tiled() ? saveSet() : saveSingle();
  }

  async function saveSingle() {
    const run = state.reportRun;
    if (!canSave(state.reports[0])) return;
    const puzzle = buildPuzzleRecord(
      st.grid,
      titleInput.value,
      state.reports[0].result,
      artFor(0, 0),
      st.palette ?? DEFAULT_PALETTE,
      st.blank ?? undefined,
    );
    puzzle.id = await puzzleId(puzzle);
    // The grid may have changed while the id was computed: never save a verdict
    // that does not match the current grid.
    if (run !== state.reportRun || !canSave(state.reports[0])) return;
    const check = validatePuzzle(puzzle);
    if (!check.ok) {
      showSaveMessage('Could not save: ' + check.error);
      return;
    }
    try {
      const store = createStore();
      // The id is a hash of the grid: the same grid is the same puzzle. Never
      // overwrite it, so a sample keeps its title, verdict and art.
      const have = existingPuzzle(store, puzzle.id);
      if (have !== null) {
        showSaveMessage(`This grid is already in your library as '${have}'.`, [
          ['Open it', '#/play/' + encodeURIComponent(puzzle.id)],
        ]);
        return;
      }
      store.put('puzzle', puzzle);
    } catch {
      showSaveMessage('Could not save: browser storage is full or unavailable.');
      return;
    }
    state.savedSig = gridSig(st);
    showSaveMessage('Saved.', [
      ['Play it', '#/play/' + encodeURIComponent(puzzle.id)],
      ['Library', '#/library'],
    ]);
  }

  /** Save every tile puzzle, then the set record (see setWrites). */
  async function saveSet() {
    const run = state.reportRun;
    if (!canSaveSet(state.reports)) return;
    const title = titleInput.value.trim() || 'Untitled';
    const tiles = sliceTiles(st.grid, st.tileRows, st.tileCols);
    const palette = (st.palette ?? DEFAULT_PALETTE).map((p) => ({ ...p }));
    const made = await makeSet({ title, tiles, palette, blank: st.blank });
    if (run !== state.reportRun || !canSaveSet(state.reports)) return;
    const arts = made.puzzles.map((_, i) => artFor(Math.floor(i / st.tileCols), i % st.tileCols));
    const puzzles = withArts(withVerdicts(made.puzzles, state.reports), arts);
    const bad = puzzles.map(validatePuzzle).find((v) => !v.ok) ?? validateSet(made.set);
    if (!bad.ok) {
      showSaveMessage('Could not save: ' + bad.error);
      return;
    }
    const store = createStore();
    const written = [];
    const writes = setWrites(made.set, puzzles);
    const before = new Set(
      writes
        .filter(({ kind, record }) => store.get(kind, kind === 'set' ? record.setId : record.id))
        .map(({ kind, record }) => `${kind}:${kind === 'set' ? record.setId : record.id}`),
    );
    try {
      for (const { kind, record } of writes) {
        store.put(kind, record);
        written.push({ kind, record });
      }
    } catch {
      // Leave no half-written set behind.
      for (const [kind, id] of rollbackTargets(written, (k, i) => before.has(`${k}:${i}`))) {
        try {
          store.remove(kind, id);
        } catch {
          // best effort
        }
      }
      showSaveMessage('Could not save: browser storage is full or unavailable.');
      return;
    }
    state.savedSig = gridSig(st);
    showSaveMessage('Saved set.', [['Library', '#/library']]);
  }

  function scheduleReport() {
    clearTimeout(state.reportTimer);
    const run = ++state.reportRun;
    const tiles = sliceTiles(st.grid, st.tileRows, st.tileCols).flat();
    state.reports = tiles.map(() => ({ phase: 'pending', result: null }));
    saveMsg.replaceChildren();
    showReport();
    if (!hasFilledCell(st.grid)) return; // nothing to solve yet
    state.reportTimer = setTimeout(async () => {
      // One tile at a time through the worker.
      for (let i = 0; i < tiles.length; i++) {
        const { rows, cols } = puzzleClues(tiles[i]);
        try {
          const result = await solver.solve({
            width: tiles[i][0].length,
            height: tiles[i].length,
            rows,
            cols,
          });
          if (run !== state.reportRun) return; // a newer edit superseded this one
          state.reports[i] = { phase: 'fresh', result };
        } catch {
          if (run !== state.reportRun) return;
          for (let j = i; j < tiles.length; j++)
            state.reports[j] = { phase: 'error', result: null };
          break;
        }
        showReport();
      }
      showReport();
    }, REPORT_DEBOUNCE_MS);
  }

  // Editor: left-drag paints/clears via applyStroke. The grid is only updated
  // in place during a stroke (its DOM must survive the drag); the clues are
  // rebuilt by re-rendering when the stroke ends. The right button is ignored.
  state.stroke = null; // [r, c][] while a left stroke is held
  const strokeOf = (path) => ({ button: 'left', path });

  function onGridPointer({ type, r, c, button }) {
    if (type === 'down') {
      if (button === 'left' && r !== null) state.stroke = [[r, c]];
      return;
    }
    if (!state.stroke || button !== 'left') return;
    if (r !== null) state.stroke.push([r, c]);
    if (type === 'enter') {
      state.gridView.update(applyStroke(st.grid, strokeOf(state.stroke), st.brush));
    } else if (type === 'up') {
      const next = applyStroke(st.grid, strokeOf(state.stroke), st.brush);
      state.stroke = null;
      if (JSON.stringify(next) !== JSON.stringify(st.grid)) {
        state.history.push(next);
        st.manualEdits = true;
      }
      st.grid = next;
      renderGridNow();
    }
  }

  /** One numbered chip per ink while the grid has several colors; a left-drag paints the picked one. */
  function syncBrushes() {
    const inks = st.palette && st.palette.length > 1 ? st.palette : [];
    if (st.brush > Math.max(1, inks.length)) st.brush = 1;
    brushBar.replaceChildren(
      ...inks.map((p, i) => {
        const b = el('button', { type: 'button', className: 'nng-swatch', text: String(i + 1) });
        b.style.setProperty('--ink', p.hex);
        b.style.setProperty('--ink-text', inkText(p.hex));
        b.setAttribute('aria-label', `Paint color ${i + 1}`);
        b.setAttribute('aria-pressed', String(st.brush === i + 1));
        b.addEventListener('click', () => {
          st.brush = i + 1;
          syncBrushes();
        });
        return b;
      }),
    );
  }

  function syncHistoryButtons() {
    undoBtn.disabled = !state.history.canUndo();
    redoBtn.disabled = !state.history.canRedo();
  }

  /** A fresh history for the grid as it now stands (after a regenerate or a blank). */
  function resetHistory() {
    state.history = createHistory(st.grid);
    state.baseline = JSON.stringify(st.grid);
    syncHistoryButtons();
  }

  function stepHistory(back) {
    if (state.stroke) return; // never swap the grid under a held stroke
    if (back ? !state.history.canUndo() : !state.history.canRedo()) return;
    st.grid = back ? state.history.undo() : state.history.redo();
    // Back at the generated grid, there is nothing left to discard.
    st.manualEdits = JSON.stringify(st.grid) !== state.baseline;
    renderGridNow();
  }

  function onKeydown(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target;
    if (t?.matches?.('textarea, input:not([type=checkbox]):not([type=range]):not([type=file])')) {
      return; // leave text editing to the browser
    }
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) stepHistory(true);
    else if (key === 'y' || (key === 'z' && e.shiftKey)) stepHistory(false);
    else return;
    e.preventDefault();
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
      resetHistory();
      syncControls();
      drawPreview();
      renderGridNow();
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
    resetHistory();
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
    resetHistory();
    fileInput.value = '';
    syncControls();
    drawPreview();
    renderGridNow();
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
    resetHistory();
    syncControls();
    drawPreview();
    renderGridNow();
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
  saveBtn.addEventListener('click', onSave);
  undoBtn.addEventListener('click', () => stepHistory(true));
  redoBtn.addEventListener('click', () => stepHistory(false));
  document.addEventListener('keydown', onKeydown);
  const onResize = () => {
    if (!state.stroke) renderGridNow();
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
  // @ts-expect-error the five module slots are filled just below
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
  };
  ctx.imageSource = createImageSource(ctx);
  ctx.cropPreview = createCropPreview(ctx);
  ctx.gridView = createGridView(ctx);
  ctx.report = createReport(ctx);
  ctx.save = createSave(ctx);

  liveUnsaved = () => hasUnsavedWork(st, state.savedSig);
  syncControls();
  drawPreview();
  renderGridNow();

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
