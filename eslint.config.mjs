import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(
    ['**/*.snap', 'coverage', 'lib', 'node_modules', 'pnpm-lock.yaml'],
    'Global Ignores'
  ),
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    files: ['**/*.{js,ts}'],
    extends: [
      js.configs.recommended,
      // perfectionist.configs["recommended-natural"],
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.*s', 'bin/index.js']
        }
      }
    },
    rules: {
      // '@typescript-eslint/no-non-null-assertion': 'off'
    }
  }
);
