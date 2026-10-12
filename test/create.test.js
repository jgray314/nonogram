import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleId, validatePuzzle, ART_PREFIX, MAX_ART_CHARS } from '../src/format.js';
import { makeSet, tileGrid } from '../src/tiles.js';
import { createStore } from '../src/store.js';
import {
  SIZES,
  defaultSize,
  titleFromFile,
  hasFilledCell,
  hasUnsavedWork,
  gridSig,
  artSize,
  tileCropRect,
  pickArt,
  withArts,
  centerCrop,
  loadScale,
  blankGrid,
  newEditorState,
  regenerateNeedsConfirm,
  reportView,
  buildPuzzleRecord,
  canSave,
  TILE_COUNTS,
  fullSize,
  sliceTiles,
  tileStatusLine,
  canSaveSet,
  withVerdicts,
  setWrites,
  rollbackTargets,
  existingPuzzle,
  narrowCellSize,
} from '../src/create-logic.js';

test('defaultSize picks closest aspect', () => {
  assert.deepEqual(defaultSize(800, 800), { width: 15, height: 15 });
  // 2:1 -> short 7.5, a tie between 5 and 10 goes to the larger
  assert.deepEqual(defaultSize(1000, 500), { width: 15, height: 10 });
  // 3:2 -> short 10
  assert.deepEqual(defaultSize(600, 400), { width: 15, height: 10 });
  // tall 1:3 -> short 5, long side is height
  assert.deepEqual(defaultSize(100, 300), { width: 5, height: 15 });
  // very wide: minimum 5
  assert.deepEqual(defaultSize(5000, 100), { width: 15, height: 5 });
  // every result is from SIZES
  for (const [w, h] of [
    [640, 480],
    [333, 500],
    [900, 1000],
  ]) {
    const s = defaultSize(w, h);
    assert.ok(SIZES.includes(s.width) && SIZES.includes(s.height));
  }
});

test('crop stays inside image bounds', () => {
  const W = 400;
  const H = 300;
  const offsets = [-9999, -50, 0, 50, 9999];
  for (const [gw, gh] of [
    [15, 15],
    [20, 5],
    [5, 25],
    [15, 10],
  ]) {
    for (const dx of offsets) {
      for (const dy of offsets) {
        const c = centerCrop(W, H, gw, gh, { dx, dy });
        for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(c[k]), k);
        assert.ok(c.x >= 0 && c.y >= 0, `${gw}x${gh} ${dx},${dy}`);
        assert.ok(c.x + c.w <= W && c.y + c.h <= H);
        assert.ok(c.w >= 1 && c.h >= 1);
      }
    }
  }
  // centered by default; square grid on a wide image
  assert.deepEqual(centerCrop(400, 300, 15, 15), { x: 50, y: 0, w: 300, h: 300 });
  // offset shifts, then clamps
  assert.deepEqual(centerCrop(400, 300, 15, 15, { dx: 20, dy: 0 }), {
    x: 70,
    y: 0,
    w: 300,
    h: 300,
  });
  assert.deepEqual(centerCrop(400, 300, 15, 15, { dx: 999, dy: 0 }), {
    x: 100,
    y: 0,
    w: 300,
    h: 300,
  });
});

test('load scale caps long side at 1024', () => {
  assert.equal(loadScale(500, 400), 1);
  assert.equal(loadScale(1024, 1024), 1);
  assert.equal(loadScale(2048, 1000), 0.5);
  assert.equal(loadScale(1000, 4096), 0.25);
  assert.ok(Math.round(3000 * loadScale(3000, 2000)) <= 1024);
});

test('blank grid has chosen size', () => {
  const g = blankGrid(10, 5);
  assert.equal(g.length, 5);
  assert.ok(g.every((row) => row.length === 10 && row.every((v) => v === 0)));
  const s = newEditorState({ width: 20, height: 15 });
  assert.equal(s.width, 20);
  assert.equal(s.height, 15);
  assert.equal(s.grid.length, 15);
  assert.equal(s.grid[0].length, 20);
  assert.equal(s.hasImage, false);
  assert.equal(s.manualEdits, false);
  // rows are independent arrays
  g[0][0] = 1;
  assert.equal(g[1][0], 0);
});

test('regenerateNeedsConfirm only when manual edits exist', () => {
  assert.equal(regenerateNeedsConfirm(true), true);
  assert.equal(regenerateNeedsConfirm(false), false);
});

test('reportView maps solver results to text, label and highlight', () => {
  const multiple = {
    status: 'multiple',
    sweeps: 2,
    unresolved: [[0, 0]],
    differing: [
      [0, 1],
      [1, 0],
    ],
  };
  const unique = {
    status: 'unique-line-solvable',
    sweeps: 2,
    tier: 'newcomer',
    unresolved: [],
    differing: [],
  };
  const guessing = {
    status: 'unique-needs-guessing',
    sweeps: 1,
    tier: 'expert',
    unresolved: [[2, 2]],
    differing: [],
  };

  const before = reportView(multiple);
  assert.deepEqual(before.highlight, [
    [0, 1],
    [1, 0],
  ]);
  assert.equal(before.label, 'Not fair');
  assert.match(before.text, /more than one/i);

  // the user edits a cell; the next result replaces the report
  const after = reportView(unique);
  assert.deepEqual(after.highlight, []);
  assert.equal(after.label, 'Easy');
  assert.notEqual(after.text, before.text);

  const hard = reportView(guessing);
  assert.deepEqual(hard.highlight, [[2, 2]]);
  assert.equal(hard.label, 'Very hard');
  // the label steps up on a large grid (D23)
  assert.equal(reportView(unique, { width: 20, height: 20 }).label, 'Medium');

  // no result yet: nothing to highlight, nothing claimed
  const pending = reportView(null);
  assert.deepEqual(pending.highlight, []);
  assert.equal(pending.label, 'Unchecked');
  assert.match(pending.text, /checking/i);
});

test('saved puzzle carries verdict', async () => {
  const grid = [
    [1, 0],
    [0, 1],
  ];
  const result = { status: 'multiple', sweeps: 3, unresolved: [], differing: [[0, 0]] };
  const rec = buildPuzzleRecord(grid, '  My cat ', result);
  assert.deepEqual(rec.verdict, { status: 'multiple', sweeps: 3 });
  assert.equal(rec.title, 'My cat');
  assert.equal(rec.width, 2);
  assert.equal(rec.height, 2);
  assert.deepEqual(rec.palette, [{ name: 'black', hex: '#000000' }]);
  assert.deepEqual(rec.solution, grid);
  assert.notEqual(rec.solution, grid); // a copy, so later edits cannot change it
  assert.equal(buildPuzzleRecord(grid, '   ', result).title, 'Untitled');

  rec.id = await puzzleId(rec);
  assert.equal(validatePuzzle(rec).ok, true);

  // A fair result's persona tier is saved with it, and doesn't change the id.
  const fair = { status: 'unique-line-solvable', sweeps: 1, tier: 'regular' };
  const rated = buildPuzzleRecord(grid, 'My cat', fair);
  assert.deepEqual(rated.verdict, { status: 'unique-line-solvable', sweeps: 1, tier: 'regular' });
  rated.id = await puzzleId(rated);
  assert.equal(rated.id, rec.id);
  assert.equal(validatePuzzle(rated).ok, true);
  assert.equal(
    validatePuzzle({ ...rated, verdict: { ...rated.verdict, tier: 'wizard' } }).ok,
    false,
  );
});

test('canSave refuses pending or stale reports', () => {
  const result = { status: 'unique-line-solvable', sweeps: 1 };
  assert.equal(canSave({ phase: 'pending', result: null }), false);
  assert.equal(canSave({ phase: 'pending', result }), false); // stale result
  assert.equal(canSave({ phase: 'error', result: null }), false);
  assert.equal(canSave({ phase: 'fresh', result: null }), false);
  assert.equal(canSave({ phase: 'fresh', result }), true);
});

test('tile helpers size and slice the full grid', () => {
  assert.deepEqual(TILE_COUNTS, [1, 2, 3, 4]);
  assert.deepEqual(fullSize(10, 5, 2, 3), { width: 30, height: 10 });
  assert.deepEqual(fullSize(15, 15, 1, 1), { width: 15, height: 15 });
  const full = Array.from({ length: 4 }, (_, r) => Array.from({ length: 6 }, (_, c) => r * 10 + c));
  const tiles = sliceTiles(full, 2, 3);
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].length, 3);
  assert.deepEqual(tiles[1][2], [
    [24, 25],
    [34, 35],
  ]);
  // 1x1 is the grid itself
  assert.deepEqual(sliceTiles(full, 1, 1)[0][0], full);
});

test('tile status line names the tile, difficulty and flag', () => {
  const easy = { status: 'unique-line-solvable', sweeps: 1, tier: 'newcomer' };
  const bad = { status: 'multiple', sweeps: 1 };
  assert.equal(tileStatusLine(0, 1, easy, null), 'r1c2: Easy');
  assert.equal(tileStatusLine(1, 0, bad, 'blank'), 'r2c1: Not fair (blank)');
  assert.equal(tileStatusLine(0, 0, null, null), 'r1c1: checking...');
  assert.equal(tileStatusLine(0, 1, easy, null, { width: 25, height: 25 }), 'r1c2: Medium');
});

test('set save waits for every tile report', () => {
  const ok = { phase: 'fresh', result: { status: 'multiple', sweeps: 0 } };
  const wait = { phase: 'pending', result: null };
  assert.equal(canSaveSet([ok, ok]), true);
  assert.equal(canSaveSet([ok, wait]), false);
  assert.equal(canSaveSet([]), false);
});

test('set save writes tiles before set record', async () => {
  const full = Array.from({ length: 2 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => (r + c) % 2),
  );
  const tiles = sliceTiles(full, 1, 2);
  const { set, puzzles } = await makeSet({
    title: 'Mosaic',
    tiles,
    palette: [{ name: 'black', hex: '#000000' }],
  });
  const reports = [
    {
      phase: 'fresh',
      result: { status: 'unique-line-solvable', sweeps: 2, tier: 'casual', extra: 1 },
    },
    { phase: 'fresh', result: { status: 'multiple', sweeps: 1, tier: null } },
  ];
  const filled = withVerdicts(puzzles, reports);
  assert.deepEqual(filled[0].verdict, {
    status: 'unique-line-solvable',
    sweeps: 2,
    tier: 'casual',
  });
  assert.deepEqual(filled[1].verdict, { status: 'multiple', sweeps: 1 });
  assert.equal(puzzles[0].verdict, null); // input not mutated

  const writes = setWrites(set, filled);
  assert.equal(writes.length, 3);
  assert.deepEqual(
    writes.map((w) => w.kind),
    ['puzzle', 'puzzle', 'set'],
  );
  assert.deepEqual(
    writes.slice(0, 2).map((w) => w.record.id),
    set.tileIds,
  );
  assert.equal(writes[2].record, set);
  // every puzzle the set points at is written before the set record
  const written = new Set();
  for (const w of writes) {
    if (w.kind === 'set') assert.ok(w.record.tileIds.every((id) => written.has(id)));
    else written.add(w.record.id);
  }
});

test('sliceTiles agrees with tileGrid tiles', () => {
  // 4x2 px image: left half dark, right half light; two tiles of 2x2 cells
  const rgba = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) {
    const v = i % 4 < 2 ? 0 : 255;
    rgba.set([v, v, v, 255], i * 4);
  }
  const { full, tiles } = tileGrid(rgba, 4, 2, { x: 0, y: 0, w: 4, h: 2 }, 2, 2, 1, 2, {
    threshold: 128,
    invert: false,
  });
  assert.deepEqual(full, [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
  ]);
  assert.deepEqual(sliceTiles(full, 1, 2), tiles);
});

test('set save rollback spares records that existed before (gate M4)', () => {
  const written = [
    { kind: 'puzzle', record: { id: 'old' } },
    { kind: 'puzzle', record: { id: 'new' } },
    { kind: 'set', record: { setId: 's' } },
  ];
  const existed = (kind, id) => kind === 'puzzle' && id === 'old';
  assert.deepEqual(rollbackTargets(written, existed), [
    ['puzzle', 'new'],
    ['set', 's'],
  ]);
});

test('defaultSize keeps a preset-sized source', () => {
  assert.deepEqual(defaultSize(20, 20), { width: 20, height: 20 });
  assert.deepEqual(defaultSize(25, 10), { width: 25, height: 10 });
  assert.deepEqual(defaultSize(5, 15), { width: 5, height: 15 });
  // only when both sides are presets
  assert.deepEqual(defaultSize(20, 21), { width: 15, height: 15 });
});

test('titleFromFile cleans a file name', () => {
  assert.equal(titleFromFile('my-cat_2.png'), 'my cat 2');
  assert.equal(titleFromFile('  Photo.final.JPG '), 'Photo.final');
  assert.equal(titleFromFile('x'.repeat(80) + '.png'), 'x'.repeat(60));
});

test('titleFromFile falls back to Untitled', () => {
  assert.equal(titleFromFile('.png'), 'Untitled');
  assert.equal(titleFromFile('---.gif'), 'Untitled');
  assert.equal(titleFromFile(''), 'Untitled');
});

test('hasUnsavedWork is true until the current grid is saved', () => {
  const st = newEditorState({ width: 5, height: 5 });
  assert.equal(hasUnsavedWork(st, null), false);
  st.grid[0][0] = 1;
  assert.equal(hasUnsavedWork(st, null), true);
  const sig = gridSig(st);
  assert.equal(hasUnsavedWork(st, sig), false);
  st.grid[1][1] = 1;
  assert.equal(hasUnsavedWork(st, sig), true);
  // a loaded image counts even when the grid came out empty
  const blankWithImage = { ...newEditorState({ width: 5, height: 5 }), hasImage: true };
  assert.equal(hasUnsavedWork(blankWithImage, null), true);
});

test('artSize caps the long side at 320, and upscales only tiny sources', () => {
  assert.deepEqual(artSize(640, 320), { width: 320, height: 160 });
  assert.deepEqual(artSize(100, 400), { width: 80, height: 320 });
  assert.deepEqual(artSize(200, 100), { width: 200, height: 100 });
  assert.deepEqual(artSize(640, 320, 160), { width: 160, height: 80 });
  assert.deepEqual(artSize(1000, 1), { width: 320, height: 1 });
});

test('artSize scales pixel art up in whole steps to about 160px', () => {
  assert.deepEqual(artSize(5, 5), { width: 160, height: 160 });
  assert.deepEqual(artSize(25, 20), { width: 150, height: 120 });
  assert.deepEqual(artSize(10, 10, 80), { width: 80, height: 80 });
});

test('tileCropRect gives each tile its own slice of the crop', () => {
  const crop = { x: 10, y: 20, w: 300, h: 200 };
  assert.deepEqual(tileCropRect(crop, 1, 1, 0, 0), crop);
  assert.deepEqual(tileCropRect(crop, 2, 3, 0, 0), { x: 10, y: 20, w: 100, h: 100 });
  assert.deepEqual(tileCropRect(crop, 2, 3, 1, 2), { x: 210, y: 120, w: 100, h: 100 });
  // slices tile the crop exactly, even when it does not divide evenly
  const odd = { x: 0, y: 0, w: 10, h: 7 };
  const widths = [0, 1, 2].map((c) => tileCropRect(odd, 1, 3, 0, c));
  assert.equal(
    widths.reduce((s, r) => s + r.w, 0),
    10,
  );
  assert.equal(widths[2].x + widths[2].w, 10);
});

test('pickArt retries smaller and drops art that never fits', () => {
  const tries = [];
  const url = (n) => ART_PREFIX + 'A'.repeat(n);
  const fits = pickArt((side, q) => {
    tries.push([side, q]);
    return tries.length < 3 ? url(MAX_ART_CHARS) : url(1000);
  });
  assert.equal(fits, url(1000));
  assert.equal(tries.length, 3);
  assert.deepEqual(tries[0], [320, 0.8]);
  assert.ok(tries[2][0] < 320 || tries[2][1] < 0.8, 'later attempts are smaller or lower quality');
  // never fits, or an encoder that gives up: no art
  assert.equal(
    pickArt(() => url(MAX_ART_CHARS)),
    undefined,
  );
  assert.equal(
    pickArt(() => 'data:image/png;base64,AAAA'),
    undefined,
  );
});

test('buildPuzzleRecord carries art only when there is one, and it validates', async () => {
  const grid = [
    [1, 0],
    [0, 1],
  ];
  const report = { status: 'unique-line-solvable', sweeps: 1 };
  assert.equal('art' in buildPuzzleRecord(grid, 't', report), false);
  const art = ART_PREFIX + 'AAAA';
  const p = buildPuzzleRecord(grid, 't', report, art);
  const bare = buildPuzzleRecord(grid, 't', report);
  assert.equal(p.art, art);
  assert.equal(await puzzleId(p), await puzzleId(bare), 'art is not part of the id');
  p.id = await puzzleId(p);
  assert.equal(validatePuzzle(p).ok, true);
});

test('withArts adds each tile its own art and leaves others alone', () => {
  const puzzles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const out = withArts(puzzles, ['x', undefined, 'z']);
  assert.deepEqual(out, [{ id: 'a', art: 'x' }, { id: 'b' }, { id: 'c', art: 'z' }]);
  assert.equal('art' in puzzles[0], false, 'input is not mutated');
});

test('narrowCellSize fits the grid to the width, with a 12px floor and a 24px ceiling', () => {
  // 343px column, 15 cells, 3 clue columns of 22px: (343 - 66 - 20) / 15 = 17
  assert.equal(narrowCellSize(343, 15, 3), 17);
  assert.equal(narrowCellSize(343, 5, 0), 24, 'small grids stay at the normal size');
  assert.equal(narrowCellSize(343, 25, 7), 12, 'large grids stop at 12 and scroll');
});

test('existingPuzzle finds a stored grid by id', () => {
  const records = new Map([['nng:puzzle:abc', JSON.stringify({ id: 'abc', title: 'Banana' })]]);
  const storage = {
    getItem: (k) => records.get(k) ?? null,
    setItem: (k, v) => records.set(k, v),
    removeItem: (k) => records.delete(k),
    key: (i) => [...records.keys()][i] ?? null,
    get length() {
      return records.size;
    },
  };
  const store = createStore(storage);
  assert.equal(existingPuzzle(store, 'abc'), 'Banana');
  assert.equal(existingPuzzle(store, 'nope'), null);
});

test('hasFilledCell is false for a blank grid and true once a cell is filled', () => {
  const g = blankGrid(5, 5);
  assert.equal(hasFilledCell(g), false);
  g[2][3] = 1;
  assert.equal(hasFilledCell(g), true);
});
