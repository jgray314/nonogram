import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { puzzleId, validatePuzzle, ART_PREFIX, MAX_ART_CHARS } from '../src/format.js';
import {
  libraryModel,
  rowModel,
  progressOf,
  sampleLabel,
  largePuzzle,
  safeFilename,
  groupSets,
  setProgress,
  tileSolved,
  tileFace,
  PUZZLE_KEYS,
  withTier,
  puzzleMeta,
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
  // One record with art, so the loop below checks a real one (samples have none).
  const [first] = store.list('puzzle').records;
  store.put('puzzle', { ...first, art: ART_PREFIX + 'AAAA' });
  let withArt = 0;
  for (const p of store.list('puzzle').records) {
    for (const key of Object.keys(p)) assert.ok(PUZZLE_KEYS.includes(key), `unexpected key ${key}`);
    const { art, ...rest } = p;
    assert.ok(!JSON.stringify(rest).includes('data:image'));
    if (art !== undefined) {
      withArt += 1;
      assert.ok(art.length <= MAX_ART_CHARS);
    }
  }
  assert.equal(withArt, 1);
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
  assert.equal(label({ ...verdict('unique-line-solvable'), tier: 'newcomer' }), 'Easy');
  assert.equal(label({ ...verdict('unique-line-solvable'), tier: 'casual' }), 'Medium');
  assert.equal(label({ ...verdict('unique-line-solvable'), tier: 'regular' }), 'Hard');
  assert.equal(label(verdict('unique-needs-guessing')), 'Very hard');
  assert.equal(label(null), 'Unchecked');
});

test('a large puzzle reads one step harder, in the row and the play header (D23)', () => {
  const big = puzzle('big', {
    width: 20,
    height: 20,
    verdict: { ...verdict('unique-line-solvable'), tier: 'newcomer' },
  });
  assert.equal(rowModel(big, null).label, 'Medium');
  assert.equal(puzzleMeta(big), '20 x 20 · Medium');
  const small = puzzle('s', { verdict: { ...verdict('unique-line-solvable'), tier: 'newcomer' } });
  assert.equal(puzzleMeta(small), '2 x 2 · Easy');
  assert.equal(puzzleMeta(puzzle('u')), '2 x 2 · Unchecked');
});

test('a puzzle saved before tiers is rated for display, not rewritten', () => {
  const store = createStore(memoryStorage());
  const full = [
    [1, 1],
    [1, 1],
  ];
  store.put('puzzle', puzzle('old', { solution: full, verdict: verdict('unique-line-solvable') }));
  const before = JSON.stringify(store.get('puzzle', 'old'));
  const [row] = libraryModel(store).rows;
  assert.equal(row.label, 'Easy'); // full lines: the Newcomer finishes it
  assert.equal(JSON.stringify(store.get('puzzle', 'old')), before);
  assert.equal(withTier(store.get('puzzle', 'old')).tier, 'newcomer');
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
  // The default 2x2 puzzle is neither blank nor full, so only saves count.
  const tiles = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, puzzle(id)]));
  const set = { tileIds: ['a', 'b', 'c', 'd'], tiles };
  const saves = {
    a: save('a', [[1]], 10),
    b: save('b', [[1]], null),
    c: save('c', [[1]], 20),
  };
  assert.deepEqual(setProgress(set, saves), { solved: 2, total: 4, complete: false });
  assert.deepEqual(setProgress(set, {}), { solved: 0, total: 4, complete: false });
});

test('all-blank and all-filled tiles count as solved unopened; complete needs every tile (D24)', () => {
  const tile = (id, solution) => puzzle(id, { solution });
  const tiles = {
    blank: tile('blank', [
      [0, 0],
      [0, 0],
    ]),
    full: tile('full', [
      [1, 1],
      [1, 1],
    ]),
    mixed: tile('mixed', [
      [1, 0],
      [0, 1],
    ]),
  };
  const set = { tileIds: ['blank', 'full', 'mixed'], tiles };
  assert.deepEqual(setProgress(set, {}), { solved: 2, total: 3, complete: false });
  const saves = { mixed: save('mixed', tiles.mixed.solution, 10) };
  assert.deepEqual(setProgress(set, saves), { solved: 3, total: 3, complete: true });
  // A missing tile keeps the set from completing.
  const holed = { tileIds: ['blank', null], tiles };
  assert.equal(setProgress(holed, {}).complete, false);
  assert.equal(tileSolved(undefined, undefined), false);
});

test('set tiles count as solved by the same rule Play starts with (gate pass 5, M1, L1)', () => {
  const palette = [
    { name: 'black', hex: '#000000' },
    { name: 'red', hex: '#ff0000' },
  ];
  // No blank cells, but each row is two runs: Play opens it blank, so it isn't solved.
  const twoColor = puzzle('tc', {
    palette,
    solution: [
      [1, 2],
      [1, 2],
    ],
  });
  assert.equal(tileSolved(twoColor, undefined), false);
  // One color per row, full width: Play fills it, so it is.
  const rowColors = puzzle('rc', {
    palette,
    solution: [
      [1, 1],
      [2, 2],
    ],
  });
  assert.equal(tileSolved(rowColors, undefined), true);
  // An orphan save (its puzzle record is gone) doesn't count.
  assert.equal(tileSolved(undefined, save('gone', [[1]], 10)), false);
});

test('a set tile shows its photo only once the whole set is complete (D24)', () => {
  const withArt = puzzle('a', { art: 'data:image/jpeg;base64,AAAA' });
  assert.equal(tileFace(withArt, true, true), 'art');
  assert.equal(tileFace(withArt, true, false), 'cells');
  assert.equal(tileFace(withArt, false, false), 'label');
  assert.equal(tileFace(puzzle('b'), true, true), 'cells'); // no crop: keeps its cells
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
  assert.deepEqual(await loadSamples(store), { added: 11, skipped: 0 });
  assert.deepEqual(await loadSamples(store), { added: 0, skipped: 11 });
  assert.equal(store.list('puzzle').records.length, 11);
});

test('image-based samples match their art source', async () => {
  const { readFile } = await import('node:fs/promises');
  const art = JSON.parse(
    await readFile(new URL('../sample-images/art.json', import.meta.url), 'utf8'),
  );
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

test('library orders in progress, not started, solved, then by title', () => {
  const store = createStore(memoryStorage());
  const rowsOf = (...specs) => {
    for (const [id, title, saveRecord] of specs) {
      store.put('puzzle', puzzle(id, { title }));
      if (saveRecord) store.put('save', saveRecord);
    }
    return libraryModel(store).rows.map((r) => r.id);
  };
  const played = (id) =>
    save(id, [
      [1, 0],
      [0, 0],
    ]);
  const done = (id) =>
    save(
      id,
      [
        [1, 0],
        [0, 1],
      ],
      9,
    );
  const order = rowsOf(
    ['a', 'Zebra', played('a')],
    ['b', 'apple', done('b')],
    ['c', 'AI test sample: Cat (10x10)', null],
    ['d', 'Moth', null],
    ['e', 'Bee', played('e')],
    ['f', 'Ant', done('f')],
  );
  // in progress (Bee, Zebra), not started (Cat ignoring the prefix, Moth), solved (Ant, apple)
  assert.deepEqual(order, ['e', 'a', 'c', 'd', 'f', 'b']);
});

test('sampleLabel splits the AI prefix', () => {
  assert.deepEqual(sampleLabel('AI test sample: Cat (10x10)'), { name: 'Cat (10x10)', ai: true });
  assert.deepEqual(sampleLabel('My cat'), { name: 'My cat', ai: false });
  // Only a leading prefix counts, and the stored title is never changed.
  assert.deepEqual(sampleLabel('Not an AI test sample: x'), {
    name: 'Not an AI test sample: x',
    ai: false,
  });
  const row = rowModel(puzzle('a', { title: 'AI test sample: Cat' }), null);
  assert.equal(row.title, 'AI test sample: Cat');
  assert.equal(row.name, 'Cat');
  assert.equal(row.ai, true);
});

test('largePuzzle is 20 or more on a side', () => {
  assert.equal(largePuzzle({ width: 19, height: 19 }), false);
  assert.equal(largePuzzle({ width: 20, height: 5 }), true);
  assert.equal(largePuzzle({ width: 5, height: 25 }), true);
  assert.equal(largePuzzle({ width: 15, height: 10 }), false);
});
