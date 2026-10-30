// Pins the create-logic.js split (docs/plans/line-cap-300.md): each
// moved name is defined in its new file and not in the old one, the old path
// re-exports both new files, and neither new file imports the old path.
// These tests read source text (comments stripped, test/helpers/split.js), so they pin the
// file layout, not behavior; delete one deliberately if its files are merged on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, reExports } from './helpers/split.js';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const old = read('create-logic.js');
const verdict = read('create-verdict.js');
const save = read('create-save-logic.js');

const VERDICT_NAMES = ['STATUS_TEXT', 'verdictOf', 'reportView', 'DEFAULT_PALETTE'];
const SAVE_NAMES = [
  'ART_MAX_SIDE',
  'ART_MIN_SIDE',
  'ART_ATTEMPTS',
  'artSize',
  'tileCropRect',
  'pickArt',
  'withArts',
  'buildPuzzleRecord',
  'canSave',
  'TILE_COUNTS',
  'fullSize',
  'sliceTiles',
  'tileStatusLine',
  'canSaveSet',
  'withVerdicts',
  'setWrites',
  'rollbackTargets',
];

test('create-verdict.js defines its names; create-logic.js does not', () => {
  for (const name of VERDICT_NAMES) {
    assert.ok(definesFunction(verdict, name), `${name} defined in create-verdict.js`);
    assert.ok(!definesFunction(old, name), `${name} not defined in create-logic.js`);
  }
});

test('create-save-logic.js defines its names; create-logic.js does not', () => {
  for (const name of SAVE_NAMES) {
    assert.ok(definesFunction(save, name), `${name} defined in create-save-logic.js`);
    assert.ok(!definesFunction(old, name), `${name} not defined in create-logic.js`);
  }
});

test('create-logic.js re-exports both new files with export *', () => {
  assert.ok(reExports(old, './create-verdict.js'));
  assert.ok(reExports(old, './create-save-logic.js'));
});

test('the new files never import create-logic.js; the leaf imports nothing of the family', () => {
  assert.ok(!importsFrom(verdict, './create-logic.js'));
  assert.ok(!importsFrom(save, './create-logic.js'));
  assert.ok(!reExports(verdict, './create-logic.js') && !reExports(save, './create-logic.js'));
  assert.ok(!importsFrom(verdict, './create-save-logic.js'));
});

test('create-save-logic.js imports verdictOf from the leaf', () => {
  assert.ok(importsFrom(save, './create-verdict.js'));
});
