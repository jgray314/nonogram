// Play view: session module (the clock, moves, pointer input, keys and the rule buttons).
import { inkColors } from '../grid.js';
import { sameGrid } from './util.js';
import { applyStroke, strokeCells } from '../../play-state.js';
import {
  MAX_HEARTS,
  autoCross,
  changedCells,
  createHistory,
  formatTime,
  heartsStroke,
  hintCell,
  isSolved,
  restartCells,
  restartPrompt,
} from '../../game.js';

/**
 * @param {import('./context.js').PlayContext} ctx
 */
export function createSession(ctx) {
  const { puzzle, state, rules, clues, refs, helpers, heartsOk } = ctx;
  const {
    count,
    timerEl,
    outRestartBtn,
    outZenBtn,
    message,
    toggles,
    hintBtn,
    restartBtn,
    undoBtn,
    redoBtn,
  } = refs;
  const inks = inkColors(puzzle.palette);
  const multi = inks !== null && inks.length > 1;

  const preview = () => {
    if (!state.drag) return;
    ctx.grid().update(applyStroke(state.cells, state.drag, state.brush));
    count.textContent = `${strokeCells(state.cells, state.drag).length} cells`;
  };

  const zen = () => rules.zen || !heartsOk;
  const outOfHearts = () => !zen() && state.hearts === 0 && state.solvedAt === null;

  function startClock() {
    if (state.started) return;
    state.started = true;
    state.lastTick = Date.now();
  }

  /** One committed move (a stroke or a hint) is one undo step. */
  function commit(next, wrong = null) {
    // A wrong color leaves the grid as it was, but still counts and is marked.
    const changed = !sameGrid(state.cells, next);
    if (!changed && !wrong) return;
    startClock(); // a hint can be the first move
    // Auto-cross rides in the same undo step as the move that completed a line,
    // and its crosses sweep in along the line (D19).
    let swept = [];
    if (rules.autoCross) {
      const moved = next;
      next = autoCross(next, clues, state.cells);
      swept = changedCells(moved, next);
    }
    state.cells = next;
    if (changed) state.history.push(state.cells);
    state.wrongMark = wrong;
    // Zen shows the same red cross but costs nothing (D13).
    if (wrong && !zen()) {
      if (state.hearts === 1) tick(); // bank the time up to the losing move, before the timer locks
      state.hearts -= 1;
    }
    if (isSolved(state.cells, clues)) {
      tick(); // bank the time up to the solving move
      state.solvedAt = Date.now();
      state.animateReveal = true;
    }
    state.dirty = true;
    ctx.hud.refresh();
    ctx.grid().sweep(swept);
    ctx.persist.persist();
  }

  function onPointer({ type, r, c, button }) {
    if (state.solvedAt !== null || outOfHearts()) return;
    if (type === 'down') {
      startClock(); // the first click on the grid starts the timer
      state.drag = { button, path: [[r, c]] };
      preview();
    } else if (state.drag && type === 'enter' && r !== null) {
      state.drag.path.push([r, c]);
      preview();
    } else if (state.drag && type === 'up') {
      if (r !== null) state.drag.path.push([r, c]);
      const finished = state.drag;
      state.drag = null;
      if (heartsOk) {
        // Hearts and Zen alike: a wrong fill becomes a red cross on the spot.
        const result = heartsStroke(state.cells, finished, puzzle.solution, state.brush);
        commit(result.next, result.wrong);
      } else {
        commit(applyStroke(state.cells, finished, state.brush)); // no unique solution to check against
      }
    }
  }

  const tick = () => {
    const now = Date.now();
    if (state.started && !document.hidden && state.solvedAt === null && !outOfHearts()) {
      state.elapsedMs += now - state.lastTick;
    }
    state.lastTick = now;
    timerEl.textContent = formatTime(state.elapsedMs);
  };
  const onVisibility = () => tick();

  function step(fn) {
    if (state.solvedAt !== null || state.drag || outOfHearts()) return;
    state.wrongMark = null;
    state.cells = fn();
    state.dirty = true;
    ctx.hud.refresh();
    ctx.persist.persist();
  }

  function restart() {
    state.cells = restartCells(clues, puzzle.width, puzzle.height);
    state.history = createHistory(state.cells);
    state.elapsedMs = 0;
    state.started = false;
    state.hearts = MAX_HEARTS;
    state.hints = 0;
    state.wrongMark = null;
    state.drag = null;
    state.lastTick = Date.now();
    state.solvedAt = isSolved(state.cells, clues) ? Date.now() : null; // an all-blank or all-filled tile starts solved
    state.dirty = true;
    ctx.hud.refresh();
    ctx.persist.persist();
  }

  const onKey = (e) => {
    // Digit keys pick a fill color on a color puzzle.
    const digit = Number(e.key);
    if (multi && !e.ctrlKey && !e.metaKey && !e.altKey && digit >= 1 && digit <= inks.length) {
      const t = e.target;
      if (t?.matches?.('input, textarea, select')) return;
      ctx.rulesLayout.pickBrush(digit);
      e.preventDefault();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = (e.key ?? '').toLowerCase(); // synthetic events can lack a key
    if (k === 'z' && !e.shiftKey) step(state.history.undo);
    else if (k === 'y' || (k === 'z' && e.shiftKey)) step(state.history.redo);
    else return;
    e.preventDefault();
  };

  function attachHandlers() {
    for (const [key, box] of Object.entries(toggles)) {
      box.addEventListener('change', () => {
        // Zen can be switched on any time, but hearts come back only with a
        // fresh start, so Zen can't be used to dodge a heart and switch back (D12).
        if (key === 'zen' && !box.checked) {
          const fresh = sameGrid(state.cells, restartCells(clues, puzzle.width, puzzle.height));
          if (!fresh && !confirm('Playing with hearts starts this puzzle over. Restart now?')) {
            box.checked = true;
            return;
          }
          rules.zen = false;
          ctx.rulesLayout.rememberRule('zen', false);
          restart();
          return;
        }
        rules[key] = box.checked;
        ctx.rulesLayout.rememberRule(key, box.checked);
        state.dirty = true;
        ctx.hud.refresh();
        ctx.persist.persist();
      });
    }
    hintBtn.addEventListener('click', () => {
      if (state.solvedAt !== null || state.drag || outOfHearts() || !helpers.enabled) return;
      const hint = hintCell(state.cells, puzzle.solution);
      if (!hint) {
        // Only an imported save can get here: every fill is in, so a filled square is wrong.
        message.textContent = 'Nothing left to reveal: a filled square is wrong somewhere.';
        return;
      }
      const next = state.cells.map((row) => row.slice());
      next[hint.r][hint.c] = hint.value;
      // Undo doesn't refund (D18), so reveal, undo, reveal counts twice. The save
      // format caps the count at the cell count as a sanity bound, so it stops there.
      state.hints = Math.min(state.hints + 1, puzzle.width * puzzle.height);
      commit(next);
    });
    restartBtn.addEventListener('click', () => {
      if (confirm(restartPrompt(zen()))) restart();
    });
    // Out of hearts there is nothing left to lose, so this one skips the confirm.
    outRestartBtn.addEventListener('click', restart);
    // Keep the cells and play on without hearts; the lost hearts stay lost until a restart.
    // A rescue for this game, not a choice of default: unlike the Zen switch, it
    // doesn't write the play.zen pref (D16).
    outZenBtn.addEventListener('click', () => {
      rules.zen = true;
      state.lastTick = Date.now();
      state.dirty = true;
      ctx.hud.refresh();
      ctx.persist.persist();
    });
    undoBtn.addEventListener('click', () => step(state.history.undo));
    redoBtn.addEventListener('click', () => step(state.history.redo));
  }

  return { zen, outOfHearts, tick, onVisibility, onPointer, onKey, attachHandlers };
}
