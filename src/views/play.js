// Placeholder. The player lane replaces this. Until then it renders a
// hard-coded 10x10 demo so the shared grid can be checked by hand.
import { renderGrid } from './grid.js';
import { puzzleClues } from '../clues.js';
import { applyStroke } from '../play-state.js';

const DEMO = [
  '..########',
  '.#........',
  '#.##..##.#',
  '#.##..##.#',
  '#........#',
  '#.#....#.#',
  '#..####..#',
  '.#......#.',
  '..#....#..',
  '...####...',
].map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0)));

let root = null;
let grid = null;

export function mount(el, params = {}) {
  root = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = `Play (demo 10x10${params.id ? `, id ${params.id}` : ''})`;
  const hint = document.createElement('p');
  hint.textContent = 'Left drag fills, right drag crosses. Placeholder until the player lands.';
  root.append(heading, hint);
  el.append(root);

  const height = DEMO.length;
  const width = DEMO[0].length;
  let committed = DEMO.map((row) => row.map(() => 0));
  let path = null;
  let button = null;

  const preview = () => grid.update(applyStroke(committed, { button, path }));

  grid = renderGrid(root, {
    width,
    height,
    clues: puzzleClues(DEMO),
    cells: committed,
    onPointer({ type, r, c, button: b }) {
      if (type === 'down') {
        button = b;
        path = [[r, c]];
        preview();
      } else if (path && type === 'enter' && r !== null) {
        path.push([r, c]);
        preview();
      } else if (path && type === 'up') {
        if (r !== null) path.push([r, c]);
        committed = applyStroke(committed, { button, path });
        grid.update(committed);
        path = null;
      }
    },
  });
}

export function unmount() {
  grid?.destroy();
  root?.remove();
  grid = null;
  root = null;
}
