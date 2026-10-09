import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';

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

const puzzle = (id = 'p1') => ({
  v: 1,
  id,
  title: 'T',
  width: 2,
  height: 2,
  palette: [{ name: 'black', hex: '#000000' }],
  solution: [
    [1, 0],
    [0, 1],
  ],
  verdict: null,
});
const save = (puzzleId = 'p1') => ({
  puzzleId,
  cells: [
    [0, -1],
    [1, 0],
  ],
  elapsedMs: 5,
  rules: {},
  solvedAt: null,
});
const set = (setId = 's1') => ({ v: 1, setId, title: 'S', rows: 1, cols: 2, tileIds: ['a', 'b'] });

test('store round-trip per kind', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const recs = { puzzle: puzzle(), save: save(), set: set() };
  const ids = { puzzle: 'p1', save: 'p1', set: 's1' };
  for (const kind of ['puzzle', 'save', 'set']) {
    assert.equal(store.get(kind, ids[kind]), null);
    store.put(kind, recs[kind]);
    assert.deepEqual(store.get(kind, ids[kind]), recs[kind]);
  }
  assert.ok(storage.getItem('nng:puzzle:p1'));
  assert.ok(storage.getItem('nng:save:p1'));
  assert.ok(storage.getItem('nng:set:s1'));
  assert.deepEqual(store.list('set'), { records: [set()], skipped: 0 });
  store.remove('set', 's1');
  assert.equal(store.get('set', 's1'), null);
});

test('removing a puzzle removes its save', () => {
  const store = createStore(memoryStorage());
  store.put('puzzle', puzzle('p1'));
  store.put('save', save('p1'));
  store.put('puzzle', puzzle('p2'));
  store.put('save', save('p2'));
  store.remove('puzzle', 'p1');
  assert.equal(store.get('puzzle', 'p1'), null);
  assert.equal(store.get('save', 'p1'), null);
  assert.notEqual(store.get('save', 'p2'), null);
});

test('list skips corrupt record', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.put('puzzle', puzzle('p1'));
  storage.setItem('nng:puzzle:bad', '{not json');
  storage.setItem('nng:puzzle:wrong', JSON.stringify({ v: 2 }));
  storage.setItem('other:key', 'ignored');
  assert.equal(store.get('puzzle', 'bad'), null);
  const { records, skipped } = store.list('puzzle');
  assert.deepEqual(
    records.map((r) => r.id),
    ['p1'],
  );
  assert.equal(skipped, 2);
});

test('save listed only when its puzzle is valid', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.put('puzzle', puzzle('p1'));
  store.put('save', save('p1'));
  store.put('save', save('orphan')); // no puzzle
  store.put('save', save('p3'));
  storage.setItem('nng:puzzle:p3', JSON.stringify({ v: 2 })); // invalid puzzle
  const { records, skipped } = store.list('save');
  assert.deepEqual(
    records.map((r) => r.puzzleId),
    ['p1'],
  );
  assert.equal(skipped, 2);
});

test('prefs round-trip and default when missing or corrupt', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  assert.equal(store.getPref('theme', 'auto'), 'auto');
  store.setPref('theme', 'evening');
  assert.equal(store.getPref('theme', 'auto'), 'evening');
  storage.setItem('nng:pref:theme', '{broken');
  assert.equal(store.getPref('theme', 'auto'), 'auto');
  assert.equal(store.list('puzzle').records.length, 0, 'prefs are not records');
});
