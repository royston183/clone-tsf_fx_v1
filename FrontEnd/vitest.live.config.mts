import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

// Read-only checks against the real SAP system through the SAP relay (npm run test:live). They never write to SAP.
export default defineConfig({
  resolve: { alias },
  // Verbose, so a skipped check shows why it was skipped.
  test: { environment: 'node', include: ['tests/live/**/*.test.ts'], setupFiles: ['tests/support/live-env.ts'], testTimeout: 60000, reporters: ['verbose'] }
});
