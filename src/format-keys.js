// Limits and key allow-lists for the record formats (see format.js). A leaf
// module: it imports nothing from this family.

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
// Longest side, in pixels, an imported `art` image may declare. Create scales
// art to at most this (ART_MAX_SIDE in create-logic.js), and the character cap
// alone would let a small, crafted JPEG declare a huge size.
export const MAX_ART_SIDE = 320;

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
