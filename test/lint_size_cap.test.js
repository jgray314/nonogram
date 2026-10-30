// Pins the file-size cap: no file under src/ is longer than 300 lines, and an
// inline eslint-disable comment cannot switch the cap off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const MAX = 300;
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(lineCount, filePath, head = '') {
  const body = Array.from({ length: lineCount - (head ? 1 : 0) }, (_, i) => `// line ${i}\n`);
  const [result] = await eslint.lintText(head + body.join(''), { filePath });
  return result.messages.map((m) => m.ruleId);
}

for (const filePath of [
  'src/views/create/x.js',
  'src/views/play/x.js',
  'src/color.js',
  'src/views/library.js',
  'src/views/x.mjs',
  'src/x.js',
]) {
  test(`${MAX + 1} lines at ${filePath} is max-lines`, async () => {
    const ids = await ruleIds(MAX + 1, filePath);
    assert.ok(ids.includes('max-lines'), String(ids));
  });
}

test(`${MAX} lines passes`, async () => {
  const ids = await ruleIds(MAX, 'src/views/create/x.js');
  assert.ok(!ids.includes('max-lines'), String(ids));
});

test('an eslint-disable comment cannot switch the cap off', async () => {
  const ids = await ruleIds(MAX + 1, 'src/views/play/x.js', '/* eslint-disable max-lines */\n');
  assert.ok(ids.includes('max-lines'), String(ids));
});

test('the cap is scoped to src/ (tests and scripts may be longer)', async () => {
  const ids = await ruleIds(MAX + 1, 'test/x.js');
  assert.ok(!ids.includes('max-lines'), String(ids));
});

test('blank lines count: the cap has no skipBlankLines exemption', async () => {
  const blanks = '\n'.repeat(MAX + 1);
  const [result] = await eslint.lintText(blanks, { filePath: 'src/views/x.js' });
  assert.ok(
    result.messages.some((m) => m.ruleId === 'max-lines'),
    JSON.stringify(result.messages.map((m) => m.ruleId)),
  );
});
