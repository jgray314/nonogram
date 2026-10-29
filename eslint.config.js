import js from '@eslint/js';
import globals from 'globals';

// Titles come from imported files; render text via textContent only.
const HTML_BANS = [
  { property: 'innerHTML', message: 'Use textContent / DOM APIs.' },
  { property: 'outerHTML', message: 'Use textContent / DOM APIs.' },
  { property: 'insertAdjacentHTML', message: 'Use textContent / DOM APIs.' },
];

const STORAGE_MESSAGE = 'Only src/store.js touches web storage.';
const STORAGE_NAMES = ['localStorage', 'sessionStorage'];
// Catches the property wherever it hangs (self.localStorage, an alias of window,
// document.defaultView.localStorage, top, parent), not only window and globalThis.
// A computed key built at run time still gets through: this guards against accidents.
const STORAGE_PATTERN = '/^(local|session)Storage$/';
const STORAGE_SYNTAX = [
  { selector: `MemberExpression[property.name=${STORAGE_PATTERN}]`, message: STORAGE_MESSAGE },
  {
    selector: `MemberExpression[computed=true][property.value=${STORAGE_PATTERN}]`,
    message: STORAGE_MESSAGE,
  },
];

// A later config object replaces an earlier one's options for the same rule,
// so the src/** object repeats HTML_BANS from this one shared constant.
const STORAGE_PROPERTY_BANS = ['globalThis', 'window'].flatMap((object) =>
  STORAGE_NAMES.map((property) => ({ object, property, message: STORAGE_MESSAGE })),
);

export default [
  // Agent worktrees are scratch copies of this repo, not part of it.
  { ignores: ['.claude/worktrees/**'] },
  js.configs.recommended,
  {
    // An inline /* eslint-disable */ comment must not switch a rule off.
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-properties': ['error', ...HTML_BANS],
    },
  },
  {
    files: ['src/**/*.{js,mjs,cjs}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...STORAGE_NAMES.map((name) => ({ name, message: STORAGE_MESSAGE })),
      ],
      'no-restricted-properties': ['error', ...HTML_BANS, ...STORAGE_PROPERTY_BANS],
      'no-restricted-syntax': ['error', ...STORAGE_SYNTAX],
      // A ratchet against growth, counting every line (docs/plans/line-cap-300.md lowers it).
      'max-lines': ['error', { max: 500 }],
    },
  },
  {
    // The one module allowed to touch storage; keeps the innerHTML ban.
    files: ['src/store.js'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-properties': ['error', ...HTML_BANS],
    },
  },
];
