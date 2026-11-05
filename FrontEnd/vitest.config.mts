import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

// The template's own checks (tests/template) run from the repository root; an application copy has none.
const templateTests = existsSync(fileURLToPath(new URL('./tests/template', import.meta.url)));

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias },
  test: {
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 15000,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.{ts,tsx}'] } },
      ...(templateTests ? [{ extends: true, test: { name: 'template', include: ['tests/template/**/*.test.ts'], setupFiles: ['tests/template/setup.ts'] } }] : [])
    ]
  }
});
