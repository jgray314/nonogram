// Record formats: puzzle, save, set. See PLAN.md D2, step 5, step 12b.

const STATUSES = ['unique-line-solvable', 'unique-needs-guessing', 'multiple', 'none', 'unknown'];
const HEX = /^#[0-9a-fA-F]{6}$/;
// Largest tile set the creator makes (4x4). Bounding it keeps a hostile record
// from making the library allocate rows*cols cells (gate pass 1, H1).
export const MAX_SET_SIDE = 4;
// Largest grid the creator offers, and the most colors the solver's bitmask
// holds (it uses 1 << color). Same unbounded-number shape as H1.
export const MAX_GRID_SIDE = 25;
export const MAX_PALETTE = 30;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => Number.isInteger(x);
const fail = (error) => ({ ok: false, error });
const OK = { ok: true };

/** Canonical JSON with a fixed key order, independent of insertion order. */
function canonical(puzzle) {
  const obj = {
    width: puzzle.width,
    height: puzzle.height,
    palette: puzzle.palette.map((p) => String(p.hex).toLowerCase()),
    solution: puzzle.solution,
  };
  if (puzzle.set !== undefined && puzzle.set !== null) {
    obj.set = { id: puzzle.set.id, row: puzzle.set.row, col: puzzle.set.col };
  }
  return JSON.stringify(obj);
}

export async function puzzleId(puzzle) {
  const bytes = new TextEncoder().encode(canonical(puzzle));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

/**
 * True when the record's id is the hash of its content. Imports check this so a
 * forged id cannot attach a save to a different puzzle (gate pass 1, M3).
 */
export async function idMatches(puzzle) {
  try {
    return (await puzzleId(puzzle)) === puzzle.id;
  } catch {
    return false;
  }
}

/** Returns an error string, or null if grid is a width x height array of ints in [min, max]. */
function gridError(grid, width, height, min, max, name) {
  if (!Array.isArray(grid) || grid.length !== height) return `${name} must have ${height} rows`;
  for (let r = 0; r < height; r++) {
    const row = grid[r];
    if (!Array.isArray(row) || row.length !== width)
      return `${name} row ${r} must have ${width} cells`;
    for (let c = 0; c < width; c++) {
      const v = row[c];
      if (!isInt(v) || v < min || v > max) return `${name}[${r}][${c}] out of range`;
    }
  }
  return null;
}

export function validatePuzzle(x) {
  try {
    if (!isObj(x)) return fail('puzzle must be an object');
    if (x.v !== 1) return fail('unsupported puzzle version');
    if (typeof x.id !== 'string' || x.id === '') return fail('id must be a non-empty string');
    if (typeof x.title !== 'string') return fail('title must be a string');
    if (!isInt(x.width) || x.width < 1 || x.width > MAX_GRID_SIDE)
      return fail(`width must be 1 to ${MAX_GRID_SIDE}`);
    if (!isInt(x.height) || x.height < 1 || x.height > MAX_GRID_SIDE)
      return fail(`height must be 1 to ${MAX_GRID_SIDE}`);
    if (!Array.isArray(x.palette) || x.palette.length < 1 || x.palette.length > MAX_PALETTE) {
      return fail(`palette must have 1 to ${MAX_PALETTE} colors`);
    }
    for (const p of x.palette) {
      if (
        !isObj(p) ||
        typeof p.name !== 'string' ||
        typeof p.hex !== 'string' ||
        !HEX.test(p.hex)
      ) {
        return fail('palette entries must be {name, hex: #rrggbb}');
      }
    }
    const g = gridError(x.solution, x.width, x.height, 0, x.palette.length, 'solution');
    if (g) return fail(g);
    if (x.verdict !== null) {
      if (!isObj(x.verdict)) return fail('verdict must be an object or null');
      if (!STATUSES.includes(x.verdict.status)) return fail('invalid verdict status');
      if (!isInt(x.verdict.sweeps) || x.verdict.sweeps < 0) return fail('invalid verdict sweeps');
    }
    if (x.set !== undefined) {
      const s = x.set;
      if (
        !isObj(s) ||
        typeof s.id !== 'string' ||
        !isInt(s.row) ||
        s.row < 0 ||
        s.row >= MAX_SET_SIDE ||
        !isInt(s.col) ||
        s.col < 0 ||
        s.col >= MAX_SET_SIDE
      ) {
        return fail('set must be {id, row, col}');
      }
    }
    return OK;
  } catch (e) {
    return fail(`unexpected error: ${e && e.message}`);
  }
}

export function validateSave(x, puzzle) {
  try {
    if (
      !isObj(puzzle) ||
      !isInt(puzzle.width) ||
      !isInt(puzzle.height) ||
      !Array.isArray(puzzle.palette)
    ) {
      return fail('a valid puzzle is required to validate a save');
    }
    if (!isObj(x)) return fail('save must be an object');
    if (typeof x.puzzleId !== 'string') return fail('puzzleId must be a string');
    const g = gridError(x.cells, puzzle.width, puzzle.height, -1, puzzle.palette.length, 'cells');
    if (g) return fail(g);
    if (typeof x.elapsedMs !== 'number' || !Number.isFinite(x.elapsedMs) || x.elapsedMs < 0) {
      return fail('elapsedMs must be a non-negative number');
    }
    if (!isObj(x.rules)) return fail('rules must be a plain object');
    if (x.solvedAt !== null && (typeof x.solvedAt !== 'number' || !Number.isFinite(x.solvedAt))) {
      return fail('solvedAt must be null or a number');
    }
    return OK;
  } catch (e) {
    return fail(`unexpected error: ${e && e.message}`);
  }
}

export function validateSet(x) {
  try {
    if (!isObj(x)) return fail('set must be an object');
    if (x.v !== 1) return fail('unsupported set version');
    if (typeof x.setId !== 'string' || x.setId === '')
      return fail('setId must be a non-empty string');
    if (typeof x.title !== 'string') return fail('title must be a string');
    if (!isInt(x.rows) || x.rows < 1 || x.rows > MAX_SET_SIDE)
      return fail(`rows must be 1 to ${MAX_SET_SIDE}`);
    if (!isInt(x.cols) || x.cols < 1 || x.cols > MAX_SET_SIDE)
      return fail(`cols must be 1 to ${MAX_SET_SIDE}`);
    if (!Array.isArray(x.tileIds) || x.tileIds.length !== x.rows * x.cols) {
      return fail('tileIds length must equal rows*cols');
    }
    if (!x.tileIds.every((t) => typeof t === 'string')) return fail('tileIds must be strings');
    return OK;
  } catch (e) {
    return fail(`unexpected error: ${e && e.message}`);
  }
}

export function toJSON(record) {
  return JSON.stringify(record);
}

export function fromJSON(str) {
  return JSON.parse(str);
}
