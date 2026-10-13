import globals from 'globals'
import type * as eslint from 'eslint-linter-browserify'

export const config: eslint.Linter.Config = {
  languageOptions: {
    sourceType: 'script',
    globals: {
      ...globals.browser,
    },
    parserOptions: {
      globalReturn: true,
      ecmaVersion: 2022,
      ecmaFeatures: {
        globalReturn: true,
      },
    },
  },
  rules: {
    'semi': ['error', 'never'],
    'quotes': ['error', 'single'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-restricted-properties': [
      'error',
      { property: 'innerHTML', message: 'Faille XSS potentielle : innerHTML est interdit.' },
      { property: 'outerHTML', message: 'Faille XSS potentielle : outerHTML est interdit.' },
      { object: 'document', message: 'L\'utilisation de document est interdite.' },
      { object: 'window', message: 'L\'utilisation de window est interdite.' },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="setTimeout"]',
        message: 'L\'utilisation de setTimeout est interdite.',
      },
      {
        selector: 'CallExpression[callee.name="setInterval"]',
        message: 'L\'utilisation de setInterval est interdite.',
      },
      {
        selector: 'CallExpression[callee.name="alert"]',
        message: 'L\'utilisation de alert est interdite.',
      },
      {
        selector: 'CallExpression[callee.name="fetch"]',
        message: 'L\'utilisation de fetch est interdite.',
      },
    ],
    'no-useless-return': 'off',
  },
}
