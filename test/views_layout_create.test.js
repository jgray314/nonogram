// Pins the layout of the create view: the module files under src/views/create/
// and the names each exports. Source-text checks are used (not imports) because
// index.js and its dependencies are browser modules that touch `window` and
// `document` at import time or load browser-only siblings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/views/create/', import.meta.url));
const oldFile = fileURLToPath(new URL('../src/views/create.js', import.meta.url));

/** @type {Record<string, string[]>} */
const modules = {
  'build.js': ['buildView'],
  'image-source.js': ['createImageSource'],
  'crop-preview.js': ['createCropPreview'],
  'grid-view.js': ['createGridView'],
  'report.js': ['createReport'],
  'save.js': ['createSave'],
  'index.js': ['mount', 'unmount'],
  'context.js': [],
};

// Comments do not count: a wiring line or a function that only appears in a
// comment must not satisfy the checks below.
const code = (file) =>
  readFileSync(dir + file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const defines = (text, name) =>
  new RegExp(String.raw`(?:function\s+${name}\b|(?:const|let)\s+${name}\s*=)`).test(text);

/** @type {Record<string, string[]>} */
const functions = {
  'image-source.js': [
    'currentCrop',
    'regenerate',
    'onFile',
    'onSize',
    'onSlider',
    'onReset',
    'onColors',
    'onInvert',
  ],
  'crop-preview.js': ['drawPreview', 'onPreviewDown', 'onPreviewMove', 'onPreviewUp'],
  'grid-view.js': [
    'fitCells',
    'renderGridNow',
    'markTileBoundaries',
    'onGridPointer',
    'syncBrushes',
    'syncHistoryButtons',
    'resetHistory',
    'stepHistory',
    'onKeydown',
  ],
  'report.js': ['showReport', 'scheduleReport'],
  'save.js': ['showSaveMessage', 'artFor', 'onSave', 'saveSingle', 'saveSet'],
};

// index.js keeps one stable listener reference so teardown can remove it; the
// wrapper must only delegate to the module.
const WRAPPERS = new Set(['onKeydown']);
test('index.js keeps onKeydown only as a delegating wrapper', () => {
  assert.match(code('index.js'), /const onKeydown = \(e\) => ctx\.gridView\.onKeydown\(e\);/);
});

for (const [file, names] of Object.entries(functions)) {
  test(`${file} defines its functions and index.js no longer does`, () => {
    const mod = code(file);
    const index = code('index.js');
    for (const name of names) {
      assert.ok(defines(mod, name), `${file} must define ${name}`);
      if (WRAPPERS.has(name)) continue;
      assert.ok(!defines(index, name), `index.js must not define ${name} any more`);
    }
  });
}

test('the old single-file view is gone', () => {
  assert.equal(existsSync(oldFile), false);
});

for (const [file, names] of Object.entries(modules)) {
  test(`src/views/create/${file} exists and exports ${names.join(', ') || 'nothing'}`, () => {
    assert.ok(existsSync(dir + file), `${file} is missing`);
    const text = readFileSync(dir + file, 'utf8');
    for (const name of names) {
      const re = new RegExp(`export (async )?function ${name}\\b`);
      assert.match(text, re, `${file} must export function ${name}`);
    }
  });
}

test('index.js exports exactly mount and unmount', () => {
  const text = readFileSync(dir + 'index.js', 'utf8');
  const exported = [
    ...text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm),
  ].map((m) => m[1]);
  assert.deepEqual(exported.sort(), ['mount', 'unmount']);
  assert.doesNotMatch(text, /^export\s*\{/m);
});

test('index.js builds each module slot on ctx from its factory', () => {
  const text = code('index.js');
  const slots = {
    imageSource: 'createImageSource',
    cropPreview: 'createCropPreview',
    gridView: 'createGridView',
    report: 'createReport',
    save: 'createSave',
  };
  for (const [slot, factory] of Object.entries(slots)) {
    assert.ok(
      text.includes(`ctx.${slot} = ${factory}(ctx);`),
      `missing ctx.${slot} = ${factory}(ctx);`,
    );
  }
});
