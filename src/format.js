// Record formats: puzzle, save, set. See PLAN.md D2, step 5, step 12b, and the
// v1.1 Contracts (save `hearts` and `rules.zen`), and the v1.2 Contracts (puzzle
// `art`, save `hints`), the optional verdict `tier` (docs/difficulty-personas.md),
// and the optional puzzle `blank` color (D29).

import { MAX_HEARTS } from './game.js';
import { TIERS } from './personas.js';

const STATUSES = ['unique-line-solvable', 'unique-needs-guessing', 'multiple', 'none', 'unknown'];
const HEX = /^#[0-9a-fA-F]{6}$/;
// Largest tile set the creator makes (4x4). Bounding it keeps a hostile record
// from making the library allocate rows*cols cells.
export const MAX_SET_SIDE = 4;
// Largest grid the creator offers, and the most colors the solver's bitmask
// holds (it uses 1 << color). Same unbounded-number shape as the set position bound.
export const MAX_GRID_SIDE = 25;
export const MAX_PALETTE = 30;
// Optional source-crop image for the solve reveal (D14): a JPEG data URL of at
// most 320px on the long side. Not part of the id hash.
export const ART_PREFIX = 'data:image/jpeg;base64,';
export const MAX_ART_CHARS = 200000;
// Generous caps on imported text and counts. Far above
// anything the app writes, so no saved puzzle can fall outside them.
export const MAX_TITLE_CHARS = 500;
export const MAX_NAME_CHARS = 100;
export const MAX_SET_ID_CHARS = 200;
export const MAX_SWEEPS = 1000000;
// Ids the app writes are 16 hex characters; this is a generous cap for a puzzle
// id, a save's puzzleId and a set's tile ids, same as the set id cap.
export const MAX_ID_CHARS = MAX_SET_ID_CHARS;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => Number.isInteger(x);
const fail = (error) => ({ ok: false, error });
const OK = { ok: true };

// The fields each record kind has. Imports keep only these, so
// a hand-edited file cannot carry extra data into the library. `set`, `art`,
// `blank`, `hearts` and `hints` are optional and stay absent when the record lacks them.
export const PUZZLE_KEYS = [
  'v',
  'id',
  'title',
  'width',
  'height',
  'palette',
  'solution',
  'verdict',
  'set',
  'art',
  'blank',
];
export const SAVE_KEYS = ['puzzleId', 'cells', 'elapsedMs', 'rules', 'solvedAt', 'hearts', 'hints'];
export const SET_KEYS = ['v', 'setId', 'title', 'rows', 'cols', 'tileIds'];
const KEYS = { puzzle: PUZZLE_KEYS, save: SAVE_KEYS, set: SET_KEYS };

// Known keys of the nested objects. Play writes exactly
// `rules.zen` and `rules.autoCross`. `verdict` is not listed: both import paths
// replace it with a fresh solver result, so whatever it carries is discarded.
export const PALETTE_ENTRY_KEYS = ['name', 'hex'];
export const PUZZLE_SET_KEYS = ['id', 'row', 'col'];
export const RULES_KEYS = ['zen', 'autoCross'];

function pickKeys(keys, obj) {
  const out = {};
  for (const key of keys) {
    if (Object.hasOwn(obj, key)) out[key] = obj[key];
  }
  return out;
}

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Copy of `record` with only the known keys of `kind` ('puzzle', 'save' or
 * 'set'), and inside it only the known keys of palette entries, the puzzle's
 * `set` and the save's `rules`. Validate first: a nested value that is not an
 * object is passed through unchanged.
 */
export function pickKnown(kind, record) {
  const out = pickKeys(KEYS[kind], record);
  if (kind === 'puzzle') {
    if (Array.isArray(out.palette)) {
      out.palette = out.palette.map((p) =>
        isPlainObject(p) ? pickKeys(PALETTE_ENTRY_KEYS, p) : p,
      );
    }
    if (isPlainObject(out.set)) out.set = pickKeys(PUZZLE_SET_KEYS, out.set);
  } else if (kind === 'save' && isPlainObject(out.rules)) {
    out.rules = pickKeys(RULES_KEYS, out.rules);
  }
  return out;
}

// Longest side, in pixels, an imported `art` image may declare. Create scales
// art to at most this (ART_MAX_SIDE in create-logic.js), and the character cap
// alone would let a small, crafted JPEG declare a huge size.
export const MAX_ART_SIDE = 320;

// JPEG start-of-frame markers: SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC).
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/**
 * Pixel size {width, height} a JPEG data URL declares in its frame header, or
 * null when it isn't a parseable JPEG. Reads the header only; it does not decode.
 */
export function jpegSize(dataUrl) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(ART_PREFIX)) return null;
    const bin = globalThis.atob(dataUrl.slice(ART_PREFIX.length));
    const b = (i) => bin.charCodeAt(i);
    if (bin.length < 4 || b(0) !== 0xff || b(1) !== 0xd8) return null;
    let i = 2;
    while (i + 3 < bin.length) {
      if (b(i) !== 0xff) return null;
      const marker = b(i + 1);
      if (marker === 0xff) {
        i += 1; // fill byte
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null; // end or scan data before any frame
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2; // markers with no length
        continue;
      }
      const length = (b(i + 2) << 8) | b(i + 3);
      if (isSof(marker)) {
        if (length < 8 || i + 8 >= bin.length) return null;
        const height = (b(i + 5) << 8) | b(i + 6);
        const width = (b(i + 7) << 8) | b(i + 8);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Import-time bound on `art`: {puzzle, dropped}. A puzzle whose art isn't a
 * readable JPEG, or declares a side over MAX_ART_SIDE, comes back without the
 * art and with dropped true. It stays in the library, just with no picture
 * reveal. validatePuzzle does not check this, so stored puzzles never vanish.
 */
export function boundArt(puzzle) {
  if (puzzle.art === undefined) return { puzzle, dropped: false };
  const size = jpegSize(puzzle.art);
  if (size && Math.max(size.width, size.height) <= MAX_ART_SIDE) return { puzzle, dropped: false };
  const rest = { ...puzzle };
  delete rest.art;
  return { puzzle: rest, dropped: true };
}

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
 * forged id cannot attach a save to a different puzzle.
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
    if (x.id.length > MAX_ID_CHARS) return fail('id is too long');
    if (typeof x.title !== 'string' || x.title.length > MAX_TITLE_CHARS) {
      return fail(`title must be a string of at most ${MAX_TITLE_CHARS} characters`);
    }
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
        p.name.length > MAX_NAME_CHARS ||
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
      if (!isInt(x.verdict.sweeps) || x.verdict.sweeps < 0 || x.verdict.sweeps > MAX_SWEEPS) {
        return fail('invalid verdict sweeps');
      }
      // Persona tier, optional: verdicts saved before tiers have none.
      if (x.verdict.tier !== undefined && !TIERS.includes(x.verdict.tier)) {
        return fail('invalid verdict tier');
      }
    }
    if (x.set !== undefined) {
      const s = x.set;
      if (
        !isObj(s) ||
        typeof s.id !== 'string' ||
        s.id.length > MAX_SET_ID_CHARS ||
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
    if (x.art !== undefined) {
      if (
        typeof x.art !== 'string' ||
        !x.art.startsWith(ART_PREFIX) ||
        x.art.length > MAX_ART_CHARS
      ) {
        return fail(`art must be a JPEG data URL of at most ${MAX_ART_CHARS} characters`);
      }
    }
    // D29: a color puzzle's blank (background) color. Display only, not in the id hash.
    if (x.blank !== undefined && (typeof x.blank !== 'string' || !HEX.test(x.blank))) {
      return fail('blank must be a #rrggbb color');
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
    if (x.puzzleId.length > MAX_ID_CHARS) return fail('puzzleId is too long');
    const g = gridError(x.cells, puzzle.width, puzzle.height, -1, puzzle.palette.length, 'cells');
    if (g) return fail(g);
    if (typeof x.elapsedMs !== 'number' || !Number.isFinite(x.elapsedMs) || x.elapsedMs < 0) {
      return fail('elapsedMs must be a non-negative number');
    }
    if (!isObj(x.rules)) return fail('rules must be a plain object');
    if (x.rules.zen !== undefined && typeof x.rules.zen !== 'boolean') {
      return fail('rules.zen must be a boolean');
    }
    // A missing hearts value means a full set, so every v1 save stays valid.
    if (x.hearts !== undefined && (!isInt(x.hearts) || x.hearts < 0 || x.hearts > MAX_HEARTS)) {
      return fail(`hearts must be an integer from 0 to ${MAX_HEARTS}`);
    }
    // Hints used (D18). Missing means 0. The cell count is a sanity bound, not
    // a true maximum: undo doesn't refund, so reveal, undo, reveal counts twice,
    // and play.js stops counting at the bound.
    const maxHints = puzzle.width * puzzle.height;
    if (x.hints !== undefined && (!isInt(x.hints) || x.hints < 0 || x.hints > maxHints)) {
      return fail(`hints must be an integer from 0 to ${maxHints}`);
    }
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
    if (x.setId.length > MAX_SET_ID_CHARS) return fail('setId is too long');
    if (typeof x.title !== 'string' || x.title.length > MAX_TITLE_CHARS) {
      return fail(`title must be a string of at most ${MAX_TITLE_CHARS} characters`);
    }
    if (!isInt(x.rows) || x.rows < 1 || x.rows > MAX_SET_SIDE)
      return fail(`rows must be 1 to ${MAX_SET_SIDE}`);
    if (!isInt(x.cols) || x.cols < 1 || x.cols > MAX_SET_SIDE)
      return fail(`cols must be 1 to ${MAX_SET_SIDE}`);
    if (!Array.isArray(x.tileIds) || x.tileIds.length !== x.rows * x.cols) {
      return fail('tileIds length must equal rows*cols');
    }
    if (!x.tileIds.every((t) => typeof t === 'string' && t.length <= MAX_ID_CHARS)) {
      return fail(`tileIds must be strings of at most ${MAX_ID_CHARS} characters`);
    }
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
