// Pure save-file logic: bundle a puzzle with its save, parse and validate one,
// and decide which store records an import writes. No DOM, never throws.
import { validatePuzzle, validateSave, pickKnown } from './format.js';

const KIND = 'nng-save';
const fail = (error) => ({ ok: false, puzzle: null, save: null, error });

export function serializeSaveFile(puzzle, save) {
  return JSON.stringify({ kind: KIND, v: 1, puzzle, save });
}

export function parseSaveFile(text) {
  try {
    if (typeof text !== 'string') return fail('file is not text');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return fail('file is not valid JSON');
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return fail('file is not a save file');
    }
    if (data.kind !== KIND) return fail('file is not a nonogram save file');
    if (data.v !== 1) return fail('unsupported save file version');
    const p = validatePuzzle(data.puzzle);
    if (!p.ok) return fail(`puzzle: ${p.error}`);
    const s = validateSave(data.save, data.puzzle);
    if (!s.ok) return fail(`save: ${s.error}`);
    if (data.save.puzzleId !== data.puzzle.id) return fail('save belongs to a different puzzle');
    return {
      ok: true,
      puzzle: pickKnown('puzzle', data.puzzle),
      save: pickKnown('save', data.save),
      error: null,
    };
  } catch (e) {
    return fail(`unexpected error: ${e && e.message}`);
  }
}

/**
 * Records an import writes, in order: the puzzle only when the store lacks it
 * (an existing puzzle is never overwritten), then the save.
 */
export function importWrites(parsed, store) {
  if (!parsed?.ok) return [];
  const writes = [];
  if (!store.get('puzzle', parsed.puzzle.id))
    writes.push({ kind: 'puzzle', record: parsed.puzzle });
  writes.push({ kind: 'save', record: parsed.save });
  return writes;
}
