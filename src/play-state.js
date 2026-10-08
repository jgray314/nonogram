// Pure stroke logic for the play view. No DOM.
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.

const inGrid = (cells, r, c) =>
  Number.isInteger(r) &&
  Number.isInteger(c) &&
  r >= 0 &&
  r < cells.length &&
  c >= 0 &&
  c < cells[r].length;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Ordered, de-duplicated cells a stroke covers after axis lock and gap
 * filling, before the state filter. Empty if the start is outside the grid.
 */
export function strokeCells(cells, stroke) {
  const path = stroke?.path ?? [];
  if (path.length === 0) return [];
  const [r0, c0] = path[0];
  if (!inGrid(cells, r0, c0)) return [];

  // Axis is decided by the second distinct cell of the raw path.
  const second = path.find(([r, c]) => r !== r0 || c !== c0);
  if (!second) return [[r0, c0]];
  const dr = Math.abs(second[0] - r0);
  const dc = Math.abs(second[1] - c0);
  const horizontal = dc >= dr;

  const maxR = cells.length - 1;
  const maxC = cells[r0].length - 1;
  const project = ([r, c]) => (horizontal ? [r0, clamp(c, 0, maxC)] : [clamp(r, 0, maxR), c0]);

  const out = [];
  const seen = new Set();
  const add = (r, c) => {
    const key = r * 100003 + c;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([r, c]);
  };

  let [pr, pc] = [r0, c0];
  add(pr, pc);
  for (const point of path) {
    const [r, c] = project(point);
    const step = horizontal ? Math.sign(c - pc) : Math.sign(r - pr);
    while (pr !== r || pc !== c) {
      if (horizontal) pc += step;
      else pr += step;
      add(pr, pc);
    }
  }
  return out;
}

/**
 * Apply a stroke and return a new grid. The first cell's state and the
 * button choose the mode; only cells in the matching source state change.
 */
export function applyStroke(cells, stroke, paint = 1) {
  const next = cells.map((row) => row.slice());
  const covered = strokeCells(cells, stroke);
  if (covered.length === 0) return next;

  const [r0, c0] = covered[0];
  const first = cells[r0][c0];
  let from;
  let to;
  if (stroke.button === 'left') {
    if (first === 0) [from, to] = [0, paint];
    else if (first >= 1) [from, to] = [first, 0];
    else return next;
  } else {
    if (first === 0) [from, to] = [0, -1];
    else if (first === -1) [from, to] = [-1, 0];
    else return next;
  }

  for (const [r, c] of covered) {
    const v = cells[r][c];
    // Left-clear removes any filled cell; the other modes match one value.
    const matches = stroke.button === 'left' && first >= 1 ? v >= 1 : v === from;
    if (matches) next[r][c] = to;
  }
  return next;
}
