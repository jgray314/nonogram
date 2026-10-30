// Layout of the grid.js split, step 1 (line-cap-300, lane 2e): the setup half of
// renderGrid moves to grid-layout.js (a leaf). grid.js re-exports gutterSize and
// blankStyle by NAMED LIST, so buildGrid and div do not join its export set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  definesFunction,
  importsFrom,
  namedReExports,
  reExports,
  stripComments,
} from './helpers/split.js';

const read = (f) => readFileSync(new URL(`../src/views/${f}`, import.meta.url), 'utf8');
const layout = read('grid-layout.js');
const grid = read('grid.js');

const MOVED = ['buildGrid', 'gutterSize', 'blankStyle', 'div'];
const KEPT = ['renderGrid', 'update'];

test('grid-layout.js defines the setup half; grid.js does not', () => {
  for (const n of MOVED) {
    assert.ok(definesFunction(layout, n), `${n} in grid-layout.js`);
    assert.ok(!definesFunction(grid, n), `${n} not in grid.js`);
  }
});

test('grid.js keeps renderGrid, update and destroy; grid-layout.js does not define them', () => {
  for (const n of KEPT) {
    assert.ok(definesFunction(grid, n), `${n} in grid.js`);
    assert.ok(!definesFunction(layout, n), `${n} not in grid-layout.js`);
  }
  // destroy is a method of the returned object, so check its source shape.
  const code = stripComments(grid);
  assert.match(code, /\n\s*destroy\(\)\s*\{[^}]*pointerup[^}]*pointercancel[^}]*root\.remove\(\)/);
  assert.doesNotMatch(stripComments(layout), /destroy|pointerup/);
});

test('grid.js re-exports exactly gutterSize and blankStyle by a named list', () => {
  assert.ok(!reExports(grid, './grid-layout.js'), 'no export * from grid-layout');
  assert.deepEqual(namedReExports(grid, './grid-layout.js'), ['blankStyle', 'gutterSize']);
});

test('import graph: grid-layout.js is a leaf; grid.js imports buildGrid from it', () => {
  assert.ok(importsFrom(grid, './grid-layout.js'), 'grid.js imports grid-layout.js');
  assert.ok(
    /import\s*\{[^}]*\bbuildGrid\b[^}]*\}\s*from\s*'\.\/grid-layout\.js'/.test(grid),
    'grid.js imports buildGrid',
  );
  assert.ok(!importsFrom(layout, './grid.js'), 'grid-layout.js does not import grid.js');
  assert.ok(!importsFrom(layout, './grid-pointer.js'));
});
