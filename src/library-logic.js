// Pure helpers for the library view.
import { difficultyLabel, isFair } from './difficulty.js';

/** The keys a stored puzzle may have (PLAN.md D2, the tile `set` field, and D14's `art`). */
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
  const savesById = Object.fromEntries(saves);
  const sets = groupSets(puzzles, store.list('set').records).map((g) => ({
    ...g,
    progress: setProgress(g, savesById),
    saves: savesById,
  }));
  return { rows, sets, skipped };
}

/**
 * Group tile puzzles by set id and pair each group with its set record when
 * one exists. Every group is {setId, title, rows, cols, tileIds, tiles, record}:
 * tileIds is row-major (null where a tile is unknown), tiles maps id to puzzle.
 */
export function groupSets(puzzles, setRecords) {
  const byId = new Map();
  const group = (setId) => {
    if (!byId.has(setId)) byId.set(setId, { tiles: {}, positions: [], record: null });
    return byId.get(setId);
  };
  for (const p of puzzles) {
    if (!p.set) continue;
    const g = group(p.set.id);
    g.tiles[p.id] = p;
    g.positions.push({ id: p.id, row: p.set.row, col: p.set.col });
  }
  for (const record of setRecords) group(record.setId).record = record;

  const groups = [];
  for (const [setId, g] of byId) {
    let { title, rows, cols, tileIds } = g.record ?? {};
    if (!g.record) {
      rows = Math.max(...g.positions.map((q) => q.row)) + 1;
      cols = Math.max(...g.positions.map((q) => q.col)) + 1;
      tileIds = Array.from({ length: rows * cols }, () => null);
      for (const q of g.positions) tileIds[q.row * cols + q.col] = q.id;
      title = 'Untitled set';
    }
    groups.push({ setId, title, rows, cols, tileIds, tiles: g.tiles, record: g.record });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title) || a.setId.localeCompare(b.setId));
}

/** {solved, total} for a set; savesByPuzzleId maps puzzle id to save record. */
export function setProgress(set, savesByPuzzleId) {
  const solved = set.tileIds.filter((id) => {
    const solvedAt = id === null ? null : savesByPuzzleId[id]?.solvedAt;
    return solvedAt !== null && solvedAt !== undefined;
  }).length;
  return { solved, total: set.tileIds.length };
}
