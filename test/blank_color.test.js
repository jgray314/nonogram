// D29: a color puzzle's blank (background) color, stored and drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleId, validatePuzzle, pickKnown, PUZZLE_KEYS } from '../src/format.js';
import { PUZZLE_KEYS as LIBRARY_PUZZLE_KEYS } from '../src/library-logic.js';
import { blankStyle } from '../src/views/grid.js';
import { buildPuzzleRecord, newEditorState } from '../src/create-logic.js';
import { makeSet } from '../src/tiles.js';
import { colorSamplePuzzles } from '../src/samples.js';
import { rgbToLab, deltaE, MERGE_DE } from '../src/color.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const colorPuzzle = () => ({
  v: 1,
  id: '',
  title: 'Sky',
  width: 2,
  height: 1,
  palette: [
    { name: 'color-1', hex: '#c8282d' },
    { name: 'color-2', hex: '#f0e6d2' },
  ],
  solution: [[1, 2]],
  verdict: null,
});

test('blank is a known puzzle key in the format and the library lists', () => {
  assert.ok(PUZZLE_KEYS.includes('blank'));
  assert.ok(LIBRARY_PUZZLE_KEYS.includes('blank'));
  const picked = pickKnown('puzzle', { ...colorPuzzle(), blank: '#102040' });
  assert.equal(picked.blank, '#102040');
});

test('validatePuzzle accepts a #rrggbb blank and rejects anything else', () => {
  const p = { ...colorPuzzle(), id: 'x' };
  assert.equal(validatePuzzle(p).ok, true, 'absent');
  assert.equal(validatePuzzle({ ...p, blank: '#102040' }).ok, true);
  assert.equal(validatePuzzle({ ...p, blank: '#ABCDEF' }).ok, true);
  for (const bad of ['#fff', '102040', '#10204g', '#102040;x', 7, null, '']) {
    assert.equal(validatePuzzle({ ...p, blank: bad }).ok, false, JSON.stringify(bad));
  }
});

test('blank is display-only: it is not part of the id hash, like art', async () => {
  const a = colorPuzzle();
  const b = { ...colorPuzzle(), blank: '#102040' };
  assert.equal(await puzzleId(a), await puzzleId(b));
});

test('blankStyle: none without a valid blank; white cross on dark, black on light', () => {
  assert.equal(blankStyle(null), null);
  assert.equal(blankStyle(undefined), null);
  assert.equal(blankStyle('navy'), null);
  assert.deepEqual(blankStyle('#1f2f4f'), { '--blank': '#1f2f4f', '--blank-cross': '#ffffff' });
  assert.deepEqual(blankStyle('#cde8f6'), { '--blank': '#cde8f6', '--blank-cross': '#000000' });
});

test('Create keeps the blank: editor state starts without one, records and tile sets carry it', async () => {
  assert.equal(newEditorState().blank, null);
  const report = { status: 'unique-line-solvable', sweeps: 1 };
  const palette = colorPuzzle().palette;
  const rec = buildPuzzleRecord([[1, 2]], 't', report, undefined, palette, '#1f2f4f');
  assert.equal(rec.blank, '#1f2f4f');
  rec.id = await puzzleId(rec);
  assert.equal(validatePuzzle(rec).ok, true);
  assert.equal('blank' in buildPuzzleRecord([[1, 2]], 't', report, undefined, palette), false);
  const tiles = [[[[1, 0]], [[0, 2]]]];
  const withBlank = await makeSet({ title: 'S', tiles, palette, blank: '#1f2f4f' });
  const without = await makeSet({ title: 'S', tiles, palette });
  assert.ok(withBlank.puzzles.every((p) => p.blank === '#1f2f4f'));
  assert.ok(without.puzzles.every((p) => !('blank' in p)));
  assert.deepEqual(
    withBlank.puzzles.map((p) => p.id),
    without.puzzles.map((p) => p.id),
  );
});

test('each color sample has a blank at least MERGE_DE from every ink, and a dark one has a white cross', async () => {
  const samples = await colorSamplePuzzles();
  for (const p of samples) {
    assert.match(p.blank ?? '', /^#[0-9a-f]{6}$/, `${p.title} has no blank`);
    const lab = rgbToLab(rgb(p.blank));
    for (const ink of p.palette) {
      const d = deltaE(lab, rgbToLab(rgb(ink.hex)));
      assert.ok(d >= MERGE_DE, `${p.title}: ${ink.name} is ${d.toFixed(1)} from the blank`);
    }
  }
  assert.ok(
    samples.some((p) => blankStyle(p.blank)?.['--blank-cross'] === '#ffffff'),
    'no sample shows the white cross',
  );
});
