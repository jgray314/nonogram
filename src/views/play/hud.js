// Play view: HUD module. Re-renders the hearts, toggles, buttons and grid from
// state, and runs the solve reveal.
import { elc } from '../dom.js';
import { reveal } from './util.js';
import { MAX_HEARTS, formatTime, solvedSummary } from '../../game.js';
import { clueProgress, solutionProgress } from '../../clue-progress.js';

/**
 * @param {import('./context.js').PlayContext} ctx
 */
export function createHud(ctx) {
  const { puzzle, state, rules, clues, refs, helpers, heartsOk } = ctx;
  const {
    solvedMsg,
    count,
    timerEl,
    heartsEl,
    heartNodes,
    outPanel,
    holder,
    toggles,
    hintBtn,
    hintCount,
    restartBtn,
    ruleNote,
    undoBtn,
    redoBtn,
    strip,
    stripText,
  } = refs;
  // zen and outOfHearts stay in index.js until the session module takes them;
  // index.js forwards them on ctx.
  const zen = () => /** @type {any} */ (ctx).zen();
  const outOfHearts = () => /** @type {any} */ (ctx).outOfHearts();

  function refresh() {
    const out = outOfHearts();
    ctx.grid().setWrong(state.wrongMark && state.solvedAt === null ? [state.wrongMark] : []);
    for (const key of Object.keys(toggles)) {
      toggles[key].checked = key === 'zen' ? zen() : rules[key];
      toggles[key].disabled = out || (key !== 'autoCross' && !helpers.enabled);
    }
    heartsEl.hidden = zen();
    heartsEl.setAttribute('aria-label', `${state.hearts} of ${MAX_HEARTS} hearts`);
    heartNodes.forEach((node, i) => {
      const full = i < state.hearts;
      node.textContent = full ? '♥' : '♡';
      node.classList.toggle('nng-heart-full', full);
    });
    outPanel.hidden = !out;
    restartBtn.hidden = out; // the panel has its own Restart; show only one
    holder.classList.toggle('nng-locked', out);
    hintBtn.disabled = !helpers.enabled || state.solvedAt !== null || out;
    undoBtn.disabled = !state.history.canUndo() || state.solvedAt !== null || out;
    redoBtn.disabled = !state.history.canRedo() || state.solvedAt !== null || out;
    hintCount.textContent = `Hints used: ${state.hints}`;
    ruleNote.textContent = helpers.note;
    timerEl.textContent = formatTime(state.elapsedMs);
    ctx.grid().update(state.solvedAt === null ? state.cells : reveal(state.cells));
    // With a unique solution every wrong fill is caught on the spot, in both
    // modes, so numbers can follow the solution (D11, D13). Without one there is
    // no answer to compare against, so the logic-only fenced rule applies.
    ctx
      .grid()
      .setClueDone(
        heartsOk
          ? solutionProgress(state.cells, puzzle.solution)
          : clueProgress(state.cells, clues),
      );
    holder.classList.toggle('nng-celebrate', state.solvedAt !== null); // styling hook for the solve glow
    solvedMsg.hidden = state.solvedAt === null;
    solvedMsg.textContent = state.solvedAt === null ? '' : 'Solved';
    count.textContent = '';
    syncReveal();
  }

  // Solve reveal (D14): the original crop fades in over the cells. A puzzle with
  // no art, a reopened solved puzzle and reduced motion skip the fade.
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function showStrip() {
    clearTimeout(state.revealTimer);
    stripText.textContent = solvedSummary(state.elapsedMs, state.hints);
    strip.hidden = false;
  }
  function clearReveal() {
    clearTimeout(state.revealTimer);
    state.revealed = false;
    ctx.grid().setOverlay(null);
    holder.classList.remove('nng-revealed', 'nng-reveal-anim');
    strip.hidden = true;
  }
  function syncReveal() {
    if (state.solvedAt === null) {
      if (state.revealed || !strip.hidden) clearReveal();
      return;
    }
    if (state.revealed) return;
    state.revealed = true;
    const animate = state.animateReveal && !reduceMotion();
    state.animateReveal = false;
    if (!puzzle.art) {
      showStrip();
      return;
    }
    const img = elc('img', 'nng-art');
    img.alt = 'The finished picture';
    img.src = puzzle.art;
    img.addEventListener('error', () => {
      ctx.grid().setOverlay(null);
      holder.classList.remove('nng-revealed', 'nng-reveal-anim');
      showStrip();
    });
    ctx.grid().setOverlay(img);
    if (!animate) {
      img.classList.add('nng-art-in', 'nng-art-instant');
      holder.classList.add('nng-revealed');
      showStrip();
      return;
    }
    holder.classList.add('nng-reveal-anim');
    img.getBoundingClientRect(); // commit the start state so the fade runs
    img.classList.add('nng-art-in');
    holder.classList.add('nng-revealed');
    img.addEventListener('transitionend', showStrip, { once: true });
    state.revealTimer = setTimeout(showStrip, 1600); // in case transitionend never fires
  }

  return { refresh, syncReveal, showStrip, clearReveal };
}
