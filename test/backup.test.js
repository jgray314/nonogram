import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, planImport, rateImports, ratePlan } from '../src/backup.js';
import { ratePuzzleWith } from '../src/solver-client.js';
import { solveAndRate } from '../src/personas.js';
import { puzzleId, idMatches, ART_PREFIX } from '../src/format.js';
import { jpegHeader } from './jpeg-fixture.js';

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

test('import drops oversized art and keeps the puzzle', () => {
  const big = puzzle('a', { art: jpegHeader(321, 10) });
  const notJpeg = puzzle('b', { art: `${ART_PREFIX}AAAA` });
  const parsed = parseBackup(buildBackup({ puzzles: [big, notJpeg] }));
  assert.equal(parsed.puzzles.length, 2);
  assert.equal(parsed.artDropped, 2);
  for (const p of parsed.puzzles) assert.equal('art' in p, false);
  assert.equal(parsed.puzzles[0].title, 'T a');
});

test('import keeps art within the bound', () => {
  const art = jpegHeader(320, 240);
  const parsed = parseBackup(buildBackup({ puzzles: [puzzle('a', { art })] }));
  assert.equal(parsed.puzzles[0].art, art);
  assert.equal(parsed.artDropped, 0);
});

const fake = async (p) => ({ status: 'multiple', sweeps: p.width });

test('rateImports replaces the stored verdict', async () => {
  const claimed = puzzle('a', { verdict: { status: 'unique-line-solvable', sweeps: 1 } });
  const [out] = await rateImports([claimed], fake);
  assert.deepEqual(out.verdict, { status: 'multiple', sweeps: 2 });
  assert.equal(claimed.verdict.status, 'unique-line-solvable'); // input not mutated
});

test('rateImports keeps every other field', async () => {
  const p = puzzle('a', { set: { id: 's1', row: 0, col: 1 }, art: 'data:image/jpeg;base64,x' });
  const [out] = await rateImports([p, puzzle('b')], fake);
  assert.deepEqual({ ...out, verdict: null }, { ...p, verdict: null });
});

test('ratePlan re-rates puzzles in place and passes other records through', async () => {
  const plan = [
    { kind: 'puzzle', record: puzzle('a') },
    { kind: 'set', record: set },
    { kind: 'save', record: save('a') },
    { kind: 'puzzle', record: puzzle('b') },
  ];
  const out = await ratePlan(plan, fake);
  assert.deepEqual(
    out.map((w) => w.kind),
    ['puzzle', 'set', 'save', 'puzzle'],
  );
  assert.equal(out[0].record.verdict.status, 'multiple');
  assert.equal(out[1].record, set);
  assert.equal(out[3].record.id, 'b');
});

test('a claimed unique verdict on a two-solution grid is re-rated multiple', async () => {
  // 2x2 diagonal: [[1,0],[0,1]] and [[0,1],[1,0]] share the clues, so it is not unique.
  const lie = puzzle('a', {
    verdict: { status: 'unique-line-solvable', sweeps: 1, tier: 'newcomer' },
  });
  const rate = ratePuzzleWith({ solve: async (input) => solveAndRate(input, {}) });
  const [out] = await rateImports([lie], rate);
  assert.equal(out.verdict.status, 'multiple');
  assert.equal('tier' in out.verdict, false);
});
