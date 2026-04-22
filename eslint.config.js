import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', 'node_modules', 'playwright-report', '.features-gen'] },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // FSD Boundary Protections
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/features/*'],
              message: 'FSD Violation: The shared layer cannot import from higher layers (app or features).',
            }
          ]
        }
      ]
    }
  },
  {
    // Post-megabatch hardening: was previously scoped to just
    // `*.slice.*` / `*.types.*` files (roughly 0 files in this codebase),
    // which meant CLAUDE.md's "ESLint-enforced" claim for the
    // features → app boundary was effectively unenforced. Broaden to every
    // TS/TSX file in the features layer.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*'],
              message: 'FSD Violation: Features layer cannot import from app layer.',
            }
          ]
        }
      ]
    }
  }
);
