// Library backup: one JSON file holding every puzzle, save and set. Pure.
import { validatePuzzle, validateSave, validateSet, pickKnown, boundArt } from './format.js';

const KIND = 'nng-backup';
const ID_FIELDS = { puzzle: 'id', save: 'puzzleId', set: 'setId' };

export function buildBackup({ puzzles = [], saves = [], sets = [] } = {}) {
  return JSON.stringify({ kind: KIND, v: 1, puzzles, saves, sets });
}

const asArray = (x) => (Array.isArray(x) ? x : []);

/**
 * Parse and validate a backup. Invalid records are skipped and reported in
 * `skipped` as {kind, id, error}. Art that is not a small JPEG is dropped from its
 * puzzle (the puzzle stays) and counted in `artDropped`. A save is checked against its puzzle in the
 * file, else against `lookupPuzzle(id)` (e.g. the existing store). Never throws.
 */
export function parseBackup(text, lookupPuzzle = () => null) {
  const empty = { ok: false, puzzles: [], saves: [], sets: [], skipped: [], artDropped: 0 };
  try {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ...empty, error: 'not valid JSON' };
    }
    if (data === null || typeof data !== 'object' || data.kind !== KIND) {
      return { ...empty, error: 'not a Nonogram Studio backup' };
    }
    if (data.v !== 1) return { ...empty, error: 'unsupported backup version' };

    const skipped = [];
    const skip = (kind, record, error) =>
      skipped.push({ kind, id: String(record?.[ID_FIELDS[kind]] ?? '?'), error });

    const puzzles = [];
    let artDropped = 0;
    for (const p of asArray(data.puzzles)) {
      const v = validatePuzzle(p);
      if (v.ok) {
        const bounded = boundArt(pickKnown('puzzle', p));
        puzzles.push(bounded.puzzle);
        if (bounded.dropped) artDropped += 1;
      } else skip('puzzle', p, v.error);
    }
    const sets = [];
    for (const s of asArray(data.sets)) {
      const v = validateSet(s);
      if (v.ok) sets.push(pickKnown('set', s));
      else skip('set', s, v.error);
    }
    const inFile = new Map(puzzles.map((p) => [p.id, p]));
    const saves = [];
    for (const s of asArray(data.saves)) {
      const puzzle = inFile.get(s?.puzzleId) ?? lookupPuzzle(s?.puzzleId);
      if (!puzzle) {
        skip('save', s, 'no matching puzzle');
        continue;
      }
      const v = validateSave(s, puzzle);
      if (v.ok) saves.push(pickKnown('save', s));
      else skip('save', s, v.error);
    }
    return { ok: true, puzzles, saves, sets, skipped, artDropped };
  } catch (e) {
    return { ...empty, error: `unexpected error: ${e && e.message}` };
  }
}

/**
 * Records to write, as [{kind, record}], skipping ids already present.
 * existingIds: {puzzles, saves, sets}, each an iterable of ids. Order is
 * puzzles, then sets, then saves, so a half-finished import never leaves a
 * set or save pointing at nothing.
 */
export function planImport(parsed, existingIds = {}) {
  const have = (kind) => new Set(existingIds[kind] ?? []);
  const out = [];
  const add = (kind, records, idField, existing) => {
    for (const record of records) {
      if (!existing.has(record[idField])) out.push({ kind, record });
    }
  };
  add('puzzle', parsed.puzzles, 'id', have('puzzles'));
  add('set', parsed.sets, 'setId', have('sets'));
  add('save', parsed.saves, 'puzzleId', have('saves'));
  return out;
}
