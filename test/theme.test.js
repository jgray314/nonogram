import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, contrastRatio, resolveTheme, nextPref } from '../src/theme.js';

const NAMES = ['day', 'evening'];

test('theme contrast: clue text and fills meet 4.5:1 against background', () => {
  for (const name of NAMES) {
    const t = THEMES[name];
    const pairs = [
      ['--clue-text', '--bg'],
      ['--clue-text', '--panel'],
      ['--cell-filled', '--cell-unknown'],
      ['--ink', '--bg'],
      ['--ink', '--panel'],
      ['--accent', '--panel'],
    ];
    for (const [a, b] of pairs) {
      const ratio = contrastRatio(t[a], t[b]);
      assert.ok(ratio >= 4.5, `${name}: ${a} vs ${b} is ${ratio.toFixed(2)}`);
    }
  }
});

test('crossed and wrong marks distinguishable', () => {
  for (const name of NAMES) {
    const t = THEMES[name];
    for (const mark of ['--cell-cross', '--cell-wrong']) {
      const ratio = contrastRatio(t[mark], t['--cell-unknown']);
      assert.ok(ratio >= 3, `${name}: ${mark} vs unknown is ${ratio.toFixed(2)}`);
    }
  }
});

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  assert.ok(Math.abs(contrastRatio('#777', '#fff') - 4.48) < 0.01);
});

test('resolveTheme follows system when auto', () => {
  assert.equal(resolveTheme('auto', true), 'evening');
  assert.equal(resolveTheme('auto', false), 'day');
  assert.equal(resolveTheme('day', true), 'day');
  assert.equal(resolveTheme('evening', false), 'evening');
  assert.equal(resolveTheme('garbage', true), 'evening');
});

test('nextPref cycles auto, day, evening', () => {
  assert.equal(nextPref('auto'), 'day');
  assert.equal(nextPref('day'), 'evening');
  assert.equal(nextPref('evening'), 'auto');
  assert.equal(nextPref('garbage'), 'day');
});

test('both themes define the same tokens', () => {
  assert.deepEqual(Object.keys(THEMES.evening).sort(), Object.keys(THEMES.day).sort());
});

test('base.css day fallback matches theme.js', () => {
  const css = readFileSync(new URL('../css/base.css', import.meta.url), 'utf8');
  const root = css.match(/:root\s*{([^}]*)}/)[1];
  const props = {};
  for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) props[m[1]] = m[2].trim();
  const layout = [
    '--cell',
    '--clue-w',
    '--clue-h',
    '--font-ui',
    '--font-clue',
    '--radius',
    '--radius-sm',
  ];
  for (const [k, v] of Object.entries(THEMES.day)) {
    assert.equal(props[k], v, `${k} in base.css`);
  }
  for (const k of Object.keys(props)) {
    assert.ok(k in THEMES.day || layout.includes(k), `${k} in base.css is not a theme token`);
  }
});
