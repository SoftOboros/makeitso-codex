module.exports = {
  root: true,
  env: { node: true, es2021: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'prettier', 'header'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  ignorePatterns: ['dist/', '.makeitso/', 'protocol/**/*.md'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'prettier/prettier': 'error',
    'header/header': ['warn', 'block', ['/*', ' SPDX-License-Identifier: MIT', ' File: .*', ' Description: .*', '*/'], 2],
  },
  overrides: [
    { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-unused-vars': 'off' } },
  ],
};
