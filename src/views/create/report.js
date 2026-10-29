// The live solver report (11b), one per tile (12c).
import { puzzleClues } from '../../clues.js';
import { el } from '../dom.js';
import { tileFlags } from '../../tiles.js';
import { isFair } from '../../difficulty.js';
import {
  hasFilledCell,
  reportView,
  canSave,
  sliceTiles,
  tileStatusLine,
  canSaveSet,
} from '../../create-logic.js';

const REPORT_DEBOUNCE_MS = 150;

/** @param {import('./context.js').CreateContext} ctx */
export function createReport(ctx) {
  const { st, state, refs, solver } = ctx;
  const { reportStatus, reportBadge, badgeLine, tileList, saveBtn, saveNote, saveMsg } = refs;

  function showReport() {
    const multi = ctx.shell.tiled();
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

  return { showReport, scheduleReport };
}
