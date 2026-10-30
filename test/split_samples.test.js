// Split of src/samples.js (docs/plans/line-cap-300.md, Wave 1): the sample-art data arrays live in
// src/samples-art.js and the loaders stay in src/samples.js. The checks read source text with
// comments stripped (test/helpers/split.js), so a stub or a commented-out line cannot pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { definesFunction, importsFrom, reExports, stripComments } from './helpers/split.js';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const samples = read('samples.js');
const art = read('samples-art.js');

test('ART and COLOR_ART are defined in samples-art.js and not in samples.js', () => {
  for (const name of ['ART', 'COLOR_ART']) {
    assert.ok(definesFunction(art, name), `${name} defined in samples-art.js`);
    assert.ok(!definesFunction(samples, name), `${name} no longer defined in samples.js`);
  }
});

test('samples-art.js exports ART and COLOR_ART', () => {
  const text = stripComments(art);
  assert.match(text, /^export const ART\s*=/m);
  assert.match(text, /^export const COLOR_ART\s*=/m);
});

test('samples.js imports the arrays from samples-art.js and does not re-export them', () => {
  assert.ok(importsFrom(samples, './samples-art.js'));
  assert.match(
    stripComments(samples),
    /import\s*\{\s*ART\s*,\s*COLOR_ART\s*\}\s*from\s*'\.\/samples-art\.js'/,
  );
  assert.ok(!reExports(samples, './samples-art.js'));
  assert.doesNotMatch(stripComments(samples), /export\s*\{[^}]*\}\s*from\s*'\.\/samples-art\.js'/);
});

test('samples-art.js is a leaf: it imports nothing, and never samples.js', () => {
  assert.ok(!importsFrom(art, './samples.js'));
  assert.doesNotMatch(stripComments(art), /^\s*import\b/m);
});

test('the loaders stay defined in samples.js', () => {
  for (const name of ['sampleRecord', 'samplePuzzles', 'colorSamplePuzzles', 'loadSamples']) {
    assert.ok(definesFunction(samples, name), `${name} defined in samples.js`);
    assert.ok(!definesFunction(art, name), `${name} not defined in samples-art.js`);
  }
});

test('both files stay within the 300-line cap', () => {
  for (const text of [samples, art]) assert.ok(text.split('\n').length <= 301);
});
