// Pins the format.js split (docs/plans/line-cap-300.md, lane 1b): each name is
// defined in its new file and no longer in format.js, format.js re-exports both
// new files, and the two new files never import format.js (decision 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, reExports, namedReExports, importsFrom } from './helpers/split.js';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const format = read('format.js');
const keys = read('format-keys.js');
const art = read('format-art.js');

const KEY_NAMES = [
  'MAX_SET_SIDE',
  'MAX_GRID_SIDE',
  'MAX_PALETTE',
  'ART_PREFIX',
  'MAX_ART_CHARS',
  'MAX_TITLE_CHARS',
  'MAX_NAME_CHARS',
  'MAX_SET_ID_CHARS',
  'MAX_SWEEPS',
  'MAX_ID_CHARS',
  'MAX_ART_SIDE',
  'PUZZLE_KEYS',
  'SAVE_KEYS',
  'SET_KEYS',
  'PALETTE_ENTRY_KEYS',
  'PUZZLE_SET_KEYS',
  'RULES_KEYS',
  'pickKeys',
  'pickKnown',
];
const ART_NAMES = ['jpegSize', 'boundArt'];
const STAY = [
  'canonical',
  'puzzleId',
  'idMatches',
  'validatePuzzle',
  'validateSave',
  'validateSet',
  'toJSON',
  'fromJSON',
];

test('format-keys.js defines the limits and key lists, format.js no longer does', () => {
  for (const name of KEY_NAMES) {
    assert.ok(definesFunction(keys, name), `${name} in format-keys.js`);
    assert.ok(!definesFunction(format, name), `${name} not in format.js`);
  }
});

test('format-art.js defines the JPEG helpers, format.js no longer does', () => {
  for (const name of ART_NAMES) {
    assert.ok(definesFunction(art, name), `${name} in format-art.js`);
    assert.ok(!definesFunction(format, name), `${name} not in format.js`);
  }
});

test('format.js keeps the validators and id functions', () => {
  for (const name of STAY) assert.ok(definesFunction(format, name), `${name} in format.js`);
});

test('format.js re-exports both new files with export *', () => {
  assert.ok(reExports(format, './format-keys.js'));
  assert.ok(reExports(format, './format-art.js'));
  assert.equal(namedReExports(format, './format-keys.js'), null);
});

test('format.js imports the limits it uses from format-keys.js', () => {
  assert.ok(importsFrom(format, './format-keys.js'));
});

test('format-art.js imports format-keys.js', () => {
  assert.ok(importsFrom(art, './format-keys.js'));
});

test('the new files never import format.js; format-keys.js imports nothing here', () => {
  assert.ok(!importsFrom(keys, './format.js'));
  assert.ok(!importsFrom(art, './format.js'));
  assert.ok(!importsFrom(keys, './format-art.js'));
  assert.ok(!importsFrom(keys, './format-keys.js'));
});
