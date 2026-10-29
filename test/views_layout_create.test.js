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
  const text = readFileSync(dir + 'index.js', 'utf8');
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
