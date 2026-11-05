import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The core and its tests; `@/` is the FrontEnd's shared code (module definitions, fields, grids, reports).
export const alias = [
  { find: /^@\//, replacement: fileURLToPath(new URL('../FrontEnd/src/', import.meta.url)) },
  { find: /^@core\//, replacement: fileURLToPath(new URL('../FrontEnd/src/core/', import.meta.url)) }
];

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/support/setup.ts'],
    passWithNoTests: true,
    testTimeout: 15000
  }
});
