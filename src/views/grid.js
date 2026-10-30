// Shared grid renderer: clue gutters, cells, thick lines every 5, hover
// highlight. It reports pointer events and draws `cells`; it never applies
// strokes itself (the play view wires play-state.js).
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { inkColors } from '../color.js';
import { buildGrid } from './grid-layout.js';

const BUTTONS = { 0: 'left', 2: 'right' };

export { inkColors }; // the view's callers import it from here
export { gutterSize, blankStyle } from './grid-layout.js';

/**
 * renderGrid(container, {width, height, clues, cells, onPointer, zeroClues})
 *   zeroClues: show "0" for an empty line (Play only; Create passes empty
 *     lists on purpose for tile sets, and Print keeps empty lines blank)
 *   clues: {rows: Clue[][], cols: Clue[][]} as from puzzleClues
 *   cells: height x width array in the cell encoding above
 *   onPointer({type: 'down' | 'enter' | 'up', r, c, button}):
 *     r and c are null when the pointer is outside the cells.
 *     button is 'left' | 'right' while a press that began on a cell is held
 *     (down, enter and up), else null. Presses with other buttons are ignored.
 *   touchButton: () => 'left' | 'right', read at the start of each touch or pen
 *     stroke (the mouse always uses its own buttons). Default: 'left'.
 * @param {HTMLElement} container
 * @param {{ width: number, height: number, clues: any, cells: any, onPointer?: (event: any) => void, zeroClues?: boolean, touchButton?: () => 'left' | 'right', palette?: { hex: string }[] | null, blank?: string | null }} options
 *   palette: the puzzle's palette; a color one draws cells and clues in color (inkColors).
 *   blank: a color puzzle's blank color ('#rrggbb', D29): unknown and crossed cells
 *     use it instead of the theme's empty-cell color (blankStyle). Absent: themed.
 *   The grid also holds one corner node (nng-grid-corner) over both gutters.
 * Returns {update(cells), setClueDone({rows, cols}), setOverlay(node | null),
 *   setWrong([r, c][]), setHighlight([r, c][]), sweep([r, c][]), destroy()}.
 *   sweep pops the given (auto-crossed) cells in one after another.
 *   setClueDone dims single numbers from per-number flags (rows[r][k],
 *   cols[c][k], as from clueProgress); setWrong outlines cells (play.css also
 *   draws a crossed wrong cell's cross in red); setOverlay lays one node over the
 *   cell area, above the cells, or removes it.
 */
export function renderGrid(
  container,
  {
    width,
    height,
    clues,
    cells,
    onPointer = () => {},
    zeroClues = false,
    touchButton = () => 'left',
    palette = null,
    blank = null,
  },
) {
  // A color puzzle draws each ink in its own color: filled cells, and each
  // clue number as a chip of its color. A black-only palette keeps the themed look.
  const inks = inkColors(palette);
  const { root, top, left, nodes, rowClues, colClues } = buildGrid(
    { width, height, clues, zeroClues, blank },
    inks,
  );

  let painted = false; // the first update draws the initial state without popping
  function update(next) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const v = next[r][c];
        const node = nodes[r][c];
        if (painted && v >= 1 && !node.classList.contains('nng-filled')) {
          node.classList.add('nng-pop'); // styling hook: a small pop on newly filled cells
          node.addEventListener('animationend', () => node.classList.remove('nng-pop'), {
            once: true,
          });
        }
        node.classList.toggle('nng-filled', v >= 1);
        node.classList.toggle('nng-crossed', v === -1);
        node.classList.toggle('nng-unknown', v === 0);
        if (v >= 1) node.dataset.color = String(v);
        else delete node.dataset.color;
        if (inks) {
          node.style.backgroundColor = v >= 1 ? (inks[v - 1] ?? '') : '';
          node.classList.toggle('nng-ink', v >= 1);
        }
      }
    }
    painted = true;
  }

  function setClueDone({ rows = [], cols = [] }) {
    rowClues.forEach((list, r) =>
      list.forEach((n, k) => n.classList.toggle('nng-clue-done', !!rows[r]?.[k])),
    );
    colClues.forEach((list, c) =>
      list.forEach((n, k) => n.classList.toggle('nng-clue-done', !!cols[c]?.[k])),
    );
  }

  // One node laid over exactly the cell area (above the cells, clues untouched).
  // Pass null to remove it. The caller owns the node's look and pointer events.
  let overlay = null;
  function setOverlay(node) {
    overlay?.remove();
    overlay = node ?? null;
    if (!overlay) return;
    overlay.style.gridRow = `${top + 1} / span ${height}`;
    overlay.style.gridColumn = `${left + 1} / span ${width}`;
    overlay.style.zIndex = '2';
    root.append(overlay);
  }

  function setWrong(list) {
    for (const row of nodes) for (const node of row) node.classList.remove('nng-wrong');
    for (const [r, c] of list) nodes[r]?.[c]?.classList.add('nng-wrong');
  }

  // Creator report: mark cells (amber), separate from the hover and wrong marks.
  function setHighlight(list) {
    for (const row of nodes) for (const node of row) node.classList.remove('nng-hl');
    for (const [r, c] of list) nodes[r]?.[c]?.classList.add('nng-hl');
  }

  // Auto-cross sweep (D19): the given crosses pop in one after another, fast.
  function sweep(list) {
    list.forEach(([r, c], i) => {
      const node = nodes[r]?.[c];
      if (!node) return;
      node.style.setProperty('--sweep-i', String(i));
      node.classList.remove('nng-sweep');
      node.getBoundingClientRect(); // restart the animation if it was mid-run
      node.classList.add('nng-sweep');
      node.addEventListener('animationend', () => node.classList.remove('nng-sweep'), {
        once: true,
      });
    });
  }

  // Hover highlight: the hovered cell's row and column.
  let hot = null;
  function highlight(pos) {
    if (hot) {
      for (let i = 0; i < width; i++) nodes[hot.r][i].classList.remove('nng-hot');
      for (let i = 0; i < height; i++) nodes[i][hot.c].classList.remove('nng-hot');
    }
    hot = pos;
    if (hot) {
      for (let i = 0; i < width; i++) nodes[hot.r][i].classList.add('nng-hot');
      for (let i = 0; i < height; i++) nodes[i][hot.c].classList.add('nng-hot');
    }
  }

  const cellOf = (target) => {
    const node = /** @type {HTMLElement | null} */ (
      target instanceof Element ? target.closest('.nng-cell') : null
    );
    return node && root.contains(node)
      ? { r: Number(node.dataset.r), c: Number(node.dataset.c) }
      : null;
  };

  let button = null; // held button, set only by a press that began on a cell
  const emit = (type, pos) => onPointer({ type, r: pos?.r ?? null, c: pos?.c ?? null, button });

  // Touch and pen have no buttons to tell fill from cross, so the caller's mode
  // decides (D21). The mouse path never looks at pointerType beyond this test.
  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
  const cellAtPoint = (e) => cellOf(document.elementFromPoint(e.clientX, e.clientY));

  const onDown = (e) => {
    const pos = cellOf(e.target);
    if (!pos || button !== null || !(e.button in BUTTONS)) return;
    e.preventDefault();
    if (isTouch(e)) {
      button = touchButton();
      // A touch is captured by the cell it started on; let go so the drag can be
      // followed across cells.
      try {
        if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
      } catch {
        // No capture to release.
      }
    } else {
      button = BUTTONS[e.button];
    }
    emit('down', pos);
  };
  const enterCell = (pos) => {
    if (pos?.r === hot?.r && pos?.c === hot?.c) return;
    highlight(pos);
    emit('enter', pos);
  };
  const onOver = (e) => {
    if (e.pointerType === 'touch') return; // touch is followed by onMove
    enterCell(cellOf(e.target));
  };
  // A touch or pen drag follows the finger by the point under it.
  const onMove = (e) => {
    if (button === null || !isTouch(e)) return;
    enterCell(cellAtPoint(e));
  };
  const onLeave = () => {
    if (!hot) return;
    highlight(null);
    emit('enter', null);
  };
  const onUp = (e) => {
    if (button === null) return;
    const touch = isTouch(e);
    emit('up', touch ? cellAtPoint(e) : cellOf(e.target));
    button = null;
    if (e.pointerType === 'touch') highlight(null); // no hover to keep after a finger lifts
  };
  const onContext = (e) => e.preventDefault();

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('contextmenu', onContext);
  // Listen on window so a release outside the grid still ends the stroke.
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  update(cells);
  container.append(root);

  return {
    update,
    setClueDone,
    setOverlay,
    setWrong,
    setHighlight,
    sweep,
    destroy() {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };
}
