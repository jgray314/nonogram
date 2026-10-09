// Shared grid renderer: clue gutters, cells, thick lines every 5, hover
// highlight. It reports pointer events and draws `cells`; it never applies
// strokes itself (the play view wires play-state.js).
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.

/** Gutter depth: the most clues in any column (top) and any row (left). */
export function gutterSize(clues) {
  const max = (lists) => lists.reduce((m, l) => Math.max(m, l.length), 0);
  return { top: max(clues.cols), left: max(clues.rows) };
}

const BUTTONS = { 0: 'left', 2: 'right' };

function div(className, text) {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * renderGrid(container, {width, height, clues, cells, onPointer})
 *   clues: {rows: Clue[][], cols: Clue[][]} as from puzzleClues
 *   cells: height x width array in the cell encoding above
 *   onPointer({type: 'down' | 'enter' | 'up', r, c, button}):
 *     r and c are null when the pointer is outside the cells.
 *     button is 'left' | 'right' while a press that began on a cell is held
 *     (down, enter and up), else null. Presses with other buttons are ignored.
 * Returns {update(cells), setClueDone({rows, cols}), setWrong([r, c][]),
 *   setHighlight([r, c][]), destroy()}.
 *   setClueDone dims single numbers from per-number flags (rows[r][k],
 *   cols[c][k], as from clueProgress); setWrong outlines cells.
 */
export function renderGrid(container, { width, height, clues, cells, onPointer = () => {} }) {
  const { top, left } = gutterSize(clues);
  const root = div('nng-grid');
  root.style.gridTemplateColumns = `repeat(${left}, var(--clue-w)) repeat(${width}, var(--cell))`;
  root.style.gridTemplateRows = `repeat(${top}, var(--clue-h)) repeat(${height}, var(--cell))`;

  const place = (node, row, col) => {
    node.style.gridRow = String(row);
    node.style.gridColumn = String(col);
    root.append(node);
  };

  // Column clues are bottom-aligned, row clues right-aligned, against the cells.
  const rowClues = clues.rows.map(() => []);
  const colClues = clues.cols.map(() => []);
  clues.cols.forEach((list, c) => {
    list.forEach((clue, k) => {
      const node = div('nng-clue nng-clue-col', String(clue.n));
      colClues[c].push(node);
      node.dataset.color = String(clue.c);
      place(node, top - list.length + k + 1, left + c + 1);
    });
  });
  clues.rows.forEach((list, r) => {
    list.forEach((clue, k) => {
      const node = div('nng-clue nng-clue-row', String(clue.n));
      rowClues[r].push(node);
      node.dataset.color = String(clue.c);
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

  function setWrong(list) {
    for (const row of nodes) for (const node of row) node.classList.remove('nng-wrong');
    for (const [r, c] of list) nodes[r]?.[c]?.classList.add('nng-wrong');
  }

  // Creator report: mark cells (amber), separate from the hover and wrong marks.
  function setHighlight(list) {
    for (const row of nodes) for (const node of row) node.classList.remove('nng-hl');
    for (const [r, c] of list) nodes[r]?.[c]?.classList.add('nng-hl');
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
    const node = target instanceof Element ? target.closest('.nng-cell') : null;
    return node && root.contains(node)
      ? { r: Number(node.dataset.r), c: Number(node.dataset.c) }
      : null;
  };

  let button = null; // held button, set only by a press that began on a cell
  const emit = (type, pos) => onPointer({ type, r: pos?.r ?? null, c: pos?.c ?? null, button });

  const onDown = (e) => {
    const pos = cellOf(e.target);
    if (!pos || button !== null || !(e.button in BUTTONS)) return;
    e.preventDefault();
    button = BUTTONS[e.button];
    emit('down', pos);
  };
  const onOver = (e) => {
    const pos = cellOf(e.target);
    if (pos?.r === hot?.r && pos?.c === hot?.c) return;
    highlight(pos);
    emit('enter', pos);
  };
  const onLeave = () => {
    if (!hot) return;
    highlight(null);
    emit('enter', null);
  };
  const onUp = (e) => {
    if (button === null) return;
    emit('up', cellOf(e.target));
    button = null;
  };
  const onContext = (e) => e.preventDefault();

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerover', onOver);
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
    setWrong,
    setHighlight,
    destroy() {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };
}
