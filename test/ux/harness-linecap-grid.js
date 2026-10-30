// Helpers for the grid.js survivor checks (pipeline-linecap-grid.js). They
// mount the real renderGrid, loaded by the running app's own module URL, into a
// fixed-position host on the page, and fire synthetic PointerEvents at it.
// Browser only; not part of `npm test`.

/** The fixture puzzle. '#' filled. Row clues: [2,1] [2] [1,2] []. Column clues: [1,1] [2] [2] [1,1]. */
export const PICTURE = ['##.#', '.##.', '#.##', '....'];
export const SOLUTION = PICTURE.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));
export const CLUES = {
  rows: [[2, 1], [2], [1, 2], []].map((l) => l.map((n) => ({ n, c: 1 }))),
  cols: [[1, 1], [2], [2], [1, 1]].map((l) => l.map((n) => ({ n, c: 1 }))),
};
export const WIDTH = 4;
export const HEIGHT = 4;
// Gutters: two columns of row clues on the left, two rows of column clues on top.
export const GUTTER = 2;

export const blankCells = () => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));

/**
 * Mount a renderGrid on the page of `app` (open a page first). Returns helpers;
 * call `done()` in a finally block. `events` collects every onPointer call as
 * "type:r,c:button" (null shown as "-").
 */
export async function mountGrid(app, options = {}) {
  const win = app.win();
  const { renderGrid } = await win.eval('import("/src/views/grid.js")');
  // play.css holds the sweep animation; the library page does not load it.
  if (!win.document.querySelector('link[href$="play.css"]')) {
    const link = win.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/play.css';
    const loaded = new Promise((resolve) => link.addEventListener('load', resolve, { once: true }));
    win.document.head.append(link);
    await loaded;
  }
  const events = [];
  const host = win.document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff';
  win.document.body.append(host);
  const grid = renderGrid(host, {
    width: WIDTH,
    height: HEIGHT,
    clues: CLUES,
    cells: blankCells(),
    onPointer: (e) => events.push(`${e.type}:${e.r ?? '-'},${e.c ?? '-'}:${e.button ?? '-'}`),
    ...options,
  });
  const root = host.querySelector('.nng-grid');
  const cell = (r, c) => root.querySelector(`.nng-cell[data-r="${r}"][data-c="${c}"]`);
  const center = (node) => {
    const b = node.getBoundingClientRect();
    return { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 };
  };
  /** Fire a PointerEvent of `type` at `target` (default: the window for up/cancel). */
  const fire = (target, type, init = {}) =>
    target.dispatchEvent(
      new win.PointerEvent(type, {
        bubbles: type !== 'pointerleave',
        pointerId: 7,
        pointerType: 'mouse',
        ...init,
      }),
    );
  /** The set of "r,c" of cells that have class `cls`. */
  const marked = (cls) =>
    [...root.querySelectorAll('.nng-cell')]
      .filter((n) => n.classList.contains(cls))
      .map((n) => `${n.dataset.r},${n.dataset.c}`)
      .sort();
  /** The clue chips of a line in gutter order (row: left to right, column: top to bottom). */
  const chips = (axis, i) => {
    const isRow = axis === 'row';
    const fixed = isRow ? 'gridRow' : 'gridColumn';
    const along = isRow ? 'gridColumn' : 'gridRow';
    const at = String(GUTTER + i + 1);
    return [...root.querySelectorAll(`.nng-clue-${axis}:not(.nng-clue-zero)`)]
      .filter((n) => n.style[fixed] === at)
      .sort((a, b) => Number(a.style[along]) - Number(b.style[along]));
  };
  const done = () => {
    grid.destroy();
    host.remove();
  };
  return { win, host, root, grid, events, cell, center, fire, marked, chips, done };
}
