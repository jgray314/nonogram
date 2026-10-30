// Grid layout: the pure helpers and the DOM scaffold of renderGrid (bands,
// corner, clue gutters, cells). A leaf: it imports only ../color.js and knows
// nothing about painting or pointers. grid.js draws on what buildGrid returns.
import { inkText } from '../color.js';

/**
 * Gutter depth: the most clues in any column (top) and any row (left). With
 * `zeroClues` (Play only) an empty line shows a "0", so it counts as one.
 */
export function gutterSize(clues, { zeroClues = false } = {}) {
  const depth = (l) => (zeroClues ? l.length || 1 : l.length);
  const max = (lists) => lists.reduce((m, l) => Math.max(m, depth(l)), 0);
  return { top: max(clues.cols), left: max(clues.rows) };
}

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
 * Build the grid's DOM, not yet attached to anything. Append order is bands,
 * corner, column clues, row clues, then cells. `inks` is renderGrid's one
 * inkColors(palette) value (null for a black-only palette).
 * @param {{ width: number, height: number, clues: any, zeroClues: boolean, blank: string | null }} options
 * @param {string[] | null} inks
 */
export function buildGrid({ width, height, clues, zeroClues, blank }, inks) {
  const { top, left } = gutterSize(clues, { zeroClues });
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

  return { root, top, left, nodes, rowClues, colClues };
}
