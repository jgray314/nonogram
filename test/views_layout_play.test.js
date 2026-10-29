// Pins the play view's module layout (view-split plan, step 1c): the files exist,
// the old single file is gone, and each module exports what the other lanes rely on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = new URL('../src/views/play/', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, dir));

const FILES = [
  'build.js',
  'hud.js',
  'persist.js',
  'rules-layout.js',
  'session.js',
  'util.js',
  'index.js',
  'context.js',
];

for (const f of FILES) {
  test(`src/views/play/${f} exists`, () => {
    assert.ok(existsSync(path(f)), `missing ${f}`);
  });
}

test('the old single-file view is gone', () => {
  assert.equal(existsSync(fileURLToPath(new URL('../src/views/play.js', import.meta.url))), false);
});

// Every module loads in Node (browser globals are only touched inside functions),
// so exports are checked on the real module objects.
const EXPORTS = {
  'build.js': ['buildView'],
  'hud.js': ['createHud'],
  'persist.js': ['createPersist'],
  'rules-layout.js': ['createRulesLayout'],
  'session.js': ['createSession'],
  'util.js': ['reveal', 'sameGrid'],
  'index.js': ['mount', 'unmount'],
};

for (const [file, names] of Object.entries(EXPORTS)) {
  test(`${file} exports ${names.join(', ')}`, async () => {
    assert.ok(existsSync(path(file)), `missing ${file}`);
    const mod = await import(pathToFileURL(path(file)).href);
    for (const n of names) assert.equal(typeof mod[n], 'function', `${file} lacks ${n}`);
  });
}

test('index.js exports exactly mount and unmount', async () => {
  const mod = await import(pathToFileURL(path('index.js')).href);
  assert.deepEqual(Object.keys(mod).sort(), ['mount', 'unmount']);
});

test('index.js wires the four module slots, in order', () => {
  const src = readFileSync(path('index.js'), 'utf8');
  const slots = [
    ['hud', 'createHud'],
    ['persist', 'createPersist'],
    ['rulesLayout', 'createRulesLayout'],
    ['session', 'createSession'],
  ];
  let last = -1;
  for (const [slot, factory] of slots) {
    const at = src.indexOf(`ctx.${slot} = ${factory}(ctx);`);
    assert.ok(at > last, `ctx.${slot} = ${factory}(ctx); missing or out of order`);
    last = at;
  }
});
