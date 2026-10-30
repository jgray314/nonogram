// Layout of the library.js foundation step (line-cap-300, lane 2a): the shared
// `lib` state object and the three helpers that move into the leaf
// library-state.js, the module-level lets that library.js no longer owns, and
// the two empty stubs the next lanes fill. library.js exports only mount and
// unmount, so the new files are plain imports, never `export *`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, reExports, stripComments } from './helpers/split.js';

const read = (f) => readFileSync(new URL(`../src/views/${f}`, import.meta.url), 'utf8');
const state = read('library-state.js');
const library = read('library.js');

test('library-state.js defines lib; library.js does not', () => {
  assert.ok(definesFunction(state, 'lib'), 'lib in library-state.js');
  assert.ok(/export\s+const\s+lib\b/.test(stripComments(state)), 'lib is exported');
  assert.ok(!definesFunction(library, 'lib'), 'lib not in library.js');
});

test('say, forThisMount and button live in library-state.js, not library.js', () => {
  for (const n of ['say', 'forThisMount', 'button']) {
    assert.ok(definesFunction(state, n), `${n} in library-state.js`);
    assert.ok(!definesFunction(library, n), `${n} not in library.js`);
  }
});

test('library.js imports the state file; the state file never imports library.js', () => {
  assert.ok(importsFrom(library, './library-state.js'));
  assert.ok(!importsFrom(state, './library.js'));
  assert.ok(!reExports(library, './library-state.js'), 'plain import, not export *');
  assert.ok(!/export\s*\*/.test(stripComments(library)), 'no export * in library.js');
});

test('library.js keeps no module-level store, status, generation or toolbarButtons', () => {
  const text = stripComments(library);
  for (const n of ['store', 'status', 'generation', 'toolbarButtons']) {
    assert.ok(!new RegExp(String.raw`^(?:let|var|const)\s+${n}\b`, 'm').test(text), n);
  }
});

test('mount assigns lib.render before the first render call', () => {
  const text = stripComments(library);
  const at = text.search(/\blib\.render\s*=\s*render\b/);
  assert.ok(at >= 0, 'lib.render = render');
  const mount = text.indexOf('export function mount');
  assert.ok(at > mount, 'assigned inside mount');
  const call = text.indexOf('render();', mount);
  assert.ok(call > at, 'a render() call follows the assignment');
});

test('unmount clears the lib fields in order and only ever increments generation', () => {
  const text = stripComments(library);
  const body = text.slice(text.indexOf('export function unmount'));
  const order = [
    'lib.generation += 1;',
    'root?.remove();',
    'root = null;',
    'lib.store = null;',
    'lib.status = null;',
    'listEl = null;',
    'lib.toolbarButtons = [];',
  ];
  let at = -1;
  for (const line of order) {
    const next = body.indexOf(line);
    assert.ok(next > at, `${line} present, in order`);
    at = next;
  }
  assert.ok(!/\blib\s*=[^=]/.test(text), 'lib is never reassigned');
  for (const m of text.matchAll(/lib\.generation\s*([-+*/]?=)/g)) {
    assert.equal(m[1], '+=', 'generation is only incremented');
  }
});

test('the sets stub exists and library.js does not import it yet', () => {
  for (const f of ['library-sets.js']) {
    assert.ok(read(f).trim().length > 0, `${f} exists`);
    assert.ok(!importsFrom(library, `./${f}`), `${f} not imported yet`);
  }
});
