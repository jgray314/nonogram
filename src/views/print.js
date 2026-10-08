// Print view: clues plus an empty grid on page 1, the answer key on page 2.
import { createStore } from '../store.js';
import { puzzleClues } from '../clues.js';
import { renderGrid } from './grid.js';

let root = null;
let grids = [];
let cssLink = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mount(container, params = {}) {
  cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = 'css/print.css';
  document.head.append(cssLink);

  root = el('section', 'nng-print');
  container.append(root);
  const puzzle = createStore().get('puzzle', params.id);
  if (!puzzle) {
    root.append(el('h1', null, 'Puzzle not found'), el('a', null, 'Back to library'));
    root.lastChild.href = '#/library';
    return;
  }

  const clues = puzzleClues(puzzle.solution);
  const empty = puzzle.solution.map((row) => row.map(() => 0));

  const controls = el('div', 'nng-noprint nng-print-controls');
  const printBtn = el('button', 'nng-btn', 'Print');
  printBtn.type = 'button';
  printBtn.addEventListener('click', () => window.print());
  const back = el('a', 'nng-btn', 'Back to library');
  back.href = '#/library';
  controls.append(printBtn, back);

  const page = el('div', 'nng-print-page');
  page.append(el('h1', null, puzzle.title));
  page.append(el('p', 'nng-print-meta', `${puzzle.width} x ${puzzle.height}`));
  const key = el('div', 'nng-print-page nng-print-key');
  key.append(el('h1', null, `${puzzle.title} – answer key`));

  const dims = { width: puzzle.width, height: puzzle.height, clues };
  grids = [
    renderGrid(page, { ...dims, cells: empty }),
    renderGrid(key, { ...dims, cells: puzzle.solution }),
  ];
  root.append(controls, page, key);
}

export function unmount() {
  for (const g of grids) g.destroy();
  grids = [];
  root?.remove();
  root = null;
  cssLink?.remove();
  cssLink = null;
}
