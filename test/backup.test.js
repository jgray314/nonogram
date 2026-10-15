import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, planImport } from '../src/backup.js';
import { puzzleId, idMatches } from '../src/format.js';

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
const save = (puzzleId) => ({
  puzzleId,
  cells: [
    [1, 0],
    [-1, 0],
  ],
  elapsedMs: 10,
  rules: {},
  solvedAt: null,
});
const set = { v: 1, setId: 's1', title: 'S', rows: 1, cols: 2, tileIds: ['a', 'b'] };
const none = { puzzles: [], saves: [], sets: [] };

test('backup round-trip restores all kinds', () => {
  const data = {
    puzzles: [puzzle('a', { set: { id: 's1', row: 0, col: 0 } }), puzzle('b')],
    saves: [save('a')],
    sets: [set],
  };
  const text = buildBackup(data);
  assert.equal(JSON.parse(text).kind, 'nng-backup');
  assert.equal(JSON.parse(text).v, 1);
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.puzzles, data.puzzles);
  assert.deepEqual(parsed.saves, data.saves);
  assert.deepEqual(parsed.sets, data.sets);
  assert.deepEqual(parsed.skipped, []);
  const plan = planImport(parsed, none);
  assert.equal(plan.length, 4);
  assert.deepEqual(plan.map((w) => w.kind).sort(), ['puzzle', 'puzzle', 'save', 'set']);
});

test('import writes puzzles and sets before saves', () => {
  const parsed = parseBackup(
    buildBackup({ puzzles: [puzzle('a')], saves: [save('a')], sets: [set] }),
  );
  const kinds = planImport(parsed, none).map((w) => w.kind);
  assert.equal(kinds.at(-1), 'save');
  assert.ok(kinds.indexOf('puzzle') < kinds.indexOf('set'));
});

test('import skips existing ids', () => {
  const parsed = parseBackup(
    buildBackup({
      puzzles: [puzzle('a'), puzzle('b')],
      saves: [save('a'), save('b')],
      sets: [set],
    }),
  );
  const plan = planImport(parsed, {
    puzzles: new Set(['a']),
    saves: ['a'],
    sets: ['s1'],
  });
  assert.deepEqual(
    plan.map((w) => `${w.kind}:${w.record.id ?? w.record.puzzleId ?? w.record.setId}`).sort(),
    ['puzzle:b', 'save:b'],
  );
});

test('import reports and skips invalid records', () => {
  const bad = { ...puzzle('bad'), width: 3 };
  const text = JSON.stringify({
    kind: 'nng-backup',
    v: 1,
    puzzles: [puzzle('a'), bad, 'junk'],
    saves: [save('a'), { ...save('a'), cells: [[9]] }, save('ghost')],
    sets: [set, { v: 1, setId: 'x' }],
  });
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.puzzles.length, 1);
  assert.equal(parsed.saves.length, 1);
  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.skipped.length, 5);
  assert.deepEqual(parsed.skipped.map((s) => s.kind).sort(), [
    'puzzle',
    'puzzle',
    'save',
    'save',
    'set',
  ]);
});

test('save validates against a puzzle already in the store', () => {
  const text = buildBackup({ puzzles: [], saves: [save('a')], sets: [] });
  assert.equal(parseBackup(text).saves.length, 0);
  const parsed = parseBackup(text, (id) => (id === 'a' ? puzzle('a') : null));
  assert.equal(parsed.saves.length, 1);
});

test('parseBackup never throws on bad input', () => {
  const bads = ['', 'not json', '[]', 'null', '{"kind":"other"}', '{"kind":"nng-backup","v":2}'];
  for (const text of bads) {
    const parsed = parseBackup(text);
    assert.equal(parsed.ok, false, text);
    assert.equal(typeof parsed.error, 'string');
  }
  assert.equal(parseBackup(undefined).ok, false);
  const missing = parseBackup('{"kind":"nng-backup","v":1}');
  assert.equal(missing.ok, true);
  assert.deepEqual(missing.puzzles, []);
});

test('backup import drops unknown keys', async () => {
  const p = puzzle('');
  p.id = await puzzleId(p);
  const text = buildBackup({
    puzzles: [{ ...p, junk: 1 }],
    saves: [{ ...save(p.id), note: 'x' }],
    sets: [{ ...set, extra: true }],
  });
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.puzzles, [p]);
  assert.deepEqual(parsed.saves, [save(p.id)]);
  assert.deepEqual(parsed.sets, [set]);
  assert.equal(await idMatches(parsed.puzzles[0]), true);
});
