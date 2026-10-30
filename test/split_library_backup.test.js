// Layout of the library backup split (line-cap-300, lane 2b): the export and
// import functions live in library-backup.js, library.js imports it with a
// plain import (it exports only mount and unmount), and the new file never
// imports library.js, so redraws go through lib.render().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, reExports, stripComments } from './helpers/split.js';

const read = (f) => readFileSync(new URL(`../src/views/${f}`, import.meta.url), 'utf8');
const backup = read('library-backup.js');
const library = read('library.js');

const MOVED = ['download', 'exportXml', 'exportLibrary', 'importLibrary', 'runImport'];

test('each backup function is defined in library-backup.js and not in library.js', () => {
  for (const n of MOVED) {
    assert.ok(definesFunction(backup, n), `${n} in library-backup.js`);
    assert.ok(!definesFunction(library, n), `${n} not in library.js`);
  }
});

test('deletePuzzle and addSamples stay in library.js', () => {
  for (const n of ['deletePuzzle', 'addSamples']) {
    assert.ok(definesFunction(library, n), `${n} in library.js`);
    assert.ok(!definesFunction(backup, n), `${n} not in library-backup.js`);
  }
});

test('library-backup.js exports importLibrary, exportLibrary and exportXml', () => {
  const text = stripComments(backup);
  for (const n of ['importLibrary', 'exportLibrary', 'exportXml']) {
    assert.ok(new RegExp(String.raw`export\s+(?:async\s+)?function\s+${n}\b`).test(text), n);
  }
});

test('library.js imports library-backup.js plainly; the backup file never imports library.js', () => {
  assert.ok(importsFrom(library, './library-backup.js'), 'library.js imports the backup file');
  assert.ok(!reExports(library, './library-backup.js'), 'plain import, not export *');
  assert.ok(!/export\s*\*/.test(stripComments(library)), 'no export * in library.js');
  assert.ok(!importsFrom(backup, './library.js'), 'no import of library.js');
  assert.ok(importsFrom(backup, './library-state.js'), 'backup reads the shared state');
});

test('library.js defines no runImport and keeps no direct backup machinery', () => {
  const text = stripComments(library);
  assert.ok(!/function\s+runImport\b/.test(text), 'no function runImport');
  for (const n of ['parseBackup', 'planImport', 'buildBackup', 'idMatches']) {
    assert.ok(!new RegExp(String.raw`\b${n}\b`).test(text), `${n} not used in library.js`);
  }
});

test('runImport keeps the store snapshot and reaches render through lib.render()', () => {
  const text = stripComments(backup);
  const body = text.slice(text.indexOf('async function runImport'));
  assert.ok(/const store0 = lib\.store;/.test(body), 'store0 snapshot');
  assert.equal(body.match(/lib\.render\(\)/g)?.length, 2, 'two lib.render() calls');
  assert.ok(
    !/\bstore0\s*=[^=]/.test(body.replace('const store0 = lib.store;', '')),
    'not reassigned',
  );
  assert.ok(
    !/\blib\.store\b/.test(body.replace('const store0 = lib.store;', '')),
    'no later lib.store',
  );
});
