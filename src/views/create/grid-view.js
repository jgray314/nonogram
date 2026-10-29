// The editable grid: rendering, strokes, brushes, undo and redo.
import { puzzleClues } from '../../clues.js';
import { el } from '../dom.js';
import { renderGrid, gutterSize } from '../grid.js';
import { applyStroke } from '../../play-state.js';
import { createHistory } from '../../game.js';
import { inkText } from '../../color.js';
import { hasFilledCell, narrowCellSize } from '../../create-logic.js';

/** @param {import('./context.js').CreateContext} ctx */
export function createGridView(ctx) {
  const { st, state, refs } = ctx;
  const { gridHost, emptyNote, brushBar, undoBtn, redoBtn } = refs;

  /** Below 600px wide, size the cells so the grid fits the column. */
  function fitCells(cols, clueCols) {
    if (window.matchMedia('(max-width: 599px)').matches) {
      const size = narrowCellSize(ctx.root().clientWidth, cols, clueCols);
      gridHost.style.setProperty('--cell', `${size}px`);
    } else {
      gridHost.style.removeProperty('--cell');
    }
  }

  function renderGridNow() {
    state.gridView?.destroy();
    const d = ctx.shell.dims();
    // Clues belong to each tile, not the mosaic, so a tile set shows none here.
    const clues = ctx.shell.tiled()
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
    if (ctx.shell.tiled()) markTileBoundaries(d);
    // In color, an image whose colors all merge into one gives an empty grid: say why.
    const merged = state.image !== null && st.colors > 0 && !hasFilledCell(st.grid);
    emptyNote.textContent = merged
      ? "This image's colors are too close together to tell apart, so the grid is empty. Try Two-tone."
      : 'Choose an image above, or draw on the grid below.';
    emptyNote.hidden = !merged && (state.image !== null || hasFilledCell(st.grid));
    syncHistoryButtons();
    ctx.report.scheduleReport();
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

  return {
    fitCells,
    renderGridNow,
    markTileBoundaries,
    strokeOf,
    onGridPointer,
    syncBrushes,
    syncHistoryButtons,
    resetHistory,
    stepHistory,
    onKeydown,
  };
}
