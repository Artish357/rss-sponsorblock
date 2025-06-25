import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'storage/**', 'temp/**']
  },
  {
    files: ['**/*.js', '**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // Essential code quality rules
      'no-console': 'off', // We're a Node.js app, console is fine
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-duplicate-imports': 'error',
      
      // Basic formatting
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always']
    }
  },
  {
    files: ['**/*.js'],
    rules: {
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn'
    }
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.mocha // Covers describe, it, before, after, etc.
      }
    },
    rules: {
      'no-unused-expressions': 'off' // Common in tests
    }
  }
];