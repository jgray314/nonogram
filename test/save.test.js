import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeSaveFile, parseSaveFile, importWrites } from '../src/save.js';
import { createStore } from '../src/store.js';
import { jpegHeader } from './jpeg-fixture.js';

const puzzle = {
  v: 1,
  id: 'p1',
  title: 'T',
  width: 2,
  height: 2,
  palette: [{ name: 'Black', hex: '#000000' }],
  solution: [
    [1, 0],
    [0, 1],
  ],
  verdict: null,
};
const save = {
  puzzleId: 'p1',
  cells: [
    [1, -1],
    [0, 0],
  ],
  elapsedMs: 1234,
  rules: { check: false, hint: false, autoCross: true },
  solvedAt: null,
};

function memoryStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('save serialize round-trip', () => {
  const text = serializeSaveFile(puzzle, save);
  assert.equal(JSON.parse(text).kind, 'nng-save');
  const out = parseSaveFile(text);
  assert.equal(out.ok, true);
  assert.deepEqual(out.puzzle, puzzle);
  assert.deepEqual(out.save, save);
});

test("import rejects save whose cells don't fit the puzzle", () => {
  const bad = { ...save, cells: [[1, 0, 0]] };
  const out = parseSaveFile(serializeSaveFile(puzzle, bad));
  assert.equal(out.ok, false);
  assert.match(out.error, /cells/);
  const other = parseSaveFile(serializeSaveFile(puzzle, { ...save, puzzleId: 'other' }));
  assert.equal(other.ok, false);
});

test('import rejects malformed file', () => {
  for (const text of [
    '',
    'not json',
    'null',
    '[]',
    '{}',
    JSON.stringify({ kind: 'other', v: 1, puzzle, save }),
    JSON.stringify({ kind: 'nng-save', v: 2, puzzle, save }),
    JSON.stringify({ kind: 'nng-save', v: 1, puzzle: { v: 1 }, save }),
    JSON.stringify({ kind: 'nng-save', v: 1, puzzle }),
  ]) {
    const out = parseSaveFile(text);
    assert.equal(out.ok, false, text);
    assert.equal(typeof out.error, 'string');
  }
  assert.equal(parseSaveFile(undefined).ok, false);
});

test('import adds missing puzzle', () => {
  const store = createStore(memoryStorage());
  const parsed = parseSaveFile(serializeSaveFile(puzzle, save));
  let writes = importWrites(parsed, store);
  assert.deepEqual(
    writes.map((w) => w.kind),
    ['puzzle', 'save'],
  );
  for (const w of writes) store.put(w.kind, w.record);
  assert.deepEqual(store.get('puzzle', 'p1'), puzzle);
  // Puzzle now present: only the save is written, and the stored puzzle is kept.
  writes = importWrites(parsed, store);
  assert.deepEqual(
    writes.map((w) => w.kind),
    ['save'],
  );
});

test('save file import drops unknown keys', () => {
  const out = parseSaveFile(
    serializeSaveFile({ ...puzzle, junk: 1 }, { ...save, note: 'x', hearts: 2 }),
  );
  assert.equal(out.ok, true);
  assert.deepEqual(out.puzzle, puzzle);
  assert.deepEqual(out.save, { ...save, hearts: 2 });
});

test('save file import drops oversized art and keeps the puzzle', () => {
  const big = { ...puzzle, art: jpegHeader(900, 900) };
  const out = parseSaveFile(serializeSaveFile(big, save));
  assert.equal(out.ok, true);
  assert.equal('art' in out.puzzle, false);
  assert.equal(out.artDropped, 1);
  const ok = { ...puzzle, art: jpegHeader(300, 300) };
  const kept = parseSaveFile(serializeSaveFile(ok, save));
  assert.equal(kept.puzzle.art, ok.art);
  assert.equal(kept.artDropped, 0);
});
