import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { puzzleId, validatePuzzle } from '../src/format.js';
import {
  libraryModel,
  rowModel,
  progressOf,
  safeFilename,
  PUZZLE_KEYS,
} from '../src/library-logic.js';
import { samplePuzzles, loadSamples } from '../src/samples.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const puzzle = (id, extra = {}) => ({
  v: 1,
  id,
  title: `T ${id}`,
  width: 2,
  height: 2,
  palette: [{ name: 'black', hex: '#000000' }],
  solution: [
    [1, 0],
    [0, 1],
  ],
  verdict: null,
  ...extra,
});
const verdict = (status, sweeps = 2) => ({ status, sweeps });
const save = (pid, cells, solvedAt = null) => ({
  puzzleId: pid,
  cells,
  elapsedMs: 5,
  rules: {},
  solvedAt,
});

test('library lists saved puzzles', () => {
  const store = createStore(memoryStorage());
  store.put('puzzle', puzzle('a'));
  store.put('puzzle', puzzle('b'));
  store.put('puzzle', puzzle('t1', { set: { id: 's', row: 0, col: 0 } }));
  const model = libraryModel(store);
  assert.deepEqual(model.rows.map((r) => r.id).sort(), ['a', 'b']);
  assert.equal(model.rows[0].size, '2 x 2');
  assert.equal(model.skipped, 0);
});

test('library reports skipped corrupt records', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.put('puzzle', puzzle('a'));
  storage.setItem('nng:puzzle:bad', '{nope');
  assert.equal(libraryModel(store).skipped, 1);
});

test('library record has no image data', async () => {
  const store = createStore(memoryStorage());
  await loadSamples(store);
  for (const p of store.list('puzzle').records) {
    for (const key of Object.keys(p)) assert.ok(PUZZLE_KEYS.includes(key), `unexpected key ${key}`);
    assert.ok(!JSON.stringify(p).includes('data:image'));
  }
});

test('badge shown for non-unique verdict', () => {
  assert.equal(rowModel(puzzle('a', { verdict: verdict('multiple') }), null).badge, 'not fair');
  assert.equal(rowModel(puzzle('a', { verdict: verdict('none') }), null).badge, 'not fair');
  assert.equal(rowModel(puzzle('a', { verdict: null }), null).badge, 'unchecked');
  assert.equal(
    rowModel(puzzle('a', { verdict: verdict('unique-line-solvable') }), null).badge,
    null,
  );
  assert.equal(
    rowModel(puzzle('a', { verdict: verdict('unique-needs-guessing') }), null).badge,
    null,
  );
});

test('difficulty label from verdict', () => {
  const label = (v) => rowModel(puzzle('a', { verdict: v }), null).label;
  assert.equal(label(verdict('unique-line-solvable', 1)), 'Easy');
  assert.equal(label(verdict('unique-line-solvable', 99)), 'Medium');
  assert.equal(label(verdict('unique-needs-guessing')), 'Hard');
  assert.equal(label(null), 'Unchecked');
});

test('progress from save', () => {
  assert.equal(progressOf(null), 'new');
  assert.equal(
    progressOf(
      save('a', [
        [0, 0],
        [0, 0],
      ]),
    ),
    'new',
  );
  assert.equal(
    progressOf(
      save('a', [
        [1, 0],
        [0, 0],
      ]),
    ),
    'in progress',
  );
  assert.equal(
    progressOf(
      save(
        'a',
        [
          [1, 0],
          [0, 1],
        ],
        123,
      ),
    ),
    'solved',
  );
});

test('safeFilename strips unsafe characters', () => {
  assert.equal(safeFilename('My: <Puzzle>/2?'), 'My_ _Puzzle_2_');
  assert.equal(safeFilename('   '), 'puzzle');
  assert.equal(safeFilename('../..'), 'puzzle');
  assert.ok(safeFilename('x'.repeat(500)).length <= 80);
});

test('samples are valid puzzles', async () => {
  const samples = await samplePuzzles();
  assert.deepEqual(
    samples.map((p) => [p.width, p.height]),
    [
      [5, 5],
      [10, 10],
      [15, 15],
    ],
  );
  for (const p of samples) {
    assert.equal(validatePuzzle(p).ok, true, p.title);
    assert.equal(p.verdict, null);
    assert.equal(p.id, await puzzleId(p));
    assert.ok(
      p.solution.flat().some((v) => v === 1),
      'has filled cells',
    );
  }
});

test('loadSamples skips existing puzzles', async () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(await loadSamples(store), { added: 3, skipped: 0 });
  assert.deepEqual(await loadSamples(store), { added: 0, skipped: 3 });
  assert.equal(store.list('puzzle').records.length, 3);
});
