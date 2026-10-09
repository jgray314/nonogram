// Creator view: image -> grid (step 10), cell editor and blank grid (step 11a),
// live solver report (11b), save to library (11c), tile sets (12c).
import { cellLuminance, otsu } from '../image.js';
import { puzzleClues } from '../clues.js';
import { renderGrid, gutterSize } from './grid.js';
import { applyStroke } from '../play-state.js';
import { createHistory } from '../game.js';
import { puzzleId, validatePuzzle, validateSet } from '../format.js';
import { tileGrid, tileFlags, makeSet } from '../tiles.js';
import { createStore } from '../store.js';
import { isFair } from '../difficulty.js';
import {
  SIZES,
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
  TILE_COUNTS,
  fullSize,
  sliceTiles,
  tileStatusLine,
  canSaveSet,
  withVerdicts,
  setWrites,
  rollbackTargets,
  existingPuzzle,
  narrowCellSize,
} from '../create-logic.js';

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

function sizeSelect(value, values = SIZES) {
  const sel = el('select');
  for (const s of values) sel.append(el('option', { value: String(s), text: String(s) }));
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

  // Come back to the draft left by the last visit, if there is one (UX2a).
  const restored = draft;
  draft = null;
  const st = restored?.st ?? newEditorState({ width: 15, height: 15 });
  let image = restored?.image ?? null; // { canvas, w, h, rgba } once decoded
  let gridView = null;
  let previewScale = 1;
  const solver = createSolverClient();
  let reportTimer = null;
  let reportRun = 0; // id of the newest report request; older results are dropped
  let titleTouched = restored?.titleTouched ?? false; // true once the title was typed by hand
  let history = restored?.history ?? createHistory(st.grid); // hand edits since the last regenerate
  let baseline = restored?.baseline ?? JSON.stringify(st.grid); // the grid as generated, before hand edits
  let savedSig = restored?.savedSig ?? null; // gridSig of the last successful save

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
  const tileRowsSel = sizeSelect(st.tileRows, TILE_COUNTS);
  const tileColsSel = sizeSelect(st.tileCols, TILE_COUNTS);
  tileRowsSel.setAttribute('aria-label', 'Tile rows');
  tileColsSel.setAttribute('aria-label', 'Tile columns');
  const blankBtn = el('button', { type: 'button', text: 'Blank grid' });
  const startOverBtn = el('button', { type: 'button', text: 'Start over' });

  const controls = el(
    'div',
    { className: 'nng-create-controls' },
    el('label', {}, 'Image ', fileInput),
    el('label', {}, 'Width ', widthSel),
    el('label', {}, 'Height ', heightSel),
    el('label', {}, 'Tiles ', tileRowsSel, ' \u00d7 ', tileColsSel),
    el('span', { className: 'nng-create-tiles-hint', text: '(width and height are per tile)' }),
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
    text: 'Drop an image above, or start from a blank grid.',
  });
  const undoBtn = el('button', { type: 'button', text: 'Undo', disabled: true });
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.setAttribute('aria-keyshortcuts', 'Control+Z');
  const redoBtn = el('button', { type: 'button', text: 'Redo', disabled: true });
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.setAttribute('aria-keyshortcuts', 'Control+Y');
  const editBar = el('div', { className: 'nng-create-edit-bar' }, undoBtn, redoBtn);
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
    tileRowsSel.value = String(st.tileRows);
    tileColsSel.value = String(st.tileCols);
    slider.value = String(st.threshold);
    sliderValue.textContent = String(st.threshold);
    invertBox.checked = st.invert;
    const imgControls = image !== null;
    slider.disabled = !imgControls;
    resetBtn.disabled = !imgControls;
    invertBox.disabled = !imgControls;
  }

  const dims = () => fullSize(st.width, st.height, st.tileRows, st.tileCols);
  const tiled = () => st.tileRows * st.tileCols > 1;

  function currentCrop() {
    const d = dims();
    return centerCrop(image.w, image.h, d.width, d.height, st.offset);
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

  /** Below 600px wide, size the cells so the grid fits the column (UX24). */
  function fitCells(cols, clueCols) {
    if (window.matchMedia('(max-width: 599px)').matches) {
      const size = narrowCellSize(root.clientWidth, cols, clueCols);
      gridHost.style.setProperty('--cell', `${size}px`);
    } else {
      gridHost.style.removeProperty('--cell');
    }
  }

  function renderGridNow() {
    gridView?.destroy();
    const d = dims();
    // Clues belong to each tile, not the mosaic, so a tile set shows none here.
    const clues = tiled()
      ? {
          rows: Array.from({ length: d.height }, () => []),
          cols: Array.from({ length: d.width }, () => []),
        }
      : puzzleClues(st.grid);
    fitCells(d.width, gutterSize(clues).left);
    gridView = renderGrid(gridHost, {
      width: d.width,
      height: d.height,
      clues,
      cells: st.grid,
      onPointer: onGridPointer,
    });
    if (tiled()) markTileBoundaries(d);
    emptyNote.hidden = image !== null || hasFilledCell(st.grid);
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
  let reports = [{ phase: 'pending', result: null }];

  function showReport() {
    const multi = tiled();
    if (!hasFilledCell(st.grid)) {
      // Nothing to check: no verdict, and nothing worth saving.
      badgeLine.hidden = multi;
      tileList.replaceChildren();
      reportStatus.textContent = 'Fill in some cells to see a report.';
      reportBadge.textContent = 'Unchecked';
      reportBadge.dataset.label = 'Unchecked';
      gridView?.setHighlight([]);
      saveBtn.textContent = multi ? 'Save set' : 'Save to library';
      saveBtn.disabled = true;
      saveNote.textContent = '';
      return;
    }
    badgeLine.hidden = multi;
    tileList.replaceChildren();
    const highlight = [];
    reports.forEach((rep, i) => {
      if (rep.phase !== 'fresh') return;
      const row = Math.floor(i / st.tileCols);
      const col = i % st.tileCols;
      for (const [r, c] of reportView(rep.result).highlight) {
        highlight.push([r + row * st.height, c + col * st.width]);
      }
    });
    if (!multi) {
      const rep = reports[0];
      const view = reportView(rep.phase === 'fresh' ? rep.result : null);
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
      const done = reports.filter((x) => x.phase === 'fresh').length;
      reportStatus.textContent = reports.some((x) => x.phase === 'error')
        ? 'The solver could not run, so these tiles are unchecked.'
        : `${done} of ${reports.length} tiles checked.`;
      reports.forEach((rep, i) => {
        const row = Math.floor(i / st.tileCols);
        const col = i % st.tileCols;
        const text =
          rep.phase === 'error'
            ? `r${row + 1}c${col + 1}: unchecked${flags[i] ? ` (${flags[i]})` : ''}`
            : tileStatusLine(row, col, rep.phase === 'fresh' ? rep.result : null, flags[i]);
        tileList.append(el('li', { text }));
      });
    }
    gridView?.setHighlight(highlight);

    saveBtn.textContent = multi ? 'Save set' : 'Save to library';
    saveBtn.disabled = !(multi ? canSaveSet(reports) : canSave(reports[0]));
    const unfair = reports.filter((x) => x.phase === 'fresh' && !isFair(x.result)).length;
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
    if (!image) return undefined;
    const rect = tileCropRect(currentCrop(), st.tileRows, st.tileCols, row, col);
    return pickArt((side, quality) => {
      const size = artSize(rect.w, rect.h, side);
      const canvas = el('canvas', { width: size.width, height: size.height });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // JPEG has no alpha: transparent pixels would turn black
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingEnabled = size.width <= rect.w; // upscaled pixel art stays blocky
      ctx.drawImage(image.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, size.width, size.height);
      return canvas.toDataURL('image/jpeg', quality);
    });
  }

  function onSave() {
    return tiled() ? saveSet() : saveSingle();
  }

  async function saveSingle() {
    const run = reportRun;
    if (!canSave(reports[0])) return;
    const puzzle = buildPuzzleRecord(st.grid, titleInput.value, reports[0].result, artFor(0, 0));
    puzzle.id = await puzzleId(puzzle);
    // The grid may have changed while the id was computed: never save a verdict
    // that does not match the current grid.
    if (run !== reportRun || !canSave(reports[0])) return;
    const check = validatePuzzle(puzzle);
    if (!check.ok) {
      showSaveMessage('Could not save: ' + check.error);
      return;
    }
    try {
      const store = createStore();
      // The id is a hash of the grid: the same grid is the same puzzle. Never
      // overwrite it, so a sample keeps its title, verdict and art (UX18).
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
    savedSig = gridSig(st);
    showSaveMessage('Saved.', [
      ['Play it', '#/play/' + encodeURIComponent(puzzle.id)],
      ['Library', '#/library'],
    ]);
  }

  /** Save every tile puzzle, then the set record (see setWrites). */
  async function saveSet() {
    const run = reportRun;
    if (!canSaveSet(reports)) return;
    const title = titleInput.value.trim() || 'Untitled';
    const tiles = sliceTiles(st.grid, st.tileRows, st.tileCols);
    const made = await makeSet({ title, tiles, palette: DEFAULT_PALETTE.map((p) => ({ ...p })) });
    if (run !== reportRun || !canSaveSet(reports)) return;
    const arts = made.puzzles.map((_, i) => artFor(Math.floor(i / st.tileCols), i % st.tileCols));
    const puzzles = withArts(withVerdicts(made.puzzles, reports), arts);
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
    savedSig = gridSig(st);
    showSaveMessage('Saved set.', [['Library', '#/library']]);
  }

  function scheduleReport() {
    clearTimeout(reportTimer);
    const run = ++reportRun;
    const tiles = sliceTiles(st.grid, st.tileRows, st.tileCols).flat();
    reports = tiles.map(() => ({ phase: 'pending', result: null }));
    saveMsg.replaceChildren();
    showReport();
    if (!hasFilledCell(st.grid)) return; // nothing to solve yet
    reportTimer = setTimeout(async () => {
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
          if (run !== reportRun) return; // a newer edit superseded this one
          reports[i] = { phase: 'fresh', result };
        } catch {
          if (run !== reportRun) return;
          for (let j = i; j < tiles.length; j++) reports[j] = { phase: 'error', result: null };
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
      if (JSON.stringify(next) !== JSON.stringify(st.grid)) {
        history.push(next);
        st.manualEdits = true;
      }
      st.grid = next;
      renderGridNow();
    }
  }

  function syncHistoryButtons() {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  /** A fresh history for the grid as it now stands (after a regenerate or a blank). */
  function resetHistory() {
    history = createHistory(st.grid);
    baseline = JSON.stringify(st.grid);
    syncHistoryButtons();
  }

  function stepHistory(back) {
    if (stroke) return; // never swap the grid under a held stroke
    if (back ? !history.canUndo() : !history.canRedo()) return;
    st.grid = back ? history.undo() : history.redo();
    // Back at the generated grid, there is nothing left to discard.
    st.manualEdits = JSON.stringify(st.grid) !== baseline;
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
    if (!image) return;
    const d = dims();
    const crop = currentCrop();
    if (st.autoThreshold) {
      const lum = cellLuminance(image.rgba, image.w, image.h, crop, d.width, d.height);
      st.threshold = otsu(lum.flat());
    }
    // One global threshold over the whole crop, so tiles show no seams.
    const { full } = tileGrid(
      image.rgba,
      image.w,
      image.h,
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
    image = decoded;
    if (!titleTouched) titleInput.value = titleFromFile(file.name);
    st.hasImage = true;
    st.offset = { dx: 0, dy: 0 };
    st.autoThreshold = true;
    const size = defaultSize(image.w / st.tileCols, image.h / st.tileRows);
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
    const d = dims();
    st.grid = blankGrid(d.width, d.height);
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
      hasUnsavedWork(st, savedSig) &&
      !confirm('Start over? This discards the image and everything you have drawn.')
    ) {
      return;
    }
    Object.assign(st, newEditorState({ width: 15, height: 15 }));
    image = null;
    titleInput.value = 'Untitled';
    titleTouched = false;
    savedSig = null;
    showError(null);
    fileInput.value = '';
    resetHistory();
    syncControls();
    drawPreview();
    renderGridNow();
  }

  // Crop drag: pointer movement shifts the crop in image pixels.
  let drag = null;
  function onPreviewDown(e) {
    if (!image || e.button !== 0 || !okToDiscard()) return;
    const d = dims();
    const base = centerCrop(image.w, image.h, d.width, d.height);
    drag = { x: e.clientX, y: e.clientY, from: currentCrop(), base };
    previewCanvas.setPointerCapture(e.pointerId);
    previewCanvas.classList.add('dragging');
  }
  function onPreviewMove(e) {
    if (!drag) return;
    const rect = previewCanvas.getBoundingClientRect();
    const k = previewScale * (rect.width / previewCanvas.width);
    const d = dims();
    const crop = centerCrop(image.w, image.h, d.width, d.height, {
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
  tileRowsSel.addEventListener('change', onSize);
  tileColsSel.addEventListener('change', onSize);
  slider.addEventListener('input', onSlider);
  resetBtn.addEventListener('click', onReset);
  invertBox.addEventListener('change', onInvert);
  blankBtn.addEventListener('click', onBlank);
  startOverBtn.addEventListener('click', onStartOver);
  saveBtn.addEventListener('click', onSave);
  undoBtn.addEventListener('click', () => stepHistory(true));
  redoBtn.addEventListener('click', () => stepHistory(false));
  document.addEventListener('keydown', onKeydown);
  const onResize = () => {
    if (!stroke) renderGridNow();
  };
  window.addEventListener('resize', onResize);
  titleInput.addEventListener('input', () => {
    titleTouched = true;
  });
  previewCanvas.addEventListener('pointerdown', onPreviewDown);
  previewCanvas.addEventListener('pointermove', onPreviewMove);
  previewCanvas.addEventListener('pointerup', onPreviewUp);
  previewCanvas.addEventListener('pointercancel', onPreviewUp);

  liveUnsaved = () => hasUnsavedWork(st, savedSig);
  syncControls();
  drawPreview();
  renderGridNow();

  teardown = () => {
    // Keep unsaved work for the next visit; a saved or empty editor leaves nothing.
    draft = hasUnsavedWork(st, savedSig)
      ? { st, image, history, baseline, titleTouched, title: titleInput.value, savedSig }
      : null;
    liveUnsaved = null;
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
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
