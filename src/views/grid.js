// Shared grid renderer: clue gutters, cells, thick lines every 5, hover
// highlight. It reports pointer events and draws `cells`; it never applies
// strokes itself (the play view wires play-state.js).
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { inkColors, inkText } from '../color.js';

/**
 * Gutter depth: the most clues in any column (top) and any row (left). With
 * `zeroClues` (Play only) an empty line shows a "0", so it counts as one.
 */
export function gutterSize(clues, { zeroClues = false } = {}) {
  const depth = (l) => (zeroClues ? l.length || 1 : l.length);
  const max = (lists) => lists.reduce((m, l) => Math.max(m, depth(l)), 0);
  return { top: max(clues.cols), left: max(clues.rows) };
}

const BUTTONS = { 0: 'left', 2: 'right' };

export { inkColors }; // the view's callers import it from here

/**
 * CSS custom properties for a color puzzle's blank (D29), or null when `hex`
 * is not a '#rrggbb' color. --blank fills unknown and crossed cells;
 * --blank-cross is the cross, white on a dark blank and black on a light one
 * (the same test as clue chip numbers). base.css derives the cell lines and
 * the hover color from both.
 * @param {string | null | undefined} hex
 */
export function blankStyle(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return { '--blank': hex, '--blank-cross': inkText(hex) };
}

function div(className, text) {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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
  const { top, left } = gutterSize(clues, { zeroClues });
  // A color puzzle draws each ink in its own color: filled cells, and each
  // clue number as a chip of its color. A black-only palette keeps the themed look.
  const inks = inkColors(palette);
  const root = div('nng-grid');
  const blankVars = blankStyle(blank);
  if (blankVars) {
    root.classList.add('nng-grid-blank');
    for (const [name, value] of Object.entries(blankVars)) root.style.setProperty(name, value);
  }
  root.style.gridTemplateColumns = `repeat(${left}, var(--clue-w)) repeat(${width}, var(--cell))`;
  root.style.gridTemplateRows = `repeat(${top}, var(--clue-h)) repeat(${height}, var(--cell))`;

  const place = (node, row, col) => {
    node.style.gridRow = String(row);
    node.style.gridColumn = String(col);
    root.append(node);
  };

  // Opaque backing for the gutters, so cells scrolled under a sticky gutter (Play)
  // never show through the gaps between clues; and one corner node over both
  // gutters, which play.css pins above them. Plain, empty divs elsewhere.
  if (top > 0 && width > 0) {
    const band = div('nng-gutter nng-gutter-cols');
    band.style.gridArea = `1 / ${left + 1} / span ${top} / span ${width}`;
    root.append(band);
  }
  if (left > 0 && height > 0) {
    const band = div('nng-gutter nng-gutter-rows');
    band.style.gridArea = `${top + 1} / 1 / span ${height} / span ${left}`;
    root.append(band);
  }
  if (top > 0 && left > 0) {
    const corner = div('nng-grid-corner');
    corner.style.gridArea = `1 / 1 / span ${top} / span ${left}`;
    root.append(corner);
  }

  // Column clues are bottom-aligned, row clues right-aligned, against the cells.
  const rowClues = clues.rows.map(() => []);
  const colClues = clues.cols.map(() => []);
  const zero = (row, col, slot, axis) => {
    const node = div(`nng-clue nng-clue-${axis} nng-clue-zero nng-clue-done`, '0');
    node.style.setProperty('--clue-i', String(slot));
    place(node, row, col);
  };
  const paintClue = (node, color) => {
    node.dataset.color = String(color);
    const hex = inks?.[color - 1];
    if (!hex) return;
    node.classList.add('nng-clue-ink');
    node.style.setProperty('--ink', hex);
    node.style.setProperty('--ink-text', inkText(hex));
  };
  clues.cols.forEach((list, c) => {
    if (zeroClues && !list.length) zero(top, left + c + 1, top - 1, 'col'); // not in the progress flags
    list.forEach((clue, k) => {
      const node = div('nng-clue nng-clue-col', String(clue.n));
      colClues[c].push(node);
      paintClue(node, clue.c);
      node.style.setProperty('--clue-i', String(top - list.length + k)); // slot in the gutter, for sticky clues
      place(node, top - list.length + k + 1, left + c + 1);
    });
  });
  clues.rows.forEach((list, r) => {
    if (zeroClues && !list.length) zero(top + r + 1, left, left - 1, 'row');
    list.forEach((clue, k) => {
      const node = div('nng-clue nng-clue-row', String(clue.n));
      rowClues[r].push(node);
      paintClue(node, clue.c);
      node.style.setProperty('--clue-i', String(left - list.length + k));
      place(node, top + r + 1, left - list.length + k + 1);
    });
  });

  const nodes = [];
  for (let r = 0; r < height; r++) {
    const rowNodes = [];
    for (let c = 0; c < width; c++) {
      const node = div('nng-cell');
      node.dataset.r = String(r);
      node.dataset.c = String(c);
      if (c % 5 === 4) node.classList.add('nng-thick-right');
      if (r % 5 === 4) node.classList.add('nng-thick-bottom');
      rowNodes.push(node);
      place(node, top + r + 1, left + c + 1);
    }
    nodes.push(rowNodes);
  }

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
