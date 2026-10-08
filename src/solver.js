/**
 * Nonogram solver. Cells are null (unknown), 0 (empty) or k >= 1 (color k).
 * A Clue is {n, c}.
 */

/**
 * Complete single-line solver. Considers every placement of the clue runs
 * consistent with `known` (left-to-right DP, forward and backward reachability)
 * and returns the line with every cell all placements agree on, or null when
 * no placement exists. Adjacent runs of the same color need a gap; runs of
 * different colors may touch.
 */
export function solveLine(clues, known) {
  const len = known.length;
  const m = clues.length;
  const canEmpty = (i) => known[i] === null || known[i] === 0;
  const canColor = (i, c) => known[i] === null || known[i] === c;
  // gap[j]: cells that must be empty after run j (before run j+1).
  const gap = clues.map((cl, j) => (j + 1 < m && clues[j + 1].c === cl.c ? 1 : 0));

  // Edges out of state (j, i): run j is the next to place, cell i the next
  // cell to decide. Calls visit(nj, ni, kind, n, c) for each legal edge.
  const edges = (j, i, visit) => {
    if (i < len && canEmpty(i)) visit(j, i + 1, 0, 0, 0);
    if (j < m) {
      const { n, c } = clues[j];
      const end = i + n;
      if (end + gap[j] > len) return;
      for (let x = i; x < end; x += 1) if (!canColor(x, c)) return;
      if (gap[j] && !canEmpty(end)) return;
      visit(j + 1, end + gap[j], 1, n, c);
    }
  };

  const W = len + 1;
  // back[j * W + i]: state (j, i) can be completed.
  const back = new Uint8Array((m + 1) * W);
  back[m * W + len] = 1;
  for (let j = m; j >= 0; j -= 1) {
    for (let i = len; i >= 0; i -= 1) {
      if (j === m && i === len) continue;
      let ok = 0;
      edges(j, i, (nj, ni) => {
        if (back[nj * W + ni]) ok = 1;
      });
      back[j * W + i] = ok;
    }
  }
  if (!back[0]) return null;

  // possible[x]: bit 0 = may be empty, bit c = may be color c.
  const possible = new Array(len).fill(0);
  const fwd = new Uint8Array((m + 1) * W);
  fwd[0] = 1;
  for (let j = 0; j <= m; j += 1) {
    for (let i = 0; i <= len; i += 1) {
      if (!fwd[j * W + i] || !back[j * W + i]) continue;
      edges(j, i, (nj, ni, kind, n, c) => {
        if (!back[nj * W + ni]) return;
        fwd[nj * W + ni] = 1;
        if (kind === 0) {
          possible[i] |= 1;
        } else {
          for (let x = i; x < i + n; x += 1) possible[x] |= 1 << c;
          if (ni > i + n) possible[i + n] |= 1;
        }
      });
    }
  }

  return possible.map((bits, x) => {
    if (known[x] !== null) return known[x];
    if (bits === 1) return 0;
    if (bits !== 0 && (bits & 1) === 0 && (bits & (bits - 1)) === 0) {
      return 31 - Math.clz32(bits);
    }
    return null;
  });
}

/**
 * Line-solve to a fixed point. Returns {contradiction, grid, sweeps}. A sweep
 * is one pass over every row then every column; `sweeps` counts the sweeps
 * that decided at least one cell. Does not mutate `start`.
 */
export function propagate(problem, start = null) {
  const { width, height, rows, cols } = problem;
  const grid = start
    ? start.map((r) => r.slice())
    : Array.from({ length: height }, () => new Array(width).fill(null));
  let sweeps = 0;
  for (;;) {
    let changed = false;
    for (let r = 0; r < height; r += 1) {
      const res = solveLine(rows[r], grid[r]);
      if (res === null) return { contradiction: true, grid, sweeps };
      for (let c = 0; c < width; c += 1) {
        if (grid[r][c] !== res[c]) {
          grid[r][c] = res[c];
          changed = true;
        }
      }
    }
    for (let c = 0; c < width; c += 1) {
      const res = solveLine(
        cols[c],
        grid.map((row) => row[c]),
      );
      if (res === null) return { contradiction: true, grid, sweeps };
      for (let r = 0; r < height; r += 1) {
        if (grid[r][c] !== res[r]) {
          grid[r][c] = res[r];
          changed = true;
        }
      }
    }
    if (!changed) break;
    sweeps += 1;
  }
  return { contradiction: false, grid, sweeps };
}

export const DEFAULT_BUDGET = 5000;

function unresolvedCells(grid) {
  const out = [];
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === null) out.push([r, c]);
    }),
  );
  return out;
}

/**
 * Solve and classify a puzzle.
 *
 * Returns {status, sweeps, grid, unresolved, differing}. `grid` is the line
 * solver's fixed point (null = it could not decide), `unresolved` lists those
 * cells. When status is `multiple`, `differing` lists cells that differ
 * between two solutions found; otherwise it is []. `budget` caps the number of
 * search nodes (propagations during backtracking), so results are
 * deterministic. `unknown` means the budget ran out before the search could
 * prove uniqueness, multiplicity or absence; it is never a uniqueness claim.
 */
export function solve(problem, { budget = DEFAULT_BUDGET } = {}) {
  const root = propagate(problem);
  const result = (status, extra = {}) => ({
    status,
    sweeps: root.sweeps,
    grid: root.grid,
    unresolved: unresolvedCells(root.grid),
    differing: [],
    ...extra,
  });
  if (root.contradiction) return result('none');
  if (!root.grid.some((row) => row.includes(null))) {
    return result('unique-line-solvable');
  }

  const colors = new Set();
  for (const line of [...problem.rows, ...problem.cols]) {
    for (const clue of line) colors.add(clue.c);
  }
  const values = [0, ...[...colors].sort((a, b) => a - b)];

  const solutions = [];
  let nodes = 0;
  let exhausted = false;

  const search = (grid) => {
    const cell = unresolvedCells(grid)[0];
    if (!cell) {
      solutions.push(grid);
      return;
    }
    for (const v of values) {
      if (nodes >= budget) {
        exhausted = true;
        return;
      }
      nodes += 1;
      const next = grid.map((row) => row.slice());
      next[cell[0]][cell[1]] = v;
      const res = propagate(problem, next);
      if (!res.contradiction) search(res.grid);
      if (solutions.length >= 2 || exhausted) return;
    }
  };
  search(root.grid);

  if (solutions.length >= 2) {
    const [a, b] = solutions;
    const differing = [];
    a.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v !== b[r][c]) differing.push([r, c]);
      }),
    );
    return result('multiple', { differing });
  }
  if (exhausted) return result('unknown');
  if (solutions.length === 1) return result('unique-needs-guessing');
  return result('none');
}
