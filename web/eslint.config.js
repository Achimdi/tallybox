import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Note: eslint-plugin-jsx-a11y is left out on purpose. It does not support
// ESLint 10 and has had no release since 2024. Accessibility is covered by
// Radix primitives, role-based queries in tests, and manual checks.
export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    'src/lib/database.types.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The app has a logger with redaction. Raw console calls can leak personal data.
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'pwa-assets.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
])
