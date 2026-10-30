// Layout of the color.js split: each name is defined in
// its new file and not in the old one, color.js re-exports by NAMED LISTS (an
// `export *` would add SEED, ITERATIONS, rgbOfHex, mulberry32, d2 and mean),
// and the import graph stays a leaf, siblings, then color.js.
// These tests read source text (comments stripped, test/helpers/split.js), so they pin the
// file layout, not behavior; delete one deliberately if its files are merged on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, namedReExports, reExports } from './helpers/split.js';

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const space = read('color-space.js');
const cells = read('color-cells.js');
const color = read('color.js');

const SPACE = [
  'SEED',
  'ITERATIONS',
  'MERGE_DE',
  'lin',
  'f',
  'rgbToLab',
  'deltaE',
  'hexOf',
  'rgbOfHex',
  'labToRgb',
  'd2',
  'mean',
  'mulberry32',
  'inkColors',
  'inkText',
  'COLOR_COUNTS',
];
const CELLS = ['cellColors', 'kmeans', 'quantizeColors', 'clusterOf', 'cellColorGrid'];
const PIXEL = [
  'SEED_FALLOFF',
  'MAX_PALETTE_PIXELS',
  'sampleStep',
  'pixelAt',
  'binKey',
  'histogram',
  'seeds',
  'weightedKmeans',
  'nearest',
  'pixelColorGrid',
  'colorGrid',
];

test('color-space.js defines the leaf names; the other two files do not', () => {
  for (const n of SPACE) {
    assert.ok(definesFunction(space, n), `${n} in color-space.js`);
    assert.ok(!definesFunction(cells, n), `${n} not in color-cells.js`);
    assert.ok(!definesFunction(color, n), `${n} not in color.js`);
  }
});

test('color-cells.js defines the D25 path; the other two files do not', () => {
  for (const n of CELLS) {
    assert.ok(definesFunction(cells, n), `${n} in color-cells.js`);
    assert.ok(!definesFunction(space, n), `${n} not in color-space.js`);
    assert.ok(!definesFunction(color, n), `${n} not in color.js`);
  }
});

test('color.js keeps the pixel path; the new files do not define it', () => {
  for (const n of PIXEL) {
    assert.ok(definesFunction(color, n), `${n} in color.js`);
    assert.ok(!definesFunction(space, n), `${n} not in color-space.js`);
    assert.ok(!definesFunction(cells, n), `${n} not in color-cells.js`);
  }
});

test('color.js re-exports exactly the old names by named lists', () => {
  assert.ok(!reExports(color, './color-space.js'), 'no export * from color-space');
  assert.ok(!reExports(color, './color-cells.js'), 'no export * from color-cells');
  assert.deepEqual(
    namedReExports(color, './color-space.js'),
    [
      'COLOR_COUNTS',
      'MERGE_DE',
      'deltaE',
      'hexOf',
      'inkColors',
      'inkText',
      'labToRgb',
      'rgbToLab',
    ].sort(),
  );
  assert.deepEqual(
    namedReExports(color, './color-cells.js'),
    ['cellColorGrid', 'cellColors', 'quantizeColors'].sort(),
  );
});

test('import graph: leaf, then siblings, then color.js; nothing imports back', () => {
  assert.ok(!importsFrom(space, './color.js'));
  assert.ok(!importsFrom(space, './color-cells.js'));
  assert.ok(
    !/from\s+'\.\//.test(space.replace(/^\s*\/\/.*$/gm, '')),
    'color-space.js imports nothing relative',
  );
  assert.ok(!importsFrom(cells, './color.js'));
  assert.ok(importsFrom(cells, './color-space.js'));
  assert.ok(importsFrom(cells, './image.js'));
  assert.ok(importsFrom(color, './color-space.js'));
  assert.ok(importsFrom(color, './image.js'));
});
