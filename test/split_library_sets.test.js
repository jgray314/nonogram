// Layout of the library tile-set split (line-cap-300, lane 2c): the tile-set
// rendering lives in library-sets.js, library.js reaches it with a plain import
// (it exports only mount and unmount), and library-sets.js never imports
// library.js: deleteSet redraws through lib.render().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, reExports, stripComments } from './helpers/split.js';

const read = (f) => readFileSync(new URL(`../src/views/${f}`, import.meta.url), 'utf8');
const sets = read('library-sets.js');
const library = read('library.js');

const MOVED = ['solutionCanvas', 'tileNode', 'tileBox', 'setNode', 'deleteSet'];

test('each tile-set function is defined in library-sets.js and not in library.js', () => {
  for (const n of MOVED) {
    assert.ok(definesFunction(sets, n), `${n} in library-sets.js`);
    assert.ok(!definesFunction(library, n), `${n} not in library.js`);
  }
});

test('library-sets.js exports setNode, the one name library.js calls', () => {
  assert.ok(/export\s+function\s+setNode\b/.test(stripComments(sets)), 'setNode is exported');
});

test('library.js imports library-sets.js with a plain import, no re-export', () => {
  assert.ok(importsFrom(library, './library-sets.js'));
  assert.ok(!reExports(library, './library-sets.js'));
  assert.ok(!/export\s*\*/.test(stripComments(library)), 'no export * in library.js');
});

test('library-sets.js never imports library.js and takes button from library-state.js', () => {
  assert.ok(!importsFrom(sets, './library.js'), 'no import of library.js');
  assert.ok(importsFrom(sets, './library-state.js'), 'imports library-state.js');
  const text = stripComments(sets);
  assert.ok(
    /import\s*\{[^}]*\bbutton\b[^}]*\}\s*from\s*'\.\/library-state\.js'/.test(text),
    'button comes from library-state.js',
  );
});

test('deleteSet redraws through lib.render(), reading lib live', () => {
  const text = stripComments(sets);
  const body = text.slice(text.indexOf('function deleteSet'));
  const tiles = body.indexOf("lib.store.remove('puzzle'");
  const set = body.indexOf("lib.store.remove('set'");
  const draw = body.indexOf('lib.render()');
  assert.ok(tiles > 0 && set > tiles && draw > set, 'tiles, then set, then lib.render()');
});
