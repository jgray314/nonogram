// Pins the storage lint rules: only src/store.js may touch web storage, and
// inline eslint-disable comments cannot switch the rules off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(text, filePath) {
  const [result] = await eslint.lintText(text, { filePath });
  return result.messages.map((m) => m.ruleId);
}

for (const name of ['localStorage', 'sessionStorage']) {
  test(`bare ${name} in a view is no-restricted-globals`, async () => {
    const ids = await ruleIds(`${name}.getItem('x');\n`, 'src/views/x.js');
    assert.ok(ids.includes('no-restricted-globals'), String(ids));
  });

  for (const owner of ['globalThis', 'window']) {
    test(`${owner}.${name} in a view is no-restricted-properties`, async () => {
      const ids = await ruleIds(`${owner}.${name}.getItem('x');\n`, 'src/views/x.js');
      assert.ok(ids.includes('no-restricted-properties'), String(ids));
    });
  }
}

test('src/store.js may use storage but keeps the innerHTML ban', async () => {
  const storage = [
    `export const a = globalThis.localStorage;\n`,
    `export const b = window.sessionStorage;\n`,
    `localStorage.getItem('x');\n`,
  ].join('');
  const ids = await ruleIds(storage, 'src/store.js');
  assert.deepEqual(ids, [], String(ids));
  const html = await ruleIds(`el.innerHTML = 'x';\n`, 'src/store.js');
  assert.ok(html.includes('no-restricted-properties'), String(html));
});

test('an eslint-disable comment cannot switch the storage rules off', async () => {
  const head = '/* eslint-disable no-restricted-globals, no-restricted-properties */\n';
  const ids = await ruleIds(`${head}localStorage.getItem('x');\n`, 'src/views/x.js');
  assert.ok(ids.includes('no-restricted-globals'), String(ids));
});

test('storage outside src/ is not flagged by these rules', async () => {
  const ids = await ruleIds(`localStorage.getItem('x');\nglobalThis.localStorage;\n`, 'test/x.js');
  assert.ok(!ids.includes('no-restricted-globals'), String(ids));
  assert.ok(!ids.includes('no-restricted-properties'), String(ids));
});

test('innerHTML in a view is still no-restricted-properties', async () => {
  const ids = await ruleIds(`el.innerHTML = 'x';\n`, 'src/views/x.js');
  assert.ok(ids.includes('no-restricted-properties'), String(ids));
});

// Aliases and other owners of the storage property: caught by the syntax selector.
for (const text of [
  `self.localStorage.getItem('x');`,
  `const w = window;\nw.localStorage.getItem('x');`,
  `document.defaultView.sessionStorage.clear();`,
  `top.localStorage.getItem('x');`,
  `window['localStorage'].getItem('x');`,
]) {
  test(`storage through ${text.split('\n').pop().slice(0, 28)} is no-restricted-syntax or -properties`, async () => {
    const ids = await ruleIds(`${text}\n`, 'src/views/x.js');
    assert.ok(
      ids.includes('no-restricted-syntax') || ids.includes('no-restricted-properties'),
      String(ids),
    );
  });
}

test('only src/store.js is the storage module, not any file named store.js', async () => {
  const ids = await ruleIds(`export const a = globalThis.localStorage;\n`, 'src/views/store.js');
  assert.ok(ids.includes('no-restricted-properties'), String(ids));
});

test('the storage rules cover .mjs and .cjs files under src/ too', async () => {
  const ids = await ruleIds(`localStorage.getItem('x');\n`, 'src/views/x.mjs');
  assert.ok(ids.includes('no-restricted-globals'), String(ids));
});
