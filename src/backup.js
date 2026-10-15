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
 * puzzle (the puzzle stays) and listed by id in `artDroppedIds`. A save is checked against its puzzle in the
 * file, else against `lookupPuzzle(id)` (e.g. the existing store). A repeated id
 * within the file is dropped, per kind, and the first valid record wins (gate
 * pass 6, L7); it is not reported as skipped. Never throws.
 */
export function parseBackup(text, lookupPuzzle = () => null) {
  const empty = { ok: false, puzzles: [], saves: [], sets: [], skipped: [], artDroppedIds: [] };
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
    const artDroppedIds = [];
    const seenPuzzles = new Set();
    for (const p of asArray(data.puzzles)) {
      const v = validatePuzzle(p);
      if (v.ok) {
        if (seenPuzzles.has(p.id)) continue;
        seenPuzzles.add(p.id);
        const bounded = boundArt(pickKnown('puzzle', p));
        puzzles.push(bounded.puzzle);
        if (bounded.dropped) artDroppedIds.push(p.id);
      } else skip('puzzle', p, v.error);
    }
    const sets = [];
    const seenSets = new Set();
    for (const s of asArray(data.sets)) {
      const v = validateSet(s);
      if (v.ok) {
        if (seenSets.has(s.setId)) continue;
        seenSets.add(s.setId);
        sets.push(pickKnown('set', s));
      } else skip('set', s, v.error);
    }
    const inFile = new Map(puzzles.map((p) => [p.id, p]));
    const saves = [];
    const seenSaves = new Set();
    for (const s of asArray(data.saves)) {
      const puzzle = inFile.get(s?.puzzleId) ?? lookupPuzzle(s?.puzzleId);
      if (!puzzle) {
        skip('save', s, 'no matching puzzle');
        continue;
      }
      const v = validateSave(s, puzzle);
      if (v.ok) {
        if (seenSaves.has(s.puzzleId)) continue;
        seenSaves.add(s.puzzleId);
        saves.push(pickKnown('save', s));
      } else skip('save', s, v.error);
    }
    return { ok: true, puzzles, saves, sets, skipped, artDroppedIds };
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

/**
 * How many puzzles in `plan` lost their picture on import. Counts only puzzles
 * the plan writes: an existing puzzle keeps its own art (gate pass 6, L13).
 */
export function droppedArtCount(plan, artDroppedIds) {
  const dropped = new Set(artDroppedIds);
  return plan.filter((w) => w.kind === 'puzzle' && dropped.has(w.record.id)).length;
}

/**
 * Copies of `puzzles` with each verdict replaced by `await rate(puzzle)`, one at
 * a time. An imported verdict is only a claim: hearts, mistake marks and hints
 * trust it, so imports recompute it with the solver (gate pass 3, L2).
 * `onProgress(done, total)`, if given, runs after each puzzle is rated.
 */
export async function rateImports(puzzles, rate, onProgress) {
  const out = [];
  for (const puzzle of puzzles) {
    out.push({ ...puzzle, verdict: await rate(puzzle) });
    onProgress?.(out.length, puzzles.length);
  }
  return out;
}

/**
 * `plan` (from planImport) with every puzzle record re-rated; other records pass
 * through. `onProgress(done, total)` counts puzzles only (gate pass 6, L2).
 */
export async function ratePlan(plan, rate, onProgress) {
  const puzzles = plan.filter((w) => w.kind === 'puzzle').map((w) => w.record);
  const rated = await rateImports(puzzles, rate, onProgress);
  let next = 0;
  return plan.map((w) => (w.kind === 'puzzle' ? { kind: 'puzzle', record: rated[next++] } : w));
}
