// Pure helpers for the library view.
import { difficultyLabel, isFair } from './difficulty.js';
import { restartCells } from './game.js';
import { puzzleClues } from './clues.js';

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

function sameGrid(a, b) {
  return a.length === b.length && a.every((row, r) => row.every((v, c) => v === b[r][c]));
}

/**
 * 'solved' | 'in progress' | 'not started', from a save record (or null).
 * A save still at the starting grid (a restart's automatic crosses included)
 * with under a second played counts as not started.
 */
export function progressOf(save, puzzle = null) {
  if (!save) return 'not started';
  if (save.solvedAt !== null && save.solvedAt !== undefined) return 'solved';
  const start = puzzle
    ? restartCells(puzzleClues(puzzle.solution), puzzle.width, puzzle.height)
    : save.cells.map((row) => row.map(() => 0));
  const atStart = sameGrid(save.cells, start) && (save.elapsedMs ?? 0) < 1000;
  return atStart ? 'not started' : 'in progress';
}

/** True when the grid is 20 or more cells on a side (D20): hard to fit on a small screen. */
export function largePuzzle(puzzle) {
  return puzzle.width >= 20 || puzzle.height >= 20;
}

export function rowModel(puzzle, save) {
  let badge = null;
  if (!puzzle.verdict) badge = 'unchecked';
  else if (!isFair(puzzle.verdict)) badge = 'not fair';
  return {
    id: puzzle.id,
    title: puzzle.title,
    name: sampleLabel(puzzle.title).name,
    ai: sampleLabel(puzzle.title).ai,
    size: `${puzzle.width} x ${puzzle.height}`,
    label: difficultyLabel(puzzle.verdict),
    badge,
    large: largePuzzle(puzzle),
    progress: progressOf(save, puzzle),
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

const PROGRESS_ORDER = { 'in progress': 0, 'not started': 1, solved: 2 };
const AI_PREFIX = 'AI test sample: ';

/** {name, ai}: the stored title with the AI-sample prefix split off (D15). The stored title keeps the prefix. */
export function sampleLabel(title) {
  const ai = String(title).startsWith(AI_PREFIX);
  return { name: ai ? title.slice(AI_PREFIX.length) : title, ai };
}

/** In progress, then not started, then solved; titles A to Z (case-insensitive, AI prefix ignored). */
function compareRows(a, b) {
  const byProgress = PROGRESS_ORDER[a.progress] - PROGRESS_ORDER[b.progress];
  if (byProgress !== 0) return byProgress;
  const key = (row) => sampleLabel(row.title).name.toLowerCase();
  return key(a).localeCompare(key(b)) || a.id.localeCompare(b.id);
}

/** What the library view shows: non-set puzzle rows plus the corrupt count. */
export function libraryModel(store) {
  const { records: puzzles, skipped } = store.list('puzzle');
  const saves = new Map(store.list('save').records.map((s) => [s.puzzleId, s]));
  const rows = puzzles
    .filter((p) => !p.set)
    .map((p) => rowModel(p, saves.get(p.id) ?? null))
    .sort(compareRows);
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
