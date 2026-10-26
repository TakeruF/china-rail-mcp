import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['makers/public/*.js'], languageOptions: { globals: globals.browser } },
  prettier,
  {
    ignores: [
      'dist/',
      'coverage/',
      'fixtures/',
      'plugins/codex/server.mjs',
      'makers/.output/',
      '.edgeone/',
    ],
  },
];
