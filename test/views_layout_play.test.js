// Pins the play view's module layout: the files exist, the old single file is gone,
// each module exports what the others rely on, and the functions live in the modules.
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
  const src = code('index.js');
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

// Comments do not count: a wiring line or a function that only appears in a
// comment must not satisfy the checks below.
const code = (file) =>
  readFileSync(path(file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const defines = (text, name) =>
  new RegExp(String.raw`(?:function\s+${name}\b|(?:const|let)\s+${name}\s*=)`).test(text);

/** @type {Record<string, string[]>} */
const FUNCTIONS = {
  'hud.js': ['refresh', 'reduceMotion', 'showStrip', 'clearReveal', 'syncReveal'],
  'persist.js': ['snapshot', 'persist', 'loadSave', 'attachHandlers'],
  'rules-layout.js': ['pickBrush', 'syncMode', 'syncCoarse', 'sizeGrid', 'settle', 'rememberRule'],
  'session.js': [
    'startClock',
    'commit',
    'onPointer',
    'tick',
    'onVisibility',
    'step',
    'restart',
    'onKey',
    'preview',
    'zen',
    'outOfHearts',
    'attachHandlers',
  ],
  'util.js': ['reveal', 'sameGrid'],
};

for (const [file, names] of Object.entries(FUNCTIONS)) {
  test(`${file} defines its functions and index.js no longer does`, () => {
    const mod = code(file);
    const index = code('index.js');
    for (const name of names) {
      assert.ok(defines(mod, name), `${file} must define ${name}`);
      assert.ok(!defines(index, name), `index.js must not define ${name} any more`);
    }
  });
}
