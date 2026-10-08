import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Titles come from imported files; render text via textContent only.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent / DOM APIs.' },
        { property: 'outerHTML', message: 'Use textContent / DOM APIs.' },
        { property: 'insertAdjacentHTML', message: 'Use textContent / DOM APIs.' },
      ],
    },
  },
];
