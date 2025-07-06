module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'commonjs'
  },
  rules: {
    // Code quality
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'no-console': 'off', // Allow console.log for Discord Status Fusion logging
    'prefer-const': 'error',
    'no-var': 'error',

    // Style
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],

    // Best practices
    'eqeqeq': 'error',
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { 'max': 2 }],
    'space-before-function-paren': ['error', 'never'],
    'keyword-spacing': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    '*.md',
    '*.json'
  ]
};