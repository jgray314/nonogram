// Lane 0e-1 (docs/plans/line-cap-300.md): closes the real mutation survivors of
// src/create-logic.js recorded in docs/plans/line-cap-300-audit-create-logic.md.
// Expected values are literals or hand-worked arithmetic, never the code's own output.
//
// Survivors accepted in writing (equivalent mutants, no observable change):
//   defaultSize Math.max(5, ...): nearestSize never returns below SIZES[0] = 5.
//   titleFromFile leading trim: the trim after the replace repeats it.
//   centerCrop `>=` to `>`: at equal aspect ratios both branches give one crop.
//   centerCrop Math.min(imgH, ...): in that branch the floor is already <= imgH
//       (asserted below only as a sanity case).
//   loadScale `>` to `>=`: at exactly 1024 the scale is 1 either way.
//   reportView: one audit mutant only reflowed code, no behavior change.
//   artSize `<` to `<=`: at exactly ART_MIN_SIDE the up-step is 1 either way.
//   (artSize Math.max(1, ...) on width is NOT accepted: the 1 x 1000 case below kills it.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  artSize,
  buildPuzzleRecord,
  centerCrop,
  DEFAULT_PALETTE,
  existingPuzzle,
  gridSig,
  hasFilledCell,
  hasUnsavedWork,
  loadScale,
  narrowCellSize,
  newEditorState,
  pickArt,
  reportView,
  tileCropRect,
  titleFromFile,
  withArts,
} from '../src/create-logic.js';

const PREFIX = 'data:image/jpeg;base64,';

// ---- gridSig / hasUnsavedWork ----

test('gridSig is the JSON of tile counts, grid and palette (null when absent)', () => {
  assert.equal(
    gridSig({ tileRows: 1, tileCols: 2, grid: [[0]], palette: undefined }),
    '[1,2,[[0]],null]',
  );
  const pal = [{ name: 'a', hex: '#111111' }];
  assert.equal(
    gridSig({ tileRows: 3, tileCols: 1, grid: [[2]], palette: pal }),
    '[3,1,[[2]],[{"name":"a","hex":"#111111"}]]',
  );
});

test('gridSig changes when only the tile rows or only the tile columns change', () => {
  const base = { tileRows: 1, tileCols: 1, grid: [[1]], palette: null };
  assert.notEqual(gridSig(base), gridSig({ ...base, tileRows: 2 }));
  assert.notEqual(gridSig(base), gridSig({ ...base, tileCols: 2 }));
  assert.notEqual(gridSig({ ...base, tileRows: 2 }), gridSig({ ...base, tileCols: 2 }));
});

test('hasUnsavedWork notices a tile-count change alone', () => {
  const st = { hasImage: false, tileRows: 1, tileCols: 1, grid: [[1]], palette: null };
  const saved = gridSig(st);
  assert.equal(hasUnsavedWork(st, saved), false);
  assert.equal(hasUnsavedWork({ ...st, tileRows: 2 }, saved), true);
  assert.equal(hasUnsavedWork({ ...st, tileCols: 2 }, saved), true);
});

test('hasFilledCell: a colour grid with only ink 2 or higher counts as filled', () => {
  assert.equal(
    hasFilledCell([
      [0, 2],
      [0, 0],
    ]),
    true,
  );
  assert.equal(
    hasFilledCell([
      [0, 0],
      [3, 0],
    ]),
    true,
  );
  assert.equal(
    hasFilledCell([
      [0, 0],
      [0, 0],
    ]),
    false,
  );
  const st = { hasImage: false, tileRows: 1, tileCols: 1, grid: [[0, 2]], palette: null };
  assert.equal(hasUnsavedWork(st, 'never-saved'), true);
});

// ---- existingPuzzle ----

test('existingPuzzle: null when absent, the title when present, empty string when untitled', () => {
  const store = {
    get: (kind, id) =>
      kind === 'puzzle' ? { a: { title: 'Cat' }, b: {}, c: { title: null } }[id] : undefined,
  };
  assert.equal(existingPuzzle(store, 'zzz'), null);
  assert.equal(existingPuzzle(store, 'a'), 'Cat');
  assert.equal(existingPuzzle(store, 'b'), '');
  assert.equal(existingPuzzle(store, 'c'), '');
});

// ---- narrowCellSize ----
// fit = floor((avail - clueCols * 22 - 20) / cols), clamped to 12..24.

test('narrowCellSize: hand-worked values', () => {
  assert.equal(narrowCellSize(360, 15, 4), 16); // (360-88-20)=252 / 15 = 16.8
  assert.equal(narrowCellSize(300, 10, 3), 21); // (300-66-20)=214 / 10 = 21.4
  assert.equal(narrowCellSize(400, 10, 0), 24); // 38 raw, clamped down
  assert.equal(narrowCellSize(200, 20, 5), 12); // negative raw, clamped up
  assert.equal(narrowCellSize(142, 5, 4), 12); // 34/5 = 6.8 -> 12
  assert.equal(narrowCellSize(262, 5, 4), 24); // 154/5 = 30.8 -> 24
  assert.equal(narrowCellSize(220, 5, 4), 22); // 112/5 = 22.4 -> 22
});

// ---- titleFromFile ----

test('titleFromFile collapses runs of spaces, tabs and newlines to one space', () => {
  assert.equal(titleFromFile('my  photo.png'), 'my photo');
  assert.equal(titleFromFile('a\tb\nc.png'), 'a b c');
  assert.equal(titleFromFile('a - _ b.jpg'), 'a b');
});

test('titleFromFile leaves no trailing space when the 60th character is a space', () => {
  const name = 'a'.repeat(59) + ' bbb';
  assert.equal(titleFromFile(name), 'a'.repeat(59));
  assert.equal(titleFromFile('a'.repeat(70)), 'a'.repeat(60));
});

// ---- centerCrop ----

test('centerCrop floors the width when the ratio does not divide evenly (wide image)', () => {
  // 100x51 into 3x2: h = 51, w = floor(51*3/2) = floor(76.5) = 76, x = round(12) = 12.
  assert.deepEqual(centerCrop(100, 51, 3, 2), { x: 12, y: 0, w: 76, h: 51 });
});

test('centerCrop floors the height when the ratio does not divide evenly (tall image)', () => {
  // 51x100 into 2x3: w = 51, h = floor(51*3/2) = 76, y = round(12) = 12.
  assert.deepEqual(centerCrop(51, 100, 2, 3), { x: 0, y: 12, w: 51, h: 76 });
});

test('centerCrop shifts by the offset and clamps inside the image', () => {
  // Tall image: free vertical room is 24 (h 76 in 100), centered at 12.
  assert.deepEqual(centerCrop(51, 100, 2, 3, { dx: 0, dy: 5 }), { x: 0, y: 17, w: 51, h: 76 });
  assert.equal(centerCrop(51, 100, 2, 3, { dx: 0, dy: 50 }).y, 24);
  assert.equal(centerCrop(51, 100, 2, 3, { dx: 0, dy: -50 }).y, 0);
  // A dx on a tall image changes nothing (no horizontal room).
  assert.equal(centerCrop(51, 100, 2, 3, { dx: 9, dy: 0 }).x, 0);
  // Wide image: horizontal room is 24, centered at 12.
  assert.equal(centerCrop(100, 51, 3, 2, { dx: 5, dy: 9 }).x, 17);
  assert.equal(centerCrop(100, 51, 3, 2, { dx: 5, dy: 9 }).y, 0);
  assert.equal(centerCrop(100, 51, 3, 2, { dx: 99, dy: 0 }).x, 24);
  assert.equal(centerCrop(100, 51, 3, 2, { dx: -99, dy: 0 }).x, 0);
});

test('loadScale caps the long side at 1024', () => {
  assert.equal(loadScale(1024, 10), 1);
  assert.equal(loadScale(2048, 10), 0.5);
  assert.equal(loadScale(10, 4096), 0.25);
});

// ---- newEditorState ----

test('newEditorState defaults', () => {
  const st = newEditorState();
  assert.deepEqual(st, {
    width: 15,
    height: 15,
    grid: Array.from({ length: 15 }, () => new Array(15).fill(0)),
    hasImage: false,
    manualEdits: false,
    tileRows: 1,
    tileCols: 1,
    offset: { dx: 0, dy: 0 },
    threshold: 128,
    autoThreshold: true,
    invert: false,
    colors: 0,
    palette: null,
    blank: null,
    brush: 1,
  });
});

test('newEditorState takes a size, builds a fresh grid and offset each call', () => {
  const st = newEditorState({ width: 5, height: 3 });
  assert.equal(st.width, 5);
  assert.equal(st.height, 3);
  assert.equal(st.grid.length, 3);
  assert.deepEqual(st.grid[0], [0, 0, 0, 0, 0]);
  const other = newEditorState({ width: 5, height: 3 });
  assert.notEqual(st.grid, other.grid);
  assert.notEqual(st.offset, other.offset);
});

// ---- reportView ----

const STATUS_TEXT = {
  'unique-line-solvable': 'One solution, solvable by line logic alone.',
  'unique-needs-guessing': 'One solution, but solving needs guessing.',
  multiple: 'More than one solution. Highlighted cells differ between two of them.',
  none: 'No solution fits these clues.',
  unknown: 'Could not decide: the search ran out of budget.',
};

test('reportView text for each of the five statuses', () => {
  for (const [status, text] of Object.entries(STATUS_TEXT)) {
    const result = { status, sweeps: 1, differing: [], unresolved: [] };
    assert.equal(reportView(result).text, text, status);
  }
});

test('reportView: unknown status falls back to the status string; null result is "checking"', () => {
  assert.equal(reportView({ status: 'weird', sweeps: 0 }).text, 'weird');
  assert.deepEqual(reportView(null), { text: 'Checking...', label: 'Unchecked', highlight: [] });
});

test('reportView highlights differing for multiple, unresolved for guessing, nothing else', () => {
  const differing = [
    [1, 2],
    [0, 0],
  ];
  const unresolved = [[3, 3]];
  assert.deepEqual(reportView({ status: 'multiple', sweeps: 1, differing, unresolved }).highlight, [
    [1, 2],
    [0, 0],
  ]);
  assert.deepEqual(
    reportView({ status: 'unique-needs-guessing', sweeps: 1, differing, unresolved }).highlight,
    [[3, 3]],
  );
  assert.deepEqual(
    reportView({ status: 'unique-line-solvable', sweeps: 1, differing, unresolved }).highlight,
    [],
  );
});

test('reportView highlight is a copy: editing it leaves the solver result alone', () => {
  const differing = [[1, 2]];
  const view = reportView({ status: 'multiple', sweeps: 1, differing, unresolved: [] });
  assert.notEqual(view.highlight, differing);
  assert.notEqual(view.highlight[0], differing[0]);
  view.highlight[0][0] = 99;
  view.highlight.push([7, 7]);
  assert.deepEqual(differing, [[1, 2]]);
});

// ---- artSize / tileCropRect ----

test('artSize scales a tiny source up in whole steps, within maxSide', () => {
  assert.deepEqual(artSize(10, 10), { width: 160, height: 160 }); // up = floor(160/10) = 16
  assert.deepEqual(artSize(10, 20), { width: 80, height: 160 }); // up = 8
  // maxSide 100 limits the up-step: floor(min(160, 100) / 30) = 3, not floor(160/30) = 5.
  assert.deepEqual(artSize(30, 30, 100), { width: 90, height: 90 });
});

test('artSize never upscales a source at or past ART_MIN_SIDE and shrinks big ones', () => {
  assert.deepEqual(artSize(200, 100), { width: 200, height: 100 });
  assert.deepEqual(artSize(400, 200), { width: 320, height: 160 });
  assert.deepEqual(artSize(160, 160), { width: 160, height: 160 });
});

test('artSize keeps at least one pixel on the short side', () => {
  assert.deepEqual(artSize(1, 1000), { width: 1, height: 320 });
});

test('tileCropRect rounds the seams of an odd crop width', () => {
  const crop = { x: 0, y: 0, w: 7, h: 7 };
  assert.deepEqual(tileCropRect(crop, 2, 2, 0, 0), { x: 0, y: 0, w: 4, h: 4 }); // 3.5 -> 4
  assert.deepEqual(tileCropRect(crop, 2, 2, 1, 1), { x: 4, y: 4, w: 3, h: 3 });
  // 5 into 3 columns: edges 0, round(1.67)=2, round(3.33)=3, 5.
  const five = { x: 10, y: 0, w: 5, h: 5 };
  assert.deepEqual(
    [0, 1, 2].map((c) => tileCropRect(five, 1, 3, 0, c)),
    [
      { x: 10, y: 0, w: 2, h: 5 },
      { x: 12, y: 0, w: 1, h: 5 },
      { x: 13, y: 0, w: 2, h: 5 },
    ],
  );
});

// ---- pickArt ----

const urlOfLength = (n) => PREFIX + 'A'.repeat(n - PREFIX.length);

test('pickArt tries 320/0.8, 320/0.6, 240/0.6, 160/0.5 in that order, then gives up', () => {
  const calls = [];
  const out = pickArt((side, quality) => {
    calls.push([side, quality]);
    return undefined;
  });
  assert.equal(out, undefined);
  assert.deepEqual(calls, [
    [320, 0.8],
    [320, 0.6],
    [240, 0.6],
    [160, 0.5],
  ]);
});

test('pickArt stops at the first attempt that fits', () => {
  const calls = [];
  const url = PREFIX + 'AAAA';
  const out = pickArt((side, quality) => {
    calls.push([side, quality]);
    return side === 240 ? url : urlOfLength(200001);
  });
  assert.equal(out, url);
  assert.deepEqual(calls, [
    [320, 0.8],
    [320, 0.6],
    [240, 0.6],
  ]);
});

test('pickArt returns the last attempt when only it fits', () => {
  const url = PREFIX + 'BBBB';
  assert.equal(
    pickArt((side, q) => (side === 160 && q === 0.5 ? url : '')),
    url,
  );
});

test('pickArt skips a non-string result instead of throwing or returning it', () => {
  const real = PREFIX + 'CCCC';
  const fake = { startsWith: () => true, length: 5 };
  for (const bad of [undefined, null, 42, fake]) {
    let n = 0;
    assert.equal(
      pickArt(() => (n++ === 0 ? bad : real)),
      real,
    );
  }
});

test('pickArt accepts a url of exactly 200000 characters and rejects 200001', () => {
  const exact = urlOfLength(200000);
  assert.equal(
    pickArt(() => exact),
    exact,
  );
  assert.equal(
    pickArt(() => urlOfLength(200001)),
    undefined,
  );
});

test('pickArt rejects a url without the JPEG data prefix', () => {
  assert.equal(
    pickArt(() => 'data:image/png;base64,AAAA'),
    undefined,
  );
});

// ---- withArts ----

test('withArts returns copies, with art only where there is one', () => {
  const puzzles = [{ id: 'a' }, { id: 'b' }];
  const out = withArts(puzzles, [undefined, PREFIX + 'AA']);
  assert.deepEqual(out, [{ id: 'a' }, { id: 'b', art: PREFIX + 'AA' }]);
  assert.notEqual(out[0], puzzles[0]);
  assert.notEqual(out[1], puzzles[1]);
  assert.equal('art' in puzzles[1], false);
});

// ---- buildPuzzleRecord ----

test('buildPuzzleRecord leaves id empty for the caller to fill', () => {
  const rec = buildPuzzleRecord([[1]], 'T', { status: 'unique-line-solvable', sweeps: 2 });
  assert.equal(rec.id, '');
  assert.deepEqual(rec, {
    v: 1,
    id: '',
    title: 'T',
    width: 1,
    height: 1,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [[1]],
    verdict: { status: 'unique-line-solvable', sweeps: 2 },
  });
});

test('buildPuzzleRecord copies the palette and drops keys that are not name and hex', () => {
  const palette = [
    { name: 'red', hex: '#ff0000', junk: 1 },
    { name: 'blue', hex: '#0000ff', extra: { a: 1 } },
  ];
  const rec = buildPuzzleRecord([[1, 2]], 'T', { status: 'none', sweeps: 0 }, undefined, palette);
  assert.deepEqual(rec.palette, [
    { name: 'red', hex: '#ff0000' },
    { name: 'blue', hex: '#0000ff' },
  ]);
  assert.notEqual(rec.palette, palette);
  assert.notEqual(rec.palette[0], palette[0]);
  rec.palette[0].name = 'changed';
  assert.equal(palette[0].name, 'red');
});

test('buildPuzzleRecord does not hand out the shared default palette', () => {
  const rec = buildPuzzleRecord([[1]], 'T', { status: 'none', sweeps: 0 });
  assert.notEqual(rec.palette, DEFAULT_PALETTE);
  assert.notEqual(rec.palette[0], DEFAULT_PALETTE[0]);
  rec.palette[0].hex = '#ffffff';
  assert.equal(DEFAULT_PALETTE[0].hex, '#000000');
});
