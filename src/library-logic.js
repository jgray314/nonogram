// Pure helpers for the library view.
import { difficultyLabel, isFair } from './difficulty.js';

/** The keys a stored puzzle may have (PLAN.md D2 plus the tile `set` field). */
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
];

/** 'solved' | 'in progress' | 'new', from a save record (or null). */
export function progressOf(save) {
  if (!save) return 'new';
  if (save.solvedAt !== null && save.solvedAt !== undefined) return 'solved';
  return save.cells.some((row) => row.some((v) => v !== 0)) ? 'in progress' : 'new';
}

export function rowModel(puzzle, save) {
  let badge = null;
  if (!puzzle.verdict) badge = 'unchecked';
  else if (!isFair(puzzle.verdict)) badge = 'not fair';
  return {
    id: puzzle.id,
    title: puzzle.title,
    size: `${puzzle.width} x ${puzzle.height}`,
    label: difficultyLabel(puzzle.verdict),
    badge,
    progress: progressOf(save),
  };
}

/** A file-name-safe version of a title (no extension). */
export function safeFilename(title) {
  const cleaned = String(title)
    .replace(/[^A-Za-z0-9 _.-]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .trim()
    .replace(/^[._]+$/, '')
    .slice(0, 80);
  return cleaned === '' ? 'puzzle' : cleaned;
}

/** What the library view shows: non-set puzzle rows plus the corrupt count. */
export function libraryModel(store) {
  const { records: puzzles, skipped } = store.list('puzzle');
  const saves = new Map(store.list('save').records.map((s) => [s.puzzleId, s]));
  const rows = puzzles.filter((p) => !p.set).map((p) => rowModel(p, saves.get(p.id) ?? null));
  return { rows, skipped };
}
