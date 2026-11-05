import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The React Compiler rules of eslint-plugin-react-hooks are errors (no synchronous setState in effects, no impure
// calls or ref reads during render).
export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  // The reference keeps positional API arguments and omitted rest properties under an explicit underscore.
  { files: ['src/ref/**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }] } },
  globalIgnores(['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'])
]);
