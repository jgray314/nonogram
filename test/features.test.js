import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES,
  hashPath,
  parseFeatureParam,
  isEnabled,
  applyFeatureParam,
} from '../src/features.js';
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

test('parseFeatureParam reads the features list after the ?', () => {
  assert.deepEqual(parseFeatureParam('#/library?features=color'), { set: ['color'] });
  assert.deepEqual(parseFeatureParam('#/play/abc?features=color,color'), { set: ['color'] });
});

test('parseFeatureParam: only none clears; no param, an empty value or only unknown names change nothing', () => {
  assert.deepEqual(parseFeatureParam('#/library?features=none'), { set: [] });
  assert.deepEqual(parseFeatureParam('#/library?features=none,bogus'), { set: [] });
  assert.deepEqual(parseFeatureParam('#/library'), { set: null });
  assert.deepEqual(parseFeatureParam('#/library?other=1'), { set: null });
  assert.deepEqual(parseFeatureParam('#/library?features='), { set: null });
  assert.deepEqual(parseFeatureParam('#/library?features=colour'), { set: null });
});

test('parseFeatureParam: a mixed list keeps the known names', () => {
  assert.deepEqual(parseFeatureParam('#/library?features=bogus,color'), { set: ['color'] });
});

test('isEnabled is false unless the pref is literally true', () => {
  const store = createStore(memoryStorage());
  assert.equal(isEnabled(store, 'color'), false);
  for (const v of [1, 'true', 'yes', {}, null]) {
    store.setPref('feature.color', v);
    assert.equal(isEnabled(store, 'color'), false);
  }
  store.setPref('feature.color', true);
  assert.equal(isEnabled(store, 'color'), true);
});

test('applyFeatureParam sets, ignores typos and clears', () => {
  const store = createStore(memoryStorage());
  applyFeatureParam(store, '#/library');
  assert.equal(isEnabled(store, 'color'), false);
  applyFeatureParam(store, '#/library?features=color');
  assert.equal(isEnabled(store, 'color'), true);
  applyFeatureParam(store, '#/create'); // no param: leaves the choice alone
  assert.equal(isEnabled(store, 'color'), true);
  applyFeatureParam(store, '#/library?features=colour'); // typo: leaves the choice alone
  assert.equal(isEnabled(store, 'color'), true);
  applyFeatureParam(store, '#/library?features=');
  assert.equal(isEnabled(store, 'color'), true);
  applyFeatureParam(store, '#/library?features=none');
  assert.equal(isEnabled(store, 'color'), false);
  assert.deepEqual(FEATURES, ['color']);
});

// app.js touches the DOM at import time, so its parse() cannot be imported.
// It routes on hashPath(), which is tested here instead.
test('hashPath drops the query so routes still match', () => {
  assert.equal(hashPath('#/library?features=color'), '#/library');
  assert.equal(hashPath('#/play/abc?features=color'), '#/play/abc');
  assert.equal(hashPath('#/play/abc'), '#/play/abc');
  assert.equal(hashPath(''), '');
});
