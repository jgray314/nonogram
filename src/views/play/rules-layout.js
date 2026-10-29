// Play view: rules and layout module. Brush and touch-mode pickers, the coarse
// pointer legend, cell sizing, and the remembered rule switches.
import { gutterSize } from '../grid.js';

/**
 * @param {import('./context.js').PlayContext} ctx
 */
export function createRulesLayout(ctx) {
  const { puzzle, store, state, clues, refs } = ctx;
  const { outPanel, sizeNote, holder, swatches, legend, legendText, modeBar, modeBtns, belowRow } =
    refs;
  const coarse = window.matchMedia?.('(pointer: coarse)');

  function pickBrush(v) {
    state.brush = v;
    swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === state.brush)));
  }

  function syncMode() {
    for (const [mode, b] of Object.entries(modeBtns)) {
      b.setAttribute('aria-pressed', String(mode === state.touchMode));
      b.classList.toggle('nng-mode-on', mode === state.touchMode);
    }
  }

  function syncCoarse() {
    const on = !!coarse?.matches;
    modeBar.hidden = !on;
    legend.textContent = on ? legendText.touch : legendText.mouse;
  }

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

  const settle = () => holder.isConnected && sizeGrid();

  function rememberRule(key, value) {
    if (!store || !(key in ctx.prefKeys)) return;
    try {
      store.setPref(ctx.prefKeys[key], value);
    } catch {
      // Storage unavailable: the switch still works for this puzzle.
    }
  }

  return { coarse, pickBrush, syncMode, syncCoarse, sizeGrid, settle, rememberRule };
}
