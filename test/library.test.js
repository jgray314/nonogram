import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { puzzleId, validatePuzzle, ART_PREFIX, MAX_ART_CHARS } from '../src/format.js';
import {
  libraryModel,
  rowModel,
  progressOf,
  safeFilename,
  groupSets,
  setProgress,
  PUZZLE_KEYS,
} from '../src/library-logic.js';
import { restartCells } from '../src/game.js';
import { puzzleClues } from '../src/clues.js';
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
  assert.equal(model.sets.length, 1);
});

test('library reports skipped corrupt records', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.put('puzzle', puzzle('a'));
  storage.setItem('nng:puzzle:bad', '{nope');
  assert.equal(libraryModel(store).skipped, 1);
});

test('only art holds image data, and it is bounded', async () => {
  const store = createStore(memoryStorage());
  await loadSamples(store);
  for (const p of store.list('puzzle').records) {
    for (const key of Object.keys(p)) assert.ok(PUZZLE_KEYS.includes(key), `unexpected key ${key}`);
    const { art, ...rest } = p;
    assert.ok(!JSON.stringify(rest).includes('data:image'));
    if (art !== undefined) assert.ok(art.length <= MAX_ART_CHARS);
  }
  const [sample] = store.list('puzzle').records;
  const tooBig = { ...sample, art: ART_PREFIX + 'A'.repeat(MAX_ART_CHARS) };
  assert.equal(validatePuzzle(tooBig).ok, false);
  const png = { ...sample, art: 'data:image/png;base64,AAAA' };
  assert.equal(validatePuzzle(png).ok, false);
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

test('library row label comes from the verdict', () => {
  const label = (v) => rowModel(puzzle('a', { verdict: v }), null).label;
  assert.equal(label(verdict('unique-line-solvable', 1)), 'Easy');
  assert.equal(label(verdict('unique-line-solvable', 99)), 'Medium');
  assert.equal(label(verdict('unique-needs-guessing')), 'Hard');
  assert.equal(label(null), 'Unchecked');
});

test('progress label is not started, not new', () => {
  assert.equal(progressOf(null), 'not started');
  assert.equal(
    progressOf(
      save('a', [
        [0, 0],
        [0, 0],
      ]),
    ),
    'not started',
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

test('restarted grid with only auto-crosses is not started', () => {
  // Row 1 and column 0 of this solution are empty, so a restart crosses them.
  const p = puzzle('x', {
    width: 2,
    height: 2,
    solution: [
      [0, 1],
      [0, 0],
    ],
  });
  const start = restartCells(puzzleClues(p.solution), 2, 2);
  assert.ok(
    start.some((row) => row.some((v) => v !== 0)),
    'the start grid has crosses',
  );
  const fresh = { ...save('x', start), elapsedMs: 0 };
  assert.equal(progressOf(fresh, p), 'not started');
  assert.equal(progressOf({ ...fresh, elapsedMs: 999 }, p), 'not started');
  assert.equal(progressOf({ ...fresh, elapsedMs: 1000 }, p), 'in progress');
  assert.equal(progressOf({ ...fresh, solvedAt: 5 }, p), 'solved');
  const touched = start.map((row) => [...row]);
  touched[0][1] = 1;
  assert.equal(progressOf({ ...fresh, cells: touched }, p), 'in progress');
  assert.equal(rowModel(p, fresh).progress, 'not started');
});

test('safeFilename strips unsafe characters', () => {
  assert.equal(safeFilename('My: <Puzzle>/2?'), 'My_ _Puzzle_2_');
  assert.equal(safeFilename('   '), 'puzzle');
  assert.equal(safeFilename('../..'), 'puzzle');
  assert.ok(safeFilename('x'.repeat(500)).length <= 80);
});

test('set progress counts solved tiles', () => {
  const set = { tileIds: ['a', 'b', 'c', 'd'] };
  const saves = {
    a: save('a', [[1]], 10),
    b: save('b', [[1]], null),
    c: save('c', [[1]], 20),
  };
  assert.deepEqual(setProgress(set, saves), { solved: 2, total: 4 });
  assert.deepEqual(setProgress(set, {}), { solved: 0, total: 4 });
});

test('groupSets pairs tiles with set records and tolerates missing parts', () => {
  const tiles = [
    puzzle('t0', { set: { id: 's', row: 0, col: 0 } }),
    puzzle('t3', { set: { id: 's', row: 1, col: 1 } }),
    puzzle('o0', { set: { id: 'orphan', row: 0, col: 1 } }),
  ];
  const records = [
    { v: 1, setId: 's', title: 'Sky', rows: 2, cols: 2, tileIds: ['t0', 't1', 't2', 't3'] },
  ];
  const groups = groupSets(tiles, records);
  const s = groups.find((g) => g.setId === 's');
  assert.equal(s.title, 'Sky');
  assert.deepEqual(s.tileIds, ['t0', 't1', 't2', 't3']);
  assert.equal(s.tiles.t1, undefined);
  const o = groups.find((g) => g.setId === 'orphan');
  assert.equal(o.rows, 1);
  assert.equal(o.cols, 2);
  assert.deepEqual(o.tileIds, [null, 'o0']);
});

test('samples are valid puzzles', async () => {
  const samples = await samplePuzzles();
  assert.deepEqual(
    samples.map((p) => [p.width, p.height]),
    [
      [5, 5],
      [10, 10],
      [15, 15],
      [10, 10],
      [15, 15],
      [20, 20],
      [25, 25],
      [10, 10],
      [20, 20],
    ],
  );
  for (const p of samples) {
    assert.equal(validatePuzzle(p).ok, true, p.title);
    assert.equal(p.id, await puzzleId(p));
    assert.ok(
      p.solution.flat().some((v) => v === 1),
      'has filled cells',
    );
  }
});

test('loadSamples skips existing puzzles', async () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(await loadSamples(store), { added: 9, skipped: 0 });
  assert.deepEqual(await loadSamples(store), { added: 0, skipped: 9 });
  assert.equal(store.list('puzzle').records.length, 9);
});

test('image-based samples match their art source', async () => {
  const { readFile } = await import('node:fs/promises');
  const art = JSON.parse(await readFile(new URL('../sample-images/art.json', import.meta.url)));
  const samples = await samplePuzzles();
  for (const { title, rows } of art) {
    const p = samples.find((s) => s.title === `AI test sample: ${title}`);
    assert.ok(p, `no sample for ${title}`);
    assert.deepEqual(
      p.solution.map((row) => row.map((v) => (v ? '#' : '.')).join('')),
      rows,
      title,
    );
  }
});

test('every sample is labeled as an AI-drawn test puzzle', async () => {
  // The owner's rule: no AI in created content, so AI-drawn samples say so.
  for (const p of await samplePuzzles()) {
    assert.match(p.title, /^AI test sample: /, p.title);
  }
});

test('samples carry a solver verdict and are fair', async () => {
  const { isFair } = await import('../src/difficulty.js');
  for (const p of await samplePuzzles()) {
    assert.ok(p.verdict, `${p.title} has no verdict`);
    assert.ok(isFair(p.verdict), `${p.title} is ${p.verdict.status}`);
  }
});
